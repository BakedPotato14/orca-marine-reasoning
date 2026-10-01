"""
services/spatial_analysis.py
============================
ORCA ISRO Marine AI Platform — Spatial Analysis & PFZ Engine

Responsibilities:
  1. Parse & harmonize satellite ocean NetCDF datasets (SST, Waves, Chlorophyll-a).
  2. Detect oceanic thermal fronts using spatial gradient magnitude (∇SST).
  3. Delineate Potential Fishing Zones (PFZ) based on INCOIS / ISRO operational criteria:
       • Thermal fronts (gradient magnitude >= threshold)
       • Elevated Chlorophyll-a upwelling signature (chl >= 0.30 mg/m³)
       • Pelagic optimal SST window (27.0°C – 30.5°C)
  4. Classify Marine Safety Hazards based on Significant Wave Height (VHM0):
       • Safe (< 2.0 m)
       • Caution (2.0 – 2.5 m)
       • Rough Alert (2.5 – 3.5 m)
       • Very Rough / Danger (> 3.5 m)
  5. Provide GeoJSON features and regional statistical summaries.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import geopandas as gpd
import numpy as np
import xarray as xr
from shapely.geometry import Point, LineString, Polygon
from shapely.ops import unary_union

log = logging.getLogger("spatial_analysis")

# ---------------------------------------------------------------------------
# TTL Cache Infrastructure
# ---------------------------------------------------------------------------
_CACHE_TTL_SECONDS: float = 300.0  # 5 minutes

_pfz_cache: Dict[str, Any] = {"data": None, "ts": 0.0}
_safety_cache: Dict[str, Any] = {"data": None, "ts": 0.0}
_imbl_cache: Dict[str, Any] = {"data": None, "ts": 0.0}
_dataset_cache: Dict[str, Any] = {"data": None, "ts": 0.0}


def _is_cache_valid(cache_dict: Dict[str, Any]) -> bool:
    """Check if cached data is still within TTL."""
    return (time.time() - cache_dict["ts"]) < _CACHE_TTL_SECONDS and cache_dict["data"] is not None


def clear_all_caches() -> None:
    """Clear all computation caches. Called after data refresh."""
    global _pfz_cache, _safety_cache, _imbl_cache, _dataset_cache
    _pfz_cache = {"data": None, "ts": 0.0}
    _safety_cache = {"data": None, "ts": 0.0}
    _imbl_cache = {"data": None, "ts": 0.0}
    _dataset_cache = {"data": None, "ts": 0.0}
    log.info("🧹 All spatial analysis caches cleared")


def _smooth_2d(arr: np.ndarray, passes: int = 2) -> np.ndarray:
    """Pure NumPy 2D spatial smoothing filter (no scipy dependency)."""
    out = arr.copy()
    for _ in range(passes):
        padded = np.pad(out, pad_width=1, mode="edge")
        out = (
            padded[:-2, :-2] + 2 * padded[:-2, 1:-1] + padded[:-2, 2:] +
            2 * padded[1:-1, :-2] + 4 * padded[1:-1, 1:-1] + 2 * padded[1:-1, 2:] +
            padded[2:, :-2] + 2 * padded[2:, 1:-1] + padded[2:, 2:]
        ) / 16.0
    return out


def _interp_2d_numpy(
    src_arr: np.ndarray,
    src_lat: np.ndarray,
    src_lon: np.ndarray,
    dst_lat: np.ndarray,
    dst_lon: np.ndarray,
) -> np.ndarray:
    """Bilinear 2D interpolation using pure NumPy (no scipy dependency)."""
    # Ensure monotonically increasing for 1D interpolation
    lat_s = src_lat.copy()
    lon_s = src_lon.copy()
    arr_s = src_arr.copy()

    if len(lat_s) > 1 and lat_s[1] < lat_s[0]:
        lat_s = lat_s[::-1]
        arr_s = arr_s[::-1, :]
    if len(lon_s) > 1 and lon_s[1] < lon_s[0]:
        lon_s = lon_s[::-1]
        arr_s = arr_s[:, ::-1]

    # Interpolate along longitude (columns)
    interp_x = np.empty((len(lat_s), len(dst_lon)), dtype=np.float64)
    for i in range(len(lat_s)):
        interp_x[i] = np.interp(dst_lon, lon_s, arr_s[i])

    # Interpolate along latitude (rows)
    interp_xy = np.empty((len(dst_lat), len(dst_lon)), dtype=np.float64)
    for j in range(len(dst_lon)):
        interp_xy[:, j] = np.interp(dst_lat, lat_s, interp_x[:, j])

    return interp_xy

DATA_DIR = Path(__file__).parent.parent / "data"
SST_FILE = DATA_DIR / "indian_ocean_sst.nc"
WAVE_FILE = DATA_DIR / "indian_ocean_waves.nc"
CHL_FILE = DATA_DIR / "indian_ocean_chl.nc"
SYNTH_FILE = DATA_DIR / "ocean_data.nc"

# Major Indian Fishing Ports & Landing Centres for distance & bearing reference
INDIAN_PORTS = [
    {"name": "Veraval", "state": "Gujarat", "lat": 20.90, "lon": 70.37},
    {"name": "Porbandar", "state": "Gujarat", "lat": 21.64, "lon": 69.60},
    {"name": "Mumbai (Sassoon Dock)", "state": "Maharashtra", "lat": 18.91, "lon": 72.82},
    {"name": "Ratnagiri", "state": "Maharashtra", "lat": 16.98, "lon": 73.30},
    {"name": "Mormugao", "state": "Goa", "lat": 15.42, "lon": 73.80},
    {"name": "Mangalore (Old Port)", "state": "Karnataka", "lat": 12.86, "lon": 74.84},
    {"name": "Kochi (Thoppumpady)", "state": "Kerala", "lat": 9.94, "lon": 76.26},
    {"name": "Kollam (Neendakara)", "state": "Kerala", "lat": 8.94, "lon": 76.53},
    {"name": "Vizhinjam", "state": "Kerala", "lat": 8.38, "lon": 76.99},
    {"name": "Tuticorin", "state": "Tamil Nadu", "lat": 8.76, "lon": 78.13},
    {"name": "Chennai (Kasimedu)", "state": "Tamil Nadu", "lat": 13.12, "lon": 80.30},
    {"name": "Visakhapatnam", "state": "Andhra Pradesh", "lat": 17.70, "lon": 83.30},
    {"name": "Kakinada", "state": "Andhra Pradesh", "lat": 16.98, "lon": 82.25},
    {"name": "Paradip", "state": "Odisha", "lat": 20.32, "lon": 86.61},
]


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two points in km."""
    r = 6371.0
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlambda = np.radians(lon2 - lon1)
    a = np.sin(dphi / 2.0) ** 2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda / 2.0) ** 2
    return float(2 * r * np.arcsin(np.sqrt(np.clip(a, 0, 1))))


