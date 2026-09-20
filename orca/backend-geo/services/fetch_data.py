"""
services/fetch_data.py
======================
ORCA ISRO Marine AI Platform — Geospatial Data Pipeline
Lead Geospatial Data Engineer module.

Responsibilities:
  1. Fetch Near-Real-Time SURFACE-ONLY ocean parameters from Copernicus Marine:
       • Sea Surface Temperature  (SST)       — thetao @ depth 0–1 m
       • Significant Wave Height & Direction  — VHM0 + VMDR
       • Chlorophyll-a Concentration          — chl @ depth 0–1 m
  2. Apply robust variable / depth fallbacks if dataset names shift.
  3. Generate a synthetic NetCDF fallback (data/ocean_data.nc) with all
     three surface variables when the live API is unavailable, so that
     the Folium map and FastAPI server never crash.

Outputs
-------
  data/indian_ocean_sst.nc   — SST surface subset (live or synthetic)
  data/indian_ocean_waves.nc — Wave Height + Direction subset (live or synthetic)
  data/indian_ocean_chl.nc   — Chlorophyll-a subset (live or synthetic)
  data/ocean_data.nc         — Merged fallback written when any live download fails
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import xarray as xr

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("fetch_data")

# ---------------------------------------------------------------------------
# Constants — Indian Waters bounding box & surface depth slice
# ---------------------------------------------------------------------------
MIN_LON: float = 65.0   # West
MAX_LON: float = 90.0   # East
MIN_LAT: float = 5.0    # South
MAX_LAT: float = 25.0   # North

# Surface-only: restrict depth to top 1 metre for all 3D datasets
MIN_DEPTH: float = 0.494
MAX_DEPTH: float = 1.0

TODAY:    str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
START_DT: str = f"{TODAY} 00:00:00"
END_DT:   str = f"{TODAY} 23:59:59"

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

SST_FILE   = DATA_DIR / "indian_ocean_sst.nc"
WAVE_FILE  = DATA_DIR / "indian_ocean_waves.nc"
CHL_FILE   = DATA_DIR / "indian_ocean_chl.nc"
SYNTH_FILE = DATA_DIR / "ocean_data.nc"

# ---------------------------------------------------------------------------
# Copernicus dataset / variable configuration
# ---------------------------------------------------------------------------
SST_DATASET_ID  = "cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m"   # dedicated thetao sub-product
WAVE_DATASET_ID = "cmems_mod_glo_wav_anfc_0.083deg_PT3H-i"
CHL_DATASET_ID  = "cmems_mod_glo_bgc-pft_anfc_0.25deg_P1D-m"       # PFT sub-product (contains chl & phyc)

# SST candidates — thetao is the primary variable in the dedicated sub-product
SST_VAR_CANDIDATES: list[str] = ["thetao", "tos", "sea_water_potential_temperature"]

# Wave variables (wave datasets have no depth dimension)
WAVE_VARS: list[str] = ["VHM0", "VMDR"]

# Chlorophyll candidates — PFT sub-product exposes 'chl'
CHL_VAR_CANDIDATES: list[str] = ["chl", "CHL", "phyc", "chlor_a"]


# ---------------------------------------------------------------------------
# Credential check (env vars OR cached `copernicusmarine login`)
# ---------------------------------------------------------------------------
def _credentials_present() -> bool:
    """
    Returns True if Copernicus Marine credentials are available via either:
      1. Environment variables (COPERNICUSMARINE_SERVICE_USERNAME / PASSWORD)
      2. Local credentials cache written by `copernicusmarine login`
         (~/.copernicusmarine/.copernicusmarine-credentials)
    """
    user = os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME", "").strip()
    pwd  = os.environ.get("COPERNICUSMARINE_SERVICE_PASSWORD", "").strip()
    if user and pwd:
        log.info("Copernicus credentials found via environment variables.")
        return True

    creds_file = Path.home() / ".copernicusmarine" / ".copernicusmarine-credentials"
    if creds_file.exists() and creds_file.stat().st_size > 0:
        log.info("Copernicus credentials found via cached login: %s", creds_file)
        return True

    log.warning(
        "No Copernicus credentials found. Run `copernicusmarine login` or set "
        "COPERNICUSMARINE_SERVICE_USERNAME / COPERNICUSMARINE_SERVICE_PASSWORD. "
        "Falling back to synthetic data."
    )
    return False


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _base_kwargs(dataset_id: str, output_filename: str, *, with_depth: bool = True) -> dict:
    """
    Build the shared copernicusmarine.subset() keyword arguments.
    Pass with_depth=False for wave datasets that have no depth dimension.
    NOTE: 'force_download' is deprecated and intentionally omitted.
    'overwrite=True' ensures existing files are replaced rather than creating '_(1).nc' duplicates.
    """
    kw = dict(
        dataset_id=dataset_id,
        minimum_longitude=MIN_LON,
        maximum_longitude=MAX_LON,
        minimum_latitude=MIN_LAT,
        maximum_latitude=MAX_LAT,
        start_datetime=START_DT,
        end_datetime=END_DT,
        output_filename=output_filename,
        output_directory=str(DATA_DIR),
        overwrite=True,
    )
    if with_depth:
        kw["minimum_depth"] = MIN_DEPTH
        kw["maximum_depth"] = MAX_DEPTH
    return kw


# ---------------------------------------------------------------------------
# Live download — SST (surface thetao, depth 0–1 m)
# ---------------------------------------------------------------------------
def _download_sst_live() -> Path:
    """
    Download Sea Surface Temperature from cmems_mod_glo_phy_anfc_0.083deg_P1D-m.
    Uses depth constraint (0.494–1 m) to guarantee surface-only extraction.
    Tries each variable in SST_VAR_CANDIDATES; falls back to all-variables
    subset if every named variable is rejected by the API.
    """
    import copernicusmarine  # lazy import — module loads without it installed

    log.info("Downloading SST (surface, depth 0–1 m) from Copernicus ...")
    kwargs = _base_kwargs(SST_DATASET_ID, SST_FILE.name, with_depth=True)

    for var in SST_VAR_CANDIDATES:
        try:
            log.info("   Trying SST variable '%s' ...", var)
            copernicusmarine.subset(variables=[var], **kwargs)
            log.info("SST downloaded  ✓  variable='%s'  depth=0–1 m", var)
            return SST_FILE
        except Exception as exc:
            log.debug("   SST variable '%s' rejected: %s", var, exc)

    # Last resort — no variable filter; still apply depth constraint
    log.warning(
        "   All named SST variables failed. "
        "Downloading full surface subset (no variable filter, depth 0–1 m) ..."
    )
    copernicusmarine.subset(**kwargs)
    log.info("SST downloaded (all surface variables).")
    return SST_FILE


# ---------------------------------------------------------------------------
# Live download — Waves (VHM0 + VMDR, no depth dimension)
# ---------------------------------------------------------------------------
def _download_waves_live() -> Path:
    """
    Download Significant Wave Height (VHM0) and Mean Wave Direction (VMDR)
    from cmems_mod_glo_wav_anfc_0.083deg_PT3H-i.
    Wave datasets are surface-only by definition — no depth parameter needed.
    """
    import copernicusmarine

    log.info("Downloading Wave Height + Direction from Copernicus ...")
    kwargs = _base_kwargs(WAVE_DATASET_ID, WAVE_FILE.name, with_depth=False)

    try:
        copernicusmarine.subset(variables=WAVE_VARS, **kwargs)
        log.info("Wave data downloaded  ✓  variables=%s", WAVE_VARS)
    except Exception as exc:
        # Try VHM0 alone if VMDR causes issues
        log.warning("   VHM0+VMDR download failed (%s). Retrying with VHM0 only ...", exc)
        try:
            copernicusmarine.subset(variables=["VHM0"], **kwargs)
            log.info("Wave data downloaded  ✓  variable='VHM0' only")
        except Exception as exc2:
            log.warning("   VHM0-only also failed (%s). Downloading full wave subset ...", exc2)
            copernicusmarine.subset(**kwargs)
            log.info("Wave data downloaded (all wave variables).")

    return WAVE_FILE


# ---------------------------------------------------------------------------
# Live download — Chlorophyll-a (surface chl, depth 0–1 m)
# ---------------------------------------------------------------------------
def _download_chl_live() -> Path:
    """
    Download Chlorophyll-a Concentration from cmems_mod_glo_bgc_anfc_0.25deg_P1D-m.
    Applies depth constraint (0.494–1 m) to extract surface phytoplankton signal.
    """
    import copernicusmarine

    log.info("Downloading Chlorophyll-a (surface, depth 0–1 m) from Copernicus ...")
    kwargs = _base_kwargs(CHL_DATASET_ID, CHL_FILE.name, with_depth=True)

    for var in CHL_VAR_CANDIDATES:
        try:
            log.info("   Trying Chl variable '%s' ...", var)
            copernicusmarine.subset(variables=[var], **kwargs)
            log.info("Chl downloaded  ✓  variable='%s'  depth=0–1 m", var)
            return CHL_FILE
        except Exception as exc:
            log.debug("   Chl variable '%s' rejected: %s", var, exc)

    # Last resort
    log.warning(
        "   All named Chl variables failed. "
        "Downloading full BGC surface subset (no variable filter, depth 0–1 m) ..."
    )
    copernicusmarine.subset(**kwargs)
    log.info("Chl downloaded (all BGC surface variables).")
    return CHL_FILE


# ---------------------------------------------------------------------------
# Synthetic fallback — SST + Wave Height + Chlorophyll-a
# ---------------------------------------------------------------------------
def _generate_synthetic_nc() -> Path:
    """
    Build a realistic synthetic NetCDF covering Indian Waters (65–90 E, 5–25 N)
    with three surface variables:
      * sst         — Sea Surface Temperature (°C),  tropical gradient + noise
      * wave_height — Significant Wave Height (m),   monsoonal SW swell pattern
      * chl         — Chlorophyll-a (mg/m³),         coastal upwelling signature

    Returns path to the written SYNTH_FILE.
    """
    log.info("Generating synthetic fallback NetCDF: %s", SYNTH_FILE)

    rng      = np.random.default_rng(seed=42)
    lons     = np.linspace(MIN_LON, MAX_LON, 100)
    lats     = np.linspace(MIN_LAT, MAX_LAT, 80)
    lon_g, lat_g = np.meshgrid(lons, lats)

    # --- SST: warm tropical baseline 27–30 °C, slight northward cooling ---
    sst = (30.0 - 0.15 * (lat_g - MIN_LAT) + rng.normal(0, 0.3, lat_g.shape)).astype(np.float32)

    # --- Waves: SW monsoon swell, higher in Arabian Sea ---
    waves = np.clip(
        1.5 + 0.03 * (MAX_LON - lon_g) + 0.02 * (lat_g - MIN_LAT)
        + rng.normal(0, 0.1, lat_g.shape),
        0.2, 6.0,
    ).astype(np.float32)

    # --- Chl: coastal upwelling enrichment near Indian & Sri Lankan coasts ---
    # Elevated near lon edges (upwelling) and near equatorial region
    chl_base  = 0.3 + 0.8 * np.exp(-((lon_g - 68) ** 2) / 50)   # Arabian Sea bloom
    chl_base += 0.5 * np.exp(-((lon_g - 82) ** 2) / 30)           # Bay of Bengal bloom
    chl_base += 0.2 * np.exp(-((lat_g - 10) ** 2) / 20)           # equatorial band
    chl       = np.clip(chl_base + rng.normal(0, 0.05, chl_base.shape), 0.01, 5.0).astype(np.float32)

    ds = xr.Dataset(
        {
            "sst": xr.DataArray(
                sst,
                dims=["latitude", "longitude"],
                attrs={
                    "units":         "degrees_Celsius",
                    "long_name":     "Sea Surface Temperature (synthetic)",
                    "standard_name": "sea_surface_temperature",
                    "depth":         "0 m (surface)",
                },
            ),
            "wave_height": xr.DataArray(
                waves,
                dims=["latitude", "longitude"],
                attrs={
                    "units":         "m",
                    "long_name":     "Significant Wave Height (synthetic)",
                    "standard_name": "sea_surface_wave_significant_height",
                    "depth":         "surface",
                },
            ),
            "chl": xr.DataArray(
                chl,
                dims=["latitude", "longitude"],
                attrs={
                    "units":         "mg m-3",
                    "long_name":     "Chlorophyll-a Concentration (synthetic)",
                    "standard_name": "mass_concentration_of_chlorophyll_a_in_sea_water",
                    "depth":         "0 m (surface)",
                },
            ),
        },
        coords={
            "longitude": xr.DataArray(lons, dims=["longitude"], attrs={"units": "degrees_east"}),
            "latitude":  xr.DataArray(lats, dims=["latitude"],  attrs={"units": "degrees_north"}),
        },
        attrs={
            "title":        "ORCA — Synthetic Indian Ocean Surface Data",
            "source":       "Procedurally generated fallback (Copernicus unavailable)",
            "created":      datetime.now(timezone.utc).isoformat(),
            "bounding_box": f"lon [{MIN_LON}, {MAX_LON}], lat [{MIN_LAT}, {MAX_LAT}]",
            "depth_range":  f"{MIN_DEPTH}–{MAX_DEPTH} m (surface only)",
        },
    )

    ds.to_netcdf(SYNTH_FILE)
    log.info(
        "Synthetic NetCDF written -> %s  (%.1f KB)",
        SYNTH_FILE, SYNTH_FILE.stat().st_size / 1024,
    )
    return SYNTH_FILE


# ---------------------------------------------------------------------------
# Verification — summary table
# ---------------------------------------------------------------------------
_UNITS_MAP = {
    "thetao": "°C",   "tos": "°C",     "sst": "°C",
    "VHM0":   "m",    "VMDR": "°",
    "chl":    "mg/m³","chlor_a": "mg/m³", "phyc": "mmol/m³",
    "wave_height": "m",
    "sea_water_potential_temperature": "°C",
}

def _print_summary_table(path: Path, label: str) -> None:
    """Print a formatted summary table: Variable | Depth | Min | Max | Units."""
    try:
        ds = xr.open_dataset(path)
        header = f"\n{'─'*72}\n  [{label}]  {path.name}\n{'─'*72}"
        log.info(header)
        log.info(
            "  %-28s %-16s %8s %8s  %s",
            "Variable", "Surface Depth", "Min", "Max", "Units",
        )
        log.info("  " + "─" * 68)

        depth_str = "0 m (surface)"
        if "depth" in ds.coords:
            d_val = ds.coords["depth"].values
            if hasattr(d_val, "__len__") and len(d_val) > 0:
                depth_str = f"{float(d_val[0]):.3f} m (surface)"
            else:
                depth_str = f"{float(d_val):.3f} m (surface)"

        for var in ds.data_vars:
            arr   = ds[var].values
            attrs = ds[var].attrs
            var_depth = attrs.get("depth", depth_str)
            units = attrs.get("units") or _UNITS_MAP.get(var, "—")
            log.info(
                "  %-28s %-16s %8.3f %8.3f  %s",
                var, var_depth,
                float(np.nanmin(arr)), float(np.nanmax(arr)),
                units,
            )
        ds.close()
        log.info("─" * 72)
    except Exception as exc:
        log.error("Failed to open %s: %s", path, exc)


# ---------------------------------------------------------------------------
# Public entry points (used by FastAPI routers)
# ---------------------------------------------------------------------------
def fetch_sst() -> Path:
    """Return SST NetCDF path (surface layer, live or synthetic)."""
    if _credentials_present():
        try:
            return _download_sst_live()
        except Exception as exc:
            log.error("Live SST download failed: %s — using synthetic fallback.", exc)
    return _generate_synthetic_nc()


def fetch_waves() -> Path:
    """Return Wave NetCDF path (VHM0 + VMDR, live or synthetic)."""
    if _credentials_present():
        try:
            return _download_waves_live()
        except Exception as exc:
            log.error("Live wave download failed: %s — using synthetic fallback.", exc)
    return _generate_synthetic_nc()


def fetch_chl() -> Path:
    """Return Chlorophyll-a NetCDF path (surface layer, live or synthetic)."""
    if _credentials_present():
        try:
            return _download_chl_live()
        except Exception as exc:
            log.error("Live Chl download failed: %s — using synthetic fallback.", exc)
    return _generate_synthetic_nc()


def fetch_all() -> dict[str, Path]:
    """
    Fetch SST, Waves, and Chlorophyll-a surface data.
    Returns dict with keys: 'sst', 'waves', 'chl'.
    """
    return {
        "sst":   fetch_sst(),
        "waves": fetch_waves(),
        "chl":   fetch_chl(),
    }


# ---------------------------------------------------------------------------
# CLI / direct execution
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    log.info("=" * 72)
    log.info("ORCA Marine AI — Copernicus Surface Data Pipeline")
    log.info(
        "Region  : lon [%.1f, %.1f] | lat [%.1f, %.1f]",
        MIN_LON, MAX_LON, MIN_LAT, MAX_LAT,
    )
    log.info("Depth   : %.1f – %.1f m  (surface only)", MIN_DEPTH, MAX_DEPTH)
    log.info("Date    : %s", TODAY)
    log.info("=" * 72)

    results = fetch_all()

    log.info("\n--- Verification Summary ---")
    for label, path in results.items():
        _print_summary_table(path, label.upper())

    log.info("\nPipeline complete. Files written to: %s", DATA_DIR)
    for label, path in results.items():
        log.info("   [%-5s] -> %s", label.upper(), path)