def _bearing_compass(lat1: float, lon1: float, lat2: float, lon2: float) -> str:
    """Calculate compass cardinal direction from point 1 (port) to point 2 (PFZ)."""
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dl = np.radians(lon2 - lon1)
    x = np.sin(dl) * np.cos(phi2)
    y = np.cos(phi1) * np.sin(phi2) - np.sin(phi1) * np.cos(phi2) * np.cos(dl)
    initial_bearing = np.degrees(np.arctan2(x, y))
    compass_bearing = (initial_bearing + 360) % 360
    directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    idx = int((compass_bearing + 11.25) / 22.5) % 16
    return directions[idx]


def _find_nearest_port(lat: float, lon: float) -> Dict[str, Any]:
    """Find the nearest Indian fishing harbour with distance and bearing."""
    nearest = None
    min_dist = float("inf")
    for port in INDIAN_PORTS:
        d = _haversine_km(port["lat"], port["lon"], lat, lon)
        if d < min_dist:
            min_dist = d
            nearest = port
    if nearest:
        bearing = _bearing_compass(nearest["lat"], nearest["lon"], lat, lon)
        return {
            "port_name": nearest["name"],
            "state": nearest["state"],
            "distance_km": round(min_dist, 1),
            "bearing_from_port": bearing,
        }
    return {"port_name": "Offshore", "state": "India", "distance_km": 0.0, "bearing_from_port": "N/A"}


# ---------------------------------------------------------------------------
# IMBL / EEZ Geofencing
# ---------------------------------------------------------------------------
IMBL_FILE = DATA_DIR / "imbl_boundary.geojson"
IMBL_ALERT_THRESHOLD_NM: float = 5.0  # Nautical miles
IMBL_ALERT_THRESHOLD_KM: float = IMBL_ALERT_THRESHOLD_NM * 1.852  # Convert NM to km


def _load_imbl_boundary() -> Optional[Any]:
    """Load and return the true IMBL boundary line (excluding domestic coastline)."""
    if not IMBL_FILE.exists():
        log.warning("IMBL boundary file not found: %s", IMBL_FILE)
        return None
    try:
        from shapely.geometry import LineString
        gdf = gpd.read_file(IMBL_FILE)
        if gdf.empty:
            log.warning("IMBL boundary file is empty")
            return None
        lines = []
        for geom in gdf.geometry.values:
            if hasattr(geom, "geoms"):
                for g in geom.geoms:
                    if hasattr(g, "exterior") and len(g.exterior.coords) > 38988:
                        lines.append(LineString(g.exterior.coords[38988:]).simplify(0.005))
                    elif hasattr(g, "exterior"):
                        lines.append(LineString(g.exterior.coords).simplify(0.005))
            elif hasattr(geom, "exterior") and len(geom.exterior.coords) > 38988:
                lines.append(LineString(geom.exterior.coords[38988:]).simplify(0.005))
            elif hasattr(geom, "exterior"):
                lines.append(LineString(geom.exterior.coords).simplify(0.005))
        if lines:
            return unary_union(lines)
        return unary_union(gdf.geometry.values)
    except Exception as exc:
        log.error("Failed to load IMBL boundary: %s", exc)
        return None


def reload_imbl_boundary() -> Optional[Any]:
    """Force reload the IMBL boundary from disk, clearing the cache."""
    global _IMBL_POLYGON
    _IMBL_POLYGON = None
    return _get_imbl_polygon()


_IMBL_POLYGON: Optional[Any] = None


def _get_imbl_polygon() -> Optional[Any]:
    """Lazy-load and cache the IMBL polygon."""
    global _IMBL_POLYGON
    if _IMBL_POLYGON is None:
        _IMBL_POLYGON = _load_imbl_boundary()
    return _IMBL_POLYGON


def distance_to_imbl_km(lat: float, lon: float) -> Optional[float]:
    """
    Calculate the minimum distance from a point (lat, lon) to the true IMBL boundary in kilometers.
    Returns None if IMBL boundary is not available.
    """
    boundary = _get_imbl_polygon()
    if boundary is None:
        return None
    point = Point(lon, lat)
    min_dist_deg = boundary.distance(point)
    return min_dist_deg * 111.0


def check_imbl_geofence(lat: float, lon: float) -> Dict[str, Any]:
    """
    Check if a vessel position is within the IMBL geofence alert zone (< 5 NM from boundary).
    Returns dict with alert status and distance info.
    """
    dist_km = distance_to_imbl_km(lat, lon)
    if dist_km is None:
        return {
            "alert": False,
            "distance_km": None,
            "distance_nm": None,
            "status": "IMBL boundary unavailable",
        }
    dist_nm = dist_km / 1.852
    is_alert = dist_km < IMBL_ALERT_THRESHOLD_KM
    return {
        "alert": is_alert,
        "distance_km": round(dist_km, 2),
        "distance_nm": round(dist_nm, 2),
        "threshold_nm": IMBL_ALERT_THRESHOLD_NM,
        "status": "GEOFENCE ALERT" if is_alert else "SAFE",
        "message": (
            f"Vessel is {round(dist_nm, 1)} NM from IMBL boundary. "
            f"{'IMMEDIATE COURSE CORRECTION REQUIRED.' if is_alert else 'Safe distance from maritime boundary.'}"
        ),
    }


def compute_imbl_geofence_alerts(pfz_features: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    """
    Evaluate IMBL geofence proximity for all PFZ hotspots and major ports.
    Returns list of geofence alerts for positions near the maritime boundary.
    
    Args:
        pfz_features: Optional pre-computed PFZ features to avoid redundant computation.
    Uses TTL cache for performance.
    """
    global _imbl_cache
    if _is_cache_valid(_imbl_cache):
        log.debug("Returning cached IMBL geofence alerts")
        return _imbl_cache["data"]

    alerts: List[Dict[str, Any]] = []
    polygon = _get_imbl_polygon()
    if polygon is None:
        log.warning("IMBL boundary not available for geofence check")
        _imbl_cache["data"] = alerts
        _imbl_cache["ts"] = time.time()
        return alerts

    # Use provided PFZ features or compute them
    if pfz_features is None:
        pfz_features = compute_pfz_features()

    # Check PFZ hotspots
    for pfz in pfz_features:
        check = check_imbl_geofence(pfz["latitude"], pfz["longitude"])
        if check["alert"]:
            alerts.append({
                "type": "PFZ_GEOFENCE",
                "reference_id": pfz["id"],
                "reference_type": "PFZ Hotspot",
                "latitude": pfz["latitude"],
                "longitude": pfz["longitude"],
                "distance_nm": check["distance_nm"],
                "status": check["status"],
                "message": check["message"],
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            })

    # Check major ports
    for port in INDIAN_PORTS:
        check = check_imbl_geofence(port["lat"], port["lon"])
        if check["alert"]:
            alerts.append({
                "type": "PORT_GEOFENCE",
                "reference_id": port["name"],
                "reference_type": "Fishing Harbour",
                "latitude": port["lat"],
                "longitude": port["lon"],
                "distance_nm": check["distance_nm"],
                "status": check["status"],
                "message": check["message"],
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            })

    _imbl_cache["data"] = alerts
    _imbl_cache["ts"] = time.time()
    return alerts


class SpatialDataManager:
    """Loads and caches surface datasets for analysis."""

    def __init__(self):
        self._sst_ds: Optional[xr.Dataset] = None
        self._wave_ds: Optional[xr.Dataset] = None
        self._chl_ds: Optional[xr.Dataset] = None
        self._cached_data: Optional[Dict[str, Any]] = None

    def load_datasets(self) -> Dict[str, Any]:
        """
        Load live datasets or fallback to synthetic if not available.
        Returns extracted 2D numpy arrays with corresponding lats and lons.
        Uses TTL cache to avoid repeated disk reads.
        """
        global _dataset_cache
        if _is_cache_valid(_dataset_cache):
            log.debug("Returning cached dataset")
            return _dataset_cache["data"]

        log.info("🔄 Loading datasets from disk...")
        # --- 1. Sea Surface Temperature ---
        sst_loaded = False
        if SST_FILE.exists() and SST_FILE.stat().st_size > 0:
            try:
                ds_sst = xr.open_dataset(SST_FILE)
                var_name = "thetao" if "thetao" in ds_sst else ("tos" if "tos" in ds_sst else list(ds_sst.data_vars)[0])
                da_sst = ds_sst[var_name]
                while da_sst.ndim > 2:
                    da_sst = da_sst.isel({da_sst.dims[0]: 0})
                sst_lats = ds_sst["latitude"].values
                sst_lons = ds_sst["longitude"].values
                sst_vals = da_sst.values
                sst_loaded = True
            except Exception as exc:
                log.warning("Could not read live SST NetCDF (%s), falling back to synthetic.", exc)

        if not sst_loaded:
            if SYNTH_FILE.exists():
                ds_syn = xr.open_dataset(SYNTH_FILE)
                sst_vals = ds_syn["sst"].values
                sst_lats = ds_syn["latitude"].values
                sst_lons = ds_syn["longitude"].values
            else:
                raise FileNotFoundError("Neither live SST NetCDF nor synthetic NetCDF found.")

        # --- 2. Significant Wave Height ---
        wave_loaded = False
        if WAVE_FILE.exists() and WAVE_FILE.stat().st_size > 0:
            try:
                ds_wave = xr.open_dataset(WAVE_FILE)
                var_name = "VHM0" if "VHM0" in ds_wave else list(ds_wave.data_vars)[0]
                da_wave = ds_wave[var_name]
                while da_wave.ndim > 2:
                    da_wave = da_wave.isel({da_wave.dims[0]: 0})
                wave_lats = ds_wave["latitude"].values
                wave_lons = ds_wave["longitude"].values
                wave_vals = da_wave.values
                wave_loaded = True
            except Exception as exc:
                log.warning("Could not read live Wave NetCDF (%s), falling back to synthetic.", exc)

        if not wave_loaded:
            if SYNTH_FILE.exists():
                ds_syn = xr.open_dataset(SYNTH_FILE)
                wave_vals = ds_syn["wave_height"].values
                wave_lats = ds_syn["latitude"].values
                wave_lons = ds_syn["longitude"].values
            else:
                wave_vals = np.full_like(sst_vals, 1.5)
                wave_lats, wave_lons = sst_lats, sst_lons

        # --- 3. Chlorophyll-a ---
        chl_loaded = False
        if CHL_FILE.exists() and CHL_FILE.stat().st_size > 0:
            try:
                ds_chl = xr.open_dataset(CHL_FILE)
                var_name = "chl" if "chl" in ds_chl else ("phyc" if "phyc" in ds_chl else list(ds_chl.data_vars)[0])
                da_chl = ds_chl[var_name]
                while da_chl.ndim > 2:
                    da_chl = da_chl.isel({da_chl.dims[0]: 0})
                chl_lats = ds_chl["latitude"].values
                chl_lons = ds_chl["longitude"].values
                chl_vals = da_chl.values
                chl_loaded = True
            except Exception as exc:
                log.warning("Could not read live Chl NetCDF (%s), falling back to synthetic.", exc)

        if not chl_loaded:
            if SYNTH_FILE.exists():
                ds_syn = xr.open_dataset(SYNTH_FILE)
                chl_vals = ds_syn["chl"].values
                chl_lats = ds_syn["latitude"].values
                chl_lons = ds_syn["longitude"].values
            else:
                chl_vals = np.full_like(sst_vals, 0.4)
                chl_lats, chl_lons = sst_lats, sst_lons

        result = {
            "sst": {"values": sst_vals, "lats": sst_lats, "lons": sst_lons},
            "waves": {"values": wave_vals, "lats": wave_lats, "lons": wave_lons},
            "chl": {"values": chl_vals, "lats": chl_lats, "lons": chl_lons},
        }

        _dataset_cache["data"] = result
        _dataset_cache["ts"] = time.time()
        return result

    def reload(self) -> Dict[str, Any]:
        """Force reload datasets from disk, bypassing cache."""
        global _dataset_cache
        _dataset_cache = {"data": None, "ts": 0.0}
        return self.load_datasets()


# Singleton manager
data_manager = SpatialDataManager()


def compute_pfz_features() -> List[Dict[str, Any]]:
    """
    Identifies Potential Fishing Zones (PFZ) by combining:
      1. Thermal front detection (high horizontal SST gradient ∇SST).
      2. Chlorophyll-a upwelling enrichment (interpolated to SST grid).
      3. Pelagic SST optimal thermal comfort range (27.0°C - 30.5°C).

    Returns a list of structured PFZ hotspot features.
    Uses TTL cache for performance.
    """
    global _pfz_cache
    if _is_cache_valid(_pfz_cache):
        log.debug("Returning cached PFZ features")
        return _pfz_cache["data"]

    data = data_manager.load_datasets()
    sst_obj = data["sst"]
    chl_obj = data["chl"]

    sst_vals = sst_obj["values"].astype(np.float64)
    sst_lats = sst_obj["lats"]
    sst_lons = sst_obj["lons"]

    # Fill NaN for land/islands with local interpolation for gradient calculation
    nan_mask = np.isnan(sst_vals)
    valid_sst = np.where(nan_mask, np.nanmean(sst_vals), sst_vals)

    # Smooth slightly to remove high-frequency satellite noise and enhance fronts
    smoothed_sst = _smooth_2d(valid_sst, passes=2)

    # Compute spatial gradient magnitude
    grad_y, grad_x = np.gradient(smoothed_sst)
    grad_mag = np.sqrt(grad_x**2 + grad_y**2)
    grad_mag[nan_mask] = 0.0

    # Resample / interpolate Chlorophyll to match SST grid
    chl_vals = chl_obj["values"].astype(np.float64)
    chl_lats = chl_obj["lats"]
    chl_lons = chl_obj["lons"]

    # Bilinear interpolation of Chlorophyll onto SST grid using pure NumPy
    chl_clean = np.nan_to_num(chl_vals, nan=float(np.nanmean(chl_vals)))
    chl_on_sst_grid = _interp_2d_numpy(chl_clean, chl_lats, chl_lons, sst_lats, sst_lons)
    chl_on_sst_grid = np.nan_to_num(chl_on_sst_grid, nan=0.25)

    # PFZ Criteria Scores:
    # 1. Thermal front score (gradient >= 0.06 deg/grid_step is significant)
    front_score = np.clip(grad_mag / 0.15, 0.0, 1.0)

    # 2. Chlorophyll score (0.25 to 2.5 mg/m³ is optimal; >3.0 can indicate hypoxic/eutrophic bloom)
    chl_score = np.clip((chl_on_sst_grid - 0.20) / 1.5, 0.0, 1.0)

    # 3. SST optimal window score (bell curve centered at 28.5°C, width 2.5°C)
    sst_score = np.exp(-((sst_vals - 28.5) ** 2) / 6.0)
    sst_score = np.where(nan_mask, 0.0, sst_score)

    # Composite PFZ suitability index (0 to 100%)
    composite_pfz = (0.45 * front_score + 0.35 * chl_score + 0.20 * sst_score) * 100.0
    composite_pfz[nan_mask] = 0.0

    # Vectorized extraction of hotspots above threshold
    step = 5
    # Create valid mask for threshold and non-NaN
    valid_mask = (composite_pfz >= 55.0) & ~nan_mask
    # Apply stride sampling
    stride_mask = np.zeros_like(valid_mask, dtype=bool)
    stride_mask[step:-step:step, step:-step:step] = True
    candidate_mask = valid_mask & stride_mask

    # Get candidate indices using vectorized operation
    candidate_indices = np.argwhere(candidate_mask)

    features: List[Dict[str, Any]] = []

    def _recommend_species(s_val: float, c_val: float) -> str:
        if c_val > 1.2 and s_val < 28.5:
            return "Indian Mackerel (Rastrelliger kanagurta), Oil Sardine (Sardinella longiceps)"
        elif s_val >= 28.5 and c_val >= 0.4:
            return "Yellowfin Tuna (Thunnus albacares), Skipjack Tuna (Katsuwonus pelamis)"
        elif c_val >= 0.6:
            return "Carangids (Trevally), Ribbonfish, Anchovies"
        else:
            return "Pelagic mixed shoals (Coastal Tuna, Sardine)"

    for i, j in candidate_indices:
        score = float(composite_pfz[i, j])
        lat = float(sst_lats[i])
        lon = float(sst_lons[j])
        s_val = float(sst_vals[i, j])
        c_val = float(chl_on_sst_grid[i, j])
        g_val = float(grad_mag[i, j])

        port_info = _find_nearest_port(lat, lon)

        if score >= 75.0:
            category = "High Probability"
            color = "#00e676"
        elif score >= 65.0:
            category = "Moderate Probability"
            color = "#ffea00"
        else:
            category = "Promising Edge"
            color = "#00b0ff"

        features.append({
            "id": f"PFZ-{len(features)+1:03d}",
            "latitude": round(lat, 3),
            "longitude": round(lon, 3),
            "pfz_score": round(score, 1),
            "category": category,
            "color": color,
            "sst_celsius": round(s_val, 2),
            "chl_mg_m3": round(c_val, 3),
            "front_gradient": round(g_val, 3),
            "target_species": _recommend_species(s_val, c_val),
            "nearest_port": port_info["port_name"],
            "state": port_info["state"],
            "distance_km": port_info["distance_km"],
            "bearing": port_info["bearing_from_port"],
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        })

    features.sort(key=lambda x: x["pfz_score"], reverse=True)

    _pfz_cache["data"] = features
    _pfz_cache["ts"] = time.time()
    return features


def compute_safety_alerts() -> List[Dict[str, Any]]:
    """
    Evaluates wave heights (VHM0) across Indian coastal sectors
    and generates marine hazard advisories.
    Uses TTL cache for performance.
    """
    global _safety_cache
    if _is_cache_valid(_safety_cache):
        log.debug("Returning cached safety alerts")
        return _safety_cache["data"]

    data = data_manager.load_datasets()
    wave_obj = data["waves"]
    wave_vals = wave_obj["values"]
    wave_lats = wave_obj["lats"]
    wave_lons = wave_obj["lons"]

    # Sectors along Indian coastline
    sectors = [
        {"sector": "Gujarat Coast", "lat_min": 20.0, "lat_max": 24.0, "lon_min": 68.0, "lon_max": 72.5},
        {"sector": "Maharashtra / Konkan Coast", "lat_min": 16.0, "lat_max": 20.0, "lon_min": 71.5, "lon_max": 73.5},
        {"sector": "Goa & Karnataka Coast", "lat_min": 12.5, "lat_max": 16.0, "lon_min": 73.0, "lon_max": 75.0},
        {"sector": "Kerala / Malabar Coast", "lat_min": 8.0, "lat_max": 12.5, "lon_min": 74.5, "lon_max": 77.5},
        {"sector": "Gulf of Mannar & Coromandel", "lat_min": 8.0, "lat_max": 13.5, "lon_min": 78.0, "lon_max": 81.0},
        {"sector": "Andhra Pradesh Coast", "lat_min": 13.5, "lat_max": 18.5, "lon_min": 80.0, "lon_max": 84.5},
        {"sector": "Odisha & West Bengal Coast", "lat_min": 18.5, "lat_max": 22.0, "lon_min": 84.5, "lon_max": 89.0},
    ]

    alerts: List[Dict[str, Any]] = []

    for s in sectors:
        # Mask sector bounds
        lat_mask = (wave_lats >= s["lat_min"]) & (wave_lats <= s["lat_max"])
        lon_mask = (wave_lons >= s["lon_min"]) & (wave_lons <= s["lon_max"])

        sub_waves = wave_vals[np.ix_(lat_mask, lon_mask)]
        if sub_waves.size == 0 or np.all(np.isnan(sub_waves)):
            continue

        max_wave = float(np.nanmax(sub_waves))
        mean_wave = float(np.nanmean(sub_waves))

        # Severity grading
        if max_wave >= 3.5:
            severity = "DANGER"
            color = "#ff1744"
            advisory = "High Sea Alert: Fishermen are strictly advised NOT to venture into the sea. Small boats must return to harbor."
        elif max_wave >= 2.5:
            severity = "ROUGH ALERT"
            color = "#ff9100"
            advisory = "Rough Sea Alert: Traditional crafts and small mechanised boats should exercise extreme caution. Deep-sea fishing not advised."
        elif max_wave >= 2.0:
            severity = "CAUTION"
            color = "#ffd600"
            advisory = "Moderate Sea: Suitable for larger vessels; small crafts advise remaining vigilant."
        else:
            severity = "NORMAL"
            color = "#00e676"
            advisory = "Calm to Moderate: Normal fishing activities safe across the coastal sector."

        alerts.append({
            "sector": s["sector"],
            "max_wave_height_m": round(max_wave, 2),
            "mean_wave_height_m": round(mean_wave, 2),
            "severity": severity,
            "color": color,
            "advisory": advisory,
            "center_lat": round((s["lat_min"] + s["lat_max"]) / 2, 2),
            "center_lon": round((s["lon_min"] + s["lon_max"]) / 2, 2),
            "bounds": [[s["lat_min"], s["lon_min"]], [s["lat_max"], s["lon_max"]]],
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        })

    _safety_cache["data"] = alerts
    _safety_cache["ts"] = time.time()
    return alerts


def get_marine_summary() -> Dict[str, Any]:
    """
    Returns an aggregated geospatial summary report for the API and dashboard.
    """
    data = data_manager.load_datasets()
    sst_vals = data["sst"]["values"]
    wave_vals = data["waves"]["values"]
    chl_vals = data["chl"]["values"]

    pfz_features = compute_pfz_features()
    alerts = compute_safety_alerts()
    # Pass pfz_features to avoid redundant computation
    imbl_alerts = compute_imbl_geofence_alerts(pfz_features=pfz_features)

    highest_alert = "NORMAL"
    alert_color = "#00e676"
    for a in alerts:
        if a["severity"] == "DANGER":
            highest_alert = "DANGER"
            alert_color = "#ff1744"
            break
        elif a["severity"] == "ROUGH ALERT" and highest_alert != "DANGER":
            highest_alert = "ROUGH ALERT"
            alert_color = "#ff9100"
        elif a["severity"] == "CAUTION" and highest_alert not in ["DANGER", "ROUGH ALERT"]:
            highest_alert = "CAUTION"
            alert_color = "#ffd600"

    # Include IMBL geofence alerts in overall status
    if imbl_alerts:
        if highest_alert not in ["DANGER", "ROUGH ALERT"]:
            highest_alert = "GEOFENCE ALERT"
            alert_color = "#ff1744"

    return {
        "status": "online",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "region": "Indian Coastal Waters & Exclusive Economic Zone (EEZ)",
        "bounding_box": {"min_lon": 65.0, "max_lon": 90.0, "min_lat": 5.0, "max_lat": 25.0},
        "sst": {
            "min_celsius": round(float(np.nanmin(sst_vals)), 2),
            "max_celsius": round(float(np.nanmax(sst_vals)), 2),
            "mean_celsius": round(float(np.nanmean(sst_vals)), 2),
            "depth": "0.494 m (surface)",
        },
        "waves": {
            "min_height_m": round(float(np.nanmin(wave_vals)), 2),
            "max_height_m": round(float(np.nanmax(wave_vals)), 2),
            "mean_height_m": round(float(np.nanmean(wave_vals)), 2),
            "depth": "0 m (surface)",
        },
        "chlorophyll": {
            "min_mg_m3": round(float(np.nanmin(chl_vals)), 3),
            "max_mg_m3": round(float(np.nanmax(chl_vals)), 3),
            "mean_mg_m3": round(float(np.nanmean(chl_vals)), 3),
            "depth": "0.494 m (surface)",
        },
        "pfz": {
            "total_detected_hotspots": len(pfz_features),
            "high_probability_count": sum(1 for f in pfz_features if f["category"] == "High Probability"),
            "moderate_probability_count": sum(1 for f in pfz_features if f["category"] == "Moderate Probability"),
            "top_hotspot": pfz_features[0] if pfz_features else None,
        },
        "marine_safety": {
            "overall_status": highest_alert,
            "status_color": alert_color,
            "active_sectors_evaluated": len(alerts),
            "sectors_under_alert": sum(1 for a in alerts if a["severity"] in ["ROUGH ALERT", "DANGER"]),
            "imbl_geofence_alerts": len(imbl_alerts),
            "imbl_alert_details": imbl_alerts,
        },
    }
