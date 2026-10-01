"""
services/map_service.py
=======================
ORCA ISRO Marine AI Platform — Interactive Folium Map Service

Builds production-grade, interactive geospatial maps for:
  1. Surface Sea Surface Temperature (SST) thermal raster heatmap & colorbar.
  2. Surface Chlorophyll-a concentration raster heatmap & colorbar.
  3. Significant Wave Height (VHM0) hazard raster overlay.
  4. Potential Fishing Zones (PFZ) advisories with rich HTML popup cards.
  5. Marine Safety Sector Alerts & Warning polygons.
  6. Major Indian Fishing Harbours & Coastal EEZ Reference.
  7. IMBL / EEZ Maritime Boundary with 5 NM geofence buffer.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Optional

import branca.colormap as bcm
import folium
from folium import plugins
import matplotlib
import matplotlib.cm as cm
import numpy as np

from services.spatial_analysis import (
    INDIAN_PORTS,
    compute_pfz_features,
    compute_safety_alerts,
    compute_imbl_geofence_alerts,
    data_manager,
    get_marine_summary,
    IMBL_FILE,
    clear_all_caches,
)

log = logging.getLogger("map_service")

# ---------------------------------------------------------------------------
# Map HTML Cache (TTL-based)
# ---------------------------------------------------------------------------
_MAP_HTML_CACHE_TTL: float = 300.0  # 5 minutes
_map_html_cache: Dict[str, Dict[str, Any]] = {
    "combined": {"html": None, "ts": 0.0},
    "pfz": {"html": None, "ts": 0.0},
    "safety": {"html": None, "ts": 0.0},
}


def _is_map_cache_valid(view: str) -> bool:
    """Check if cached map HTML is still within TTL."""
    cache = _map_html_cache.get(view, {"html": None, "ts": 0.0})
    return (time.time() - cache["ts"]) < _MAP_HTML_CACHE_TTL and cache["html"] is not None


def clear_map_cache() -> None:
    """Clear all map HTML caches. Called after data refresh."""
    global _map_html_cache
    for view in _map_html_cache:
        _map_html_cache[view] = {"html": None, "ts": 0.0}
    log.info("🗺️ Map HTML caches cleared")


def get_cached_map_html(view: str) -> Optional[str]:
    """Get cached map HTML if valid, otherwise return None."""
    if _is_map_cache_valid(view):
        log.debug("Returning cached map HTML for view: %s", view)
        return _map_html_cache[view]["html"]
    return None


def set_cached_map_html(view: str, html: str) -> None:
    """Cache rendered map HTML."""
    _map_html_cache[view]["html"] = html
    _map_html_cache[view]["ts"] = time.time()

# ---------------------------------------------------------------------------
# CSS for Pulsing Markers (injected into map HTML head)
# ---------------------------------------------------------------------------
PULSE_CSS = """
<style>
@keyframes pulse-ring {
    0% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 currentColor; }
    50% { transform: scale(1.6); opacity: 0.35; box-shadow: 0 0 10px 3px currentColor; }
    100% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 currentColor; }
}
@keyframes pulse-ring-slow {
    0% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 currentColor; }
    50% { transform: scale(1.7); opacity: 0.3; box-shadow: 0 0 14px 4px currentColor; }
    100% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 currentColor; }
}
@keyframes beacon-ripple {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
    70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
@keyframes radar-sweep {
    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(2, 132, 199, 0.7); }
    70% { transform: scale(1.08); box-shadow: 0 0 0 12px rgba(2, 132, 199, 0); }
    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(2, 132, 199, 0); }
}
@keyframes glow-crimson {
    0%, 100% { box-shadow: 0 0 4px #ef4444; }
    50% { box-shadow: 0 0 14px 4px #ef4444; }
}
@keyframes glow-amber {
    0%, 100% { box-shadow: 0 0 4px #f59e0b; }
    50% { box-shadow: 0 0 14px 4px #f59e0b; }
}
@keyframes glow-mint {
    0%, 100% { box-shadow: 0 0 4px #34d399; }
    50% { box-shadow: 0 0 14px 4px #34d399; }
}
@keyframes glow-cyan {
    0%, 100% { box-shadow: 0 0 4px #38bdf8; }
    50% { box-shadow: 0 0 14px 4px #38bdf8; }
}
@keyframes glow-indigo {
    0%, 100% { box-shadow: 0 0 4px #818cf8; }
    50% { box-shadow: 0 0 14px 4px #818cf8; }
}

/* Compact Modern PFZ Probability Badges */
.pfz-badge {
    border-radius: 50% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    font-weight: 800 !important;
    font-size: 10px !important;
    color: #ffffff !important;
    text-shadow: 0 1px 2px rgba(0,0,0,0.8) !important;
    border: 2px solid #ffffff !important;
    box-sizing: border-box !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
    transition: transform 0.2s ease, box-shadow 0.2s ease !important;
    cursor: pointer !important;
}
.pfz-badge:hover {
    transform: scale(1.3) !important;
    z-index: 10000 !important;
    box-shadow: 0 4px 16px rgba(0,0,0,0.6) !important;
}
.pfz-badge.high-prob {
    background: linear-gradient(135deg, #10b981, #059669) !important;
    color: #ffffff !important;
    animation: pulse-ring-slow 1.6s ease-in-out infinite !important;
}
.pfz-badge.moderate-prob {
    background: linear-gradient(135deg, #f59e0b, #d97706) !important;
    color: #ffffff !important;
    animation: pulse-ring 2.2s ease-out infinite !important;
}
.pfz-badge.edge-prob {
    background: linear-gradient(135deg, #0ea5e9, #0284c7) !important;
    color: #ffffff !important;
    animation: pulse-ring 2.8s ease-out infinite !important;
}

/* Compact IMBL Geofence Beacon */
.imbl-beacon {
    width: 24px !important;
    height: 24px !important;
    border-radius: 50% !important;
    background: linear-gradient(135deg, #ef4444, #dc2626) !important;
    color: #ffffff !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 11px !important;
    border: 2px solid #ffffff !important;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.5) !important;
    animation: beacon-ripple 1.8s infinite !important;
    transition: transform 0.2s ease !important;
    cursor: pointer !important;
}
.imbl-beacon:hover {
    transform: scale(1.3) !important;
    z-index: 10000 !important;
    box-shadow: 0 4px 16px rgba(239, 68, 68, 0.9) !important;
}

/* Compact Wave Hazard Pin */
.hazard-beacon {
    width: 26px !important;
    height: 26px !important;
    border-radius: 50% !important;
    color: #ffffff !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 12px !important;
    border: 2px solid #ffffff !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
    transition: transform 0.2s ease !important;
    cursor: pointer !important;
}
.hazard-beacon:hover {
    transform: scale(1.3) !important;
    z-index: 10000 !important;
}

/* Compact Vessel Beacon */
.vessel-beacon {
    width: 28px !important;
    height: 28px !important;
    border-radius: 50% !important;
    background: linear-gradient(135deg, #0284c7, #0369a1) !important;
    color: #ffffff !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 13px !important;
    border: 2px solid #ffffff !important;
    box-shadow: 0 2px 8px rgba(2, 132, 199, 0.5) !important;
    animation: radar-sweep 2s infinite !important;
    transition: transform 0.2s ease !important;
    cursor: pointer !important;
}
.vessel-beacon:hover {
    transform: scale(1.3) !important;
    z-index: 10000 !important;
}

/* Compact Marine Sanctuary Badge */
.sanctuary-beacon {
    width: 26px !important;
    height: 26px !important;
    border-radius: 50% !important;
    background: linear-gradient(135deg, #6366f1, #4f46e5) !important;
    color: #ffffff !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 12px !important;
    border: 2px solid #ffffff !important;
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.5) !important;
    transition: transform 0.2s ease !important;
    cursor: pointer !important;
}
.sanctuary-beacon:hover {
    transform: scale(1.3) !important;
    z-index: 10000 !important;
}

/* Port Marker Enhancements */
.port-marker {
    width: 28px !important;
    height: 28px !important;
    border-radius: 50% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 14px !important;
    color: white !important;
    border: 2px solid #ffffff !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important;
    box-sizing: border-box !important;
    transition: transform 0.2s ease, box-shadow 0.2s ease !important;
    cursor: pointer !important;
}
.port-marker:hover {
    transform: scale(1.3) !important;
    box-shadow: 0 4px 16px rgba(0,0,0,0.7) !important;
    z-index: 10000 !important;
}

.safety-marker {
    width: 18px !important;
    height: 18px !important;
    border-radius: 50% !important;
    border: 2px solid white !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.5) !important;
    box-sizing: border-box !important;
    animation: pulse-ring 2.5s ease-out infinite;
}

/* Leaflet MarkerCluster Styling — High-Tech Gradient Themes */
.marker-cluster-small {
    background-color: rgba(16, 185, 129, 0.35) !important;
}
.marker-cluster-small div {
    background: linear-gradient(135deg, #10b981, #059669) !important;
    color: #ffffff !important;
    font-family: 'Outfit', sans-serif !important;
    font-weight: 700 !important;
    box-shadow: 0 3px 8px rgba(16, 185, 129, 0.4) !important;
}
.marker-cluster-medium {
    background-color: rgba(245, 158, 11, 0.35) !important;
}
.marker-cluster-medium div {
    background: linear-gradient(135deg, #f59e0b, #d97706) !important;
    color: #ffffff !important;
    font-family: 'Outfit', sans-serif !important;
    font-weight: 700 !important;
    box-shadow: 0 3px 8px rgba(245, 158, 11, 0.4) !important;
}
.marker-cluster-large {
    background-color: rgba(14, 165, 233, 0.35) !important;
}
.marker-cluster-large div {
    background: linear-gradient(135deg, #0ea5e9, #0284c7) !important;
    color: #ffffff !important;
    font-family: 'Outfit', sans-serif !important;
    font-weight: 700 !important;
    box-shadow: 0 3px 8px rgba(14, 165, 233, 0.4) !important;
}
.marker-cluster {
    transition: transform 0.2s ease !important;
}
.marker-cluster:hover {
    transform: scale(1.15) !important;
}
</style>
"""

# ---------------------------------------------------------------------------
# Port color mapping by state
# ---------------------------------------------------------------------------
PORT_COLORS = {
    "Gujarat": "#ff6b35",
    "Maharashtra": "#e91e63",
    "Goa": "#00bcd4",
    "Karnataka": "#8bc34a",
    "Kerala": "#009688",
    "Tamil Nadu": "#673ab7",
    "Andhra Pradesh": "#ff9800",
    "Odisha": "#f44336",
    "West Bengal": "#3f51b5",
}

PORT_ICONS = {
    "Gujarat": "⚓",
    "Maharashtra": "🏭",
    "Goa": "🏖️",
    "Karnataka": "🐟",
    "Kerala": "🛥️",
    "Tamil Nadu": "⛵",
    "Andhra Pradesh": "🎣",
    "Odisha": "🚢",
    "West Bengal": "🌊",
}


def _arr_to_rgba(
    arr: np.ndarray,
    cmap_name: str,
    vmin: float,
    vmax: float,
    flip_ud: bool = True,
) -> np.ndarray:
    """
    Normalizes a 2D numpy array and applies a Matplotlib colormap,
    setting land / NaN values to fully transparent alpha.
    """
    work = arr.copy().astype(np.float64)
    nan_mask = np.isnan(work)

    denom = vmax - vmin if vmax > vmin else 1.0
    norm = np.clip((work - vmin) / denom, 0.0, 1.0)

    colormap = matplotlib.colormaps[cmap_name]
    rgba = colormap(norm)

    rgba[nan_mask, 3] = 0.0

    if flip_ud:
        rgba = np.flipud(rgba)

    return rgba


def _create_pfz_divicon(pfz: dict) -> folium.DivIcon:
    """Create a pulsing DivIcon for PFZ markers based on probability category."""
    score = pfz["pfz_score"]
    color = pfz["color"]

    if score >= 75.0:
        pulse_class = "pulse-marker high-prob"
        size = 26
        label = f"{int(score)}%"
    elif score >= 65.0:
        pulse_class = "pulse-marker moderate-prob"
        size = 22
        label = f"{int(score)}%"
    else:
        pulse_class = "pulse-marker edge-prob"
        size = 18
        label = "●"

    icon_html = f'''
    <div class="{pulse_class}" style="
        width: {size}px; height: {size}px;
        background: {color};
        color: white;
    ">{label}</div>
    '''

    return folium.DivIcon(
        html=icon_html,
        icon_size=(size, size),
        icon_anchor=(size // 2, size // 2),
        class_name="pfz-divicon"
    )


def _create_port_divicon(port: dict) -> folium.DivIcon:
    """Create a custom port marker with state-specific color and icon."""
    state = port["state"]
    color = PORT_COLORS.get(state, "#29b6f6")
    icon = PORT_ICONS.get(state, "⚓")

    icon_html = f'''
    <div class="port-marker" style="background: {color};" title="{port['name']}, {state}">
        {icon}
    </div>
    '''

    return folium.DivIcon(
        html=icon_html,
        icon_size=(28, 28),
        icon_anchor=(14, 14),
        class_name="port-divicon"
    )


def _create_safety_divicon(color: str) -> folium.DivIcon:
    """Create a pulsing safety alert marker."""
    icon_html = f'''
    <div class="safety-marker" style="background: {color};"></div>
    '''

    return folium.DivIcon(
        html=icon_html,
        icon_size=(18, 18),
        icon_anchor=(9, 9),
        class_name="safety-divicon"
    )


def _create_vessel_hud_divicon(vessel_id: str, speed_knots: float) -> folium.DivIcon:
    """Compact tactical vessel radar marker."""
    html = f'''
    <div class="vessel-beacon" title="Vessel: {vessel_id} ({speed_knots:.1f} kn)">🛥️</div>
    '''
    return folium.DivIcon(
        html=html,
        icon_size=(28, 28),
        icon_anchor=(14, 14),
        class_name="vessel-hud-divicon"
    )


def _create_imbl_alert_divicon(distance_nm: float, status: str) -> folium.DivIcon:
    """Compact crimson IMBL geofence alert beacon."""
    html = f'''
    <div class="imbl-beacon" title="IMBL Alert: {distance_nm:.1f} NM ({status})">⚠️</div>
    '''
    return folium.DivIcon(
        html=html,
        icon_size=(24, 24),
        icon_anchor=(12, 12),
        class_name="imbl-alert-divicon"
    )


def _create_pfz_dark_divicon(pfz_score: float, sst: float, category: str) -> folium.DivIcon:
    """Compact glowing PFZ probability marker badge."""
    if pfz_score >= 75.0:
        pulse_class = "pfz-badge high-prob"
    elif pfz_score >= 65.0:
        pulse_class = "pfz-badge moderate-prob"
    else:
        pulse_class = "pfz-badge edge-prob"

    label = f"{int(pfz_score)}%"
    html = f'''
    <div class="{pulse_class}" style="
        width: 26px; height: 26px;
    " title="PFZ Advisory: {label} ({category}) | SST: {sst:.1f}°C">{label}</div>
    '''
    return folium.DivIcon(
        html=html,
        icon_size=(26, 26),
        icon_anchor=(13, 13),
        class_name="pfz-dark-divicon"
    )


def _create_hazard_pin_divicon(wave_height: float, severity: str) -> folium.DivIcon:
    """Compact nautical wave hazard pin."""
    severity_colors = {
        "DANGER": "#ef4444",
        "ROUGH ALERT": "#f59e0b",
        "CAUTION": "#fbbf24",
        "NORMAL": "#10b981",
    }
    accent = severity_colors.get(severity, "#f59e0b")
    html = f'''
    <div class="hazard-beacon" style="
        background: {accent};
    " title="Wave Hazard: {wave_height:.1f}m ({severity})">🌊</div>
    '''
    return folium.DivIcon(
        html=html,
        icon_size=(26, 26),
        icon_anchor=(13, 13),
        class_name="hazard-pin-divicon"
    )


def _create_sanctuary_divicon(zone_name: str, restriction_level: str) -> folium.DivIcon:
    """Compact marine protected sanctuary badge."""
    html = f'''
    <div class="sanctuary-beacon" title="Sanctuary: {zone_name} ({restriction_level})">🛡️</div>
    '''
    return folium.DivIcon(
        html=html,
        icon_size=(26, 26),
        icon_anchor=(13, 13),
        class_name="sanctuary-divicon"
    )


def create_ocean_dashboard_map(
    active_view: str = "combined",
) -> folium.Map:
    """
    Generate the primary interactive ORCA Folium map.

    Parameters:
      active_view: 'combined' (all layers), 'pfz' (focused on PFZ), or 'safety' (focused on wave hazards)
    """
    # 1. Initialize Base Map centered on Indian Ocean with constrained bounds
    m = folium.Map(
        location=[15.0, 77.5],
        zoom_start=5,
        min_zoom=4,
        max_zoom=12,
        max_bounds=True,
        max_bounds_viscosity=1.0,
        min_lat=5.0,
        max_lat=25.0,
        min_lon=65.0,
        max_lon=90.0,
        world_copy_jump=False,
        tiles=None,
        control_scale=True,
        prefer_canvas=True,
    )

    # Inject pulsing CSS into map header
    m.get_root().header.add_child(folium.Element(PULSE_CSS))

    # -----------------------------------------------------------------------
    # Base Tile Layers — OpenStreetMap DEFAULT (show=True)
    # -----------------------------------------------------------------------
    folium.TileLayer(
        tiles="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        name="OpenStreetMap (Light Default)",
        attr='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains="abc",
        control=True,
        show=True,  # DEFAULT BASE LAYER - OpenStreetMap Light
        max_zoom=19,
    ).add_to(m)

    folium.TileLayer(
        tiles="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        name="CartoDB Positron (Light Minimal)",
        attr='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains="abcd",
        control=True,
        show=False,
        max_zoom=19,
    ).add_to(m)

    folium.TileLayer(
        tiles="https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png",
        name="CartoDB Dark Matter",
        attr='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains="abcd",
        control=True,
        show=False,
        max_zoom=19,
    ).add_to(m)

    folium.TileLayer(
        tiles="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        name="ESRI Satellite",
        attr="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
        control=True,
        show=False,
        max_zoom=18,
    ).add_to(m)

    # -----------------------------------------------------------------------
    # Load Raw Oceanic Data
    # -----------------------------------------------------------------------
    data = data_manager.load_datasets()
    sst_obj = data["sst"]
    wave_obj = data["waves"]
    chl_obj = data["chl"]

    # Bounds for image overlays: [[min_lat, min_lon], [max_lat, max_lon]]
    sst_bounds = [
        [float(sst_obj["lats"].min()), float(sst_obj["lons"].min())],
        [float(sst_obj["lats"].max()), float(sst_obj["lons"].max())],
    ]
    chl_bounds = [
        [float(chl_obj["lats"].min()), float(chl_obj["lons"].min())],
        [float(chl_obj["lats"].max()), float(chl_obj["lons"].max())],
    ]
    wave_bounds = [
        [float(wave_obj["lats"].min()), float(wave_obj["lons"].min())],
        [float(wave_obj["lats"].max()), float(wave_obj["lons"].max())],
    ]

    # -----------------------------------------------------------------------
    # LAYER A: Sea Surface Temperature (SST) Raster Heatmap
    # -----------------------------------------------------------------------
    sst_vals = sst_obj["values"]
    sst_min = float(np.nanmin(sst_vals))
    sst_max = float(np.nanmax(sst_vals))
    sst_rgba = _arr_to_rgba(sst_vals, cmap_name="turbo", vmin=sst_min, vmax=sst_max)

    sst_overlay = folium.raster_layers.ImageOverlay(
        image=sst_rgba,
        bounds=sst_bounds,
        opacity=0.62,
        name="🌡️ Sea Surface Temperature (SST)",
        show=(active_view in ["combined", "pfz"]),
        interactive=False,
        cross_origin=False,
        zindex=2,
    )
    sst_overlay.add_to(m)

    # SST Branca Legend
    sst_cmap = bcm.LinearColormap(
        colors=["#30123b", "#4662d7", "#35abf8", "#1ae4b6", "#72fe5e", "#c7f132", "#fbb938", "#f44f12", "#7a0403"],
        vmin=round(sst_min, 1),
        vmax=round(sst_max, 1),
        caption="Sea Surface Temperature (°C) — Surface 0.494 m",
    )
    sst_cmap.add_to(m)

    # -----------------------------------------------------------------------
    # LAYER B: Chlorophyll-a Concentration Raster Heatmap
    # -----------------------------------------------------------------------
    chl_vals = chl_obj["values"]
    chl_min = float(np.nanmin(chl_vals))
    chl_display_max = min(float(np.nanmax(chl_vals)), 3.5)
    chl_rgba = _arr_to_rgba(chl_vals, cmap_name="YlGn", vmin=chl_min, vmax=chl_display_max)

    chl_overlay = folium.raster_layers.ImageOverlay(
        image=chl_rgba,
        bounds=chl_bounds,
        opacity=0.65,
        name="🌿 Chlorophyll-a Concentration",
        show=(active_view == "combined"),
        interactive=False,
        cross_origin=False,
        zindex=3,
    )
    chl_overlay.add_to(m)

    # Chlorophyll Branca Legend
    chl_cmap = bcm.LinearColormap(
        colors=["#ffffe5", "#d9f0a3", "#addd8e", "#78c679", "#31a354", "#006837"],
        vmin=round(chl_min, 2),
        vmax=round(chl_display_max, 2),
        caption="Chlorophyll-a (mg/m³) — Coastal Phytoplankton",
    )
    chl_cmap.add_to(m)

    # -----------------------------------------------------------------------
    # LAYER C: Significant Wave Height (VHM0) Raster Overlay
    # -----------------------------------------------------------------------
    wave_vals = wave_obj["values"]
    wave_min = float(np.nanmin(wave_vals))
    wave_max = float(np.nanmax(wave_vals))
    wave_rgba = _arr_to_rgba(wave_vals, cmap_name="Blues", vmin=wave_min, vmax=wave_max)

    wave_overlay = folium.raster_layers.ImageOverlay(
        image=wave_rgba,
        bounds=wave_bounds,
        opacity=0.55,
        name="🌊 Significant Wave Height (m)",
        show=(active_view in ["combined", "safety"]),
        interactive=False,
        cross_origin=False,
        zindex=2,
    )
    wave_overlay.add_to(m)

    # -----------------------------------------------------------------------
    # LAYER D: Marine Safety Hazard Alerts (Sectors)
    # -----------------------------------------------------------------------
    safety_group = folium.FeatureGroup(
        name="⚠️ Marine Safety Advisories & Alert Sectors",
        show=(active_view in ["combined", "safety"]),
    )

    alerts = compute_safety_alerts()
    for a in alerts:
        b = a["bounds"]
        severity_color = a["color"]

        popup_html = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; min-width: 250px; background: #181b24; color: #fff; padding: 14px; border-radius: 8px; border-left: 5px solid {severity_color}; box-shadow: 0 4px 14px rgba(0,0,0,0.5);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #9aa0a6;">ISRO ORCA Coastal Safety Alert</div>
            <div style="font-size: 16px; font-weight: 700; margin: 4px 0 8px 0; color: #fff;">{a['sector']}</div>
            <div style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; background: {severity_color}22; color: {severity_color}; border: 1px solid {severity_color}; margin-bottom: 10px;">
                STATUS: {a['severity']}
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #202430; padding: 8px; border-radius: 6px; font-size: 12px; margin-bottom: 10px;">
                <div><span style="color: #8ab4f8;">Max Waves:</span> <b>{a['max_wave_height_m']} m</b></div>
                <div><span style="color: #8ab4f8;">Avg Waves:</span> <b>{a['mean_wave_height_m']} m</b></div>
            </div>
            <div style="font-size: 12px; line-height: 1.4; color: #e8eaed; background: #282c37; padding: 8px; border-radius: 6px;">
                <b>Advisory:</b> {a['advisory']}
            </div>
            <div style="font-size: 10px; color: #9aa0a6; margin-top: 8px; text-align: right;">Updated: {a['timestamp']}</div>
        </div>
        """

        folium.Rectangle(
            bounds=b,
            color=severity_color,
            weight=2,
            fill=True,
            fill_color=severity_color,
            fill_opacity=0.15,
            popup=folium.Popup(popup_html, max_width=320),
            tooltip=f"{a['sector']}: {a['severity']} (Max: {a['max_wave_height_m']}m)",
        ).add_to(safety_group)

        # Dark Amber Rough Seas Hazard Pin at center of sector
        folium.Marker(
            location=[a["center_lat"], a["center_lon"]],
            icon=_create_hazard_pin_divicon(a["max_wave_height_m"], a["severity"]),
            popup=folium.Popup(popup_html, max_width=320),
            tooltip=f"Alert Center: {a['sector']} — {a['severity']} (Max: {a['max_wave_height_m']}m)",
        ).add_to(safety_group)

    safety_group.add_to(m)

    # -----------------------------------------------------------------------
    # LAYER E: Potential Fishing Zone (PFZ) Advisories (Clustered & Anti-Overlap)
    # -----------------------------------------------------------------------
    pfz_cluster = plugins.MarkerCluster(
        name="🐟 Potential Fishing Zones (PFZ)",
        show=(active_view in ["combined", "pfz"]),
        overlay=True,
        control=True,
        options={
            "spiderfyOnMaxZoom": True,
            "showCoverageOnHover": False,
            "zoomToBoundsOnClick": True,
            "maxClusterRadius": 45,
            "spiderfyDistanceMultiplier": 1.5,
        },
    )

    pfz_features = compute_pfz_features()

    for pfz in pfz_features:
        score = pfz["pfz_score"]
        color = pfz["color"]
        badge_bg = f"{color}25"

        popup_html = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; min-width: 270px; background: #131722; color: #f0f3f6; padding: 14px; border-radius: 10px; border: 1px solid #2a2e39; border-top: 4px solid {color}; box-shadow: 0 6px 18px rgba(0,0,0,0.6);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 11px; font-weight: bold; color: #787b86; letter-spacing: 0.5px;">INCOIS / ISRO PFZ ADVISORY</span>
                <span style="font-size: 11px; font-weight: 700; color: #2962ff;">{pfz['id']}</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
                <span style="font-size: 17px; font-weight: 700; color: #fff;">{pfz['category']}</span>
                <span style="font-size: 18px; font-weight: 800; color: {color}; background: {badge_bg}; padding: 2px 8px; border-radius: 6px;">{score}%</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: #1e222d; padding: 8px 10px; border-radius: 6px; font-size: 12px; margin-bottom: 10px;">
                <div><span style="color: #787b86;">SST:</span> <b style="color: #f0f3f6;">{pfz['sst_celsius']} °C</b></div>
                <div><span style="color: #787b86;">Chl-a:</span> <b style="color: #f0f3f6;">{pfz['chl_mg_m3']} mg/m³</b></div>
                <div><span style="color: #787b86;">Front ∇:</span> <b style="color: #f0f3f6;">{pfz['front_gradient']}</b></div>
                <div><span style="color: #787b86;">Depth:</span> <b style="color: #f0f3f6;">0–1 m</b></div>
            </div>

            <div style="margin-bottom: 8px; font-size: 12px; line-height: 1.4;">
                <div style="color: #29b6f6; font-weight: 600; margin-bottom: 2px;">🎣 Target Pelagic Species:</div>
                <div style="color: #e0e0e0; background: #262b3d; padding: 6px 8px; border-radius: 4px;">{pfz['target_species']}</div>
            </div>

            <div style="background: #182030; padding: 6px 8px; border-radius: 4px; font-size: 11px; margin-bottom: 6px;">
                <span style="color: #ffd54f;">⚓ Nearest Port:</span> <b>{pfz['nearest_port']}, {pfz['state']}</b><br/>
                <span style="color: #90caf9;">Distance / Bearing:</span> <b>{pfz['distance_km']} km {pfz['bearing']}</b>
            </div>

            <div style="font-size: 10px; color: #787b86; display: flex; justify-content: space-between;">
                <span>Coord: {pfz['latitude']}°N, {pfz['longitude']}°E</span>
                <span>{pfz['timestamp']}</span>
            </div>
        </div>
        """

        # Compact glowing PFZ probability marker
        folium.Marker(
            location=[pfz["latitude"], pfz["longitude"]],
            icon=_create_pfz_dark_divicon(pfz["pfz_score"], pfz["sst_celsius"], pfz["category"]),
            popup=folium.Popup(popup_html, max_width=320),
            tooltip=f"{pfz['id']}: {pfz['category']} ({score}%) | SST: {pfz['sst_celsius']}°C | {pfz['nearest_port']}, {pfz['state']} — {pfz['distance_km']} km {pfz['bearing']}",
        ).add_to(pfz_cluster)

    pfz_cluster.add_to(m)

    # -----------------------------------------------------------------------
    # LAYER F: Major Indian Fishing Harbours & Ports
    # -----------------------------------------------------------------------
    port_group = folium.FeatureGroup(
        name="⚓ Major Fishing Harbours & Ports",
        show=True,
    )

    for port in INDIAN_PORTS:
        port_popup = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; min-width: 180px; background: #1a1e29; color: #fff; padding: 10px; border-radius: 6px; border-left: 4px solid #29b6f6;">
            <div style="font-size: 14px; font-weight: bold;">{port['name']}</div>
            <div style="font-size: 12px; color: #8ab4f8; margin-top: 2px;">{port['state']}, India</div>
            <div style="font-size: 11px; color: #9aa0a6; margin-top: 6px;">Location: {port['lat']}°N, {port['lon']}°E</div>
            <div style="font-size: 11px; color: #81c784; margin-top: 4px;">Operational Coastal Base</div>
        </div>
        """

        folium.Marker(
            location=[port["lat"], port["lon"]],
            icon=_create_port_divicon(port),
            popup=folium.Popup(port_popup, max_width=240),
            tooltip=f"Port: {port['name']} ({port['state']})",
        ).add_to(port_group)

    port_group.add_to(m)

    # -----------------------------------------------------------------------
    # LAYER G: IMBL / EEZ Maritime Boundary
    # -----------------------------------------------------------------------
    imbl_group = folium.FeatureGroup(
        name="📏 IMBL / EEZ Maritime Boundary",
        show=True,
    )

    try:
        import geopandas as gpd
        if IMBL_FILE.exists():
            imbl_gdf = gpd.read_file(IMBL_FILE)
            if not imbl_gdf.empty:
                # Add boundary as GeoJson with enhanced styling
                folium.GeoJson(
                    imbl_gdf,
                    name="IMBL / EEZ Boundary",
                    style_function=lambda x: {
                        "color": "#ff6d00",
                        "weight": 3,
                        "fillOpacity": 0.02,
                        "fillColor": "#ff6d00",
                        "dashArray": "8, 6",
                        "opacity": 0.9,
                        "lineCap": "round",
                        "lineJoin": "round",
                    },
                    highlight_function=lambda x: {
                        "color": "#ff9100",
                        "weight": 5,
                        "fillOpacity": 0.12,
                        "dashArray": "8, 6",
                    },
                    tooltip=folium.GeoJsonTooltip(
                        fields=["GEONAME", "POL_TYPE", "SOVEREIGN1"],
                        aliases=["Boundary: ", "Type: ", "Sovereign: "],
                        style=("font-family: 'Segoe UI', Arial, sans-serif; "
                               "background: #1a1e29; color: #fff; padding: 8px; "
                               "border-radius: 4px; border-left: 3px solid #ff6d00;"),
                        sticky=True,
                    ),
                    popup=folium.GeoJsonPopup(
                        fields=["GEONAME", "POL_TYPE", "SOVEREIGN1", "AREA_KM2"],
                        aliases=["Name: ", "Type: ", "Sovereign: ", "Area (km²): "],
                        style=("font-family: 'Segoe UI', Arial, sans-serif; "
                               "background: #1a1e29; color: #fff; padding: 10px; "
                               "border-radius: 4px; max-width: 300px;"),
                    ),
                ).add_to(imbl_group)

                # Add 5 NM buffer zone as visual reference
                from shapely.geometry import shape
                from shapely.ops import unary_union
                union_geom = unary_union(imbl_gdf.geometry.values)
                buffer_km = 5.0 * 1.852  # 5 NM in km
                buffer_deg = buffer_km / 111.0
                buffered = union_geom.buffer(buffer_deg)

                if buffered.geom_type == "Polygon":
                    folium.GeoJson(
                        buffered.__geo_interface__,
                        name="5 NM Geofence Buffer Zone",
                        style_function=lambda x: {
                            "color": "#ff1744",
                            "weight": 1.5,
                            "fillColor": "#ff1744",
                            "fillOpacity": 0.04,
                            "dashArray": "4, 4",
                            "opacity": 0.7,
                        },
                        highlight_function=lambda x: {
                            "color": "#ff5252",
                            "weight": 3,
                            "fillOpacity": 0.08,
                        },
                        tooltip=folium.GeoJsonTooltip(
                            fields=[],
                            aliases=[],
                            style=("font-family: 'Segoe UI', Arial, sans-serif; "
                                   "background: #1a1e29; color: #fff; padding: 8px; "
                                   "border-radius: 4px;"),
                            sticky=True,
                        ).add_to(folium.GeoJson(
                            buffered.__geo_interface__,
                            name="5 NM Geofence Buffer Zone (Tooltip)",
                            show=False,
                            style_function=lambda x: {"fillOpacity": 0, "color": "transparent"},
                        )),
                    ).add_to(imbl_group)
                elif buffered.geom_type == "MultiPolygon":
                    for geom in buffered.geoms:
                        folium.GeoJson(
                            geom.__geo_interface__,
                            name="5 NM Geofence Buffer Zone",
                            style_function=lambda x: {
                                "color": "#ff1744",
                                "weight": 1.5,
                                "fillColor": "#ff1744",
                                "fillOpacity": 0.04,
                                "dashArray": "4, 4",
                                "opacity": 0.7,
                            },
                        ).add_to(imbl_group)

                # Add IMBL Proximity Alert markers for PFZ hotspots near boundary (Clustered & Anti-Overlap)
                imbl_alerts = compute_imbl_geofence_alerts()
                imbl_cluster = plugins.MarkerCluster(
                    name="⚠️ IMBL Proximity Alerts",
                    options={
                        "spiderfyOnMaxZoom": True,
                        "showCoverageOnHover": False,
                        "zoomToBoundsOnClick": True,
                        "maxClusterRadius": 40,
                        "spiderfyDistanceMultiplier": 1.5,
                    },
                )
                for alert in imbl_alerts:
                    alert_popup = f"""
                    <div style="font-family: 'Segoe UI', Arial, sans-serif; min-width: 240px; background: #18080a; color: #fff; padding: 12px; border-radius: 8px; border: 1px solid #7f1d1d; border-left: 4px solid #ef4444; box-shadow: 0 4px 14px rgba(0,0,0,0.5);">
                        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #ef4444;">IMBL GEOFENCE ALERT</div>
                        <div style="font-size: 16px; font-weight: 700; margin: 4px 0 8px 0; color: #fff;">{alert['reference_id']}</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #1f0a0c; padding: 8px; border-radius: 6px; font-size: 12px; margin-bottom: 8px;">
                            <div><span style="color: #fca5a5;">Distance:</span> <b style="color: #ef4444;">{alert['distance_nm']:.1f} NM</b></div>
                            <div><span style="color: #fca5a5;">Type:</span> <b>{alert['reference_type']}</b></div>
                            <div><span style="color: #fca5a5;">Lat:</span> <b>{alert['latitude']:.3f}°N</b></div>
                            <div><span style="color: #fca5a5;">Lon:</span> <b>{alert['longitude']:.3f}°E</b></div>
                        </div>
                        <div style="font-size: 11px; line-height: 1.5; color: #fecaca; background: #2d0a0c; padding: 8px; border-radius: 4px;">
                            {alert['message']}
                        </div>
                        <div style="font-size: 10px; color: #9ca3af; text-align: right; margin-top: 8px;">{alert['timestamp']}</div>
                    </div>
                    """
                    folium.Marker(
                        location=[alert["latitude"], alert["longitude"]],
                        icon=_create_imbl_alert_divicon(alert["distance_nm"], alert["status"]),
                        popup=folium.Popup(alert_popup, max_width=300),
                        tooltip=f"IMBL ALERT: {alert['reference_id']} — {alert['distance_nm']:.1f} NM",
                    ).add_to(imbl_cluster)

                imbl_cluster.add_to(imbl_group)

    except Exception as exc:
        log.warning("Failed to load IMBL boundary for map: %s", exc)

    imbl_group.add_to(m)

    # -----------------------------------------------------------------------
    # LAYER H: Vessel Tracking (Tactical Radar Markers)
    # -----------------------------------------------------------------------
    vessel_group = folium.FeatureGroup(
        name="🚢 Vessel Tracking (Tactical Radar)",
        show=(active_view in ["combined", "pfz", "safety"]),
    )

    # Demo vessel positions (dispersed offshore along active maritime corridors)
    demo_vessels = [
        {"id": "IN-ORCA-001", "lat": 15.35, "lon": 73.55, "speed": 12.5},   # Offshore Mormugao
        {"id": "IN-ORCA-002", "lat": 9.85, "lon": 75.95, "speed": 8.3},    # Offshore Kochi
        {"id": "IN-ORCA-003", "lat": 17.60, "lon": 83.55, "speed": 15.2},  # Offshore Visakhapatnam
        {"id": "IN-ORCA-004", "lat": 20.75, "lon": 70.15, "speed": 6.7},   # Offshore Veraval
        {"id": "IN-ORCA-005", "lat": 13.05, "lon": 80.55, "speed": 10.1},  # Offshore Chennai
    ]

    for v in demo_vessels:
        vessel_popup = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; min-width: 200px; background: #090d16; color: #fff; padding: 12px; border-radius: 8px; border: 1px solid #1e293b; border-left: 4px solid #38bdf8; box-shadow: 0 4px 14px rgba(0,0,0,0.5);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #38bdf8;">TACTICAL HUD — VESSEL TELEMETRY</div>
            <div style="font-size: 16px; font-weight: 700; margin: 4px 0 8px 0; color: #fff; font-family: 'JetBrains Mono', monospace;">{v['id']}</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #0f141c; padding: 8px; border-radius: 6px; font-size: 12px; margin-bottom: 8px;">
                <div><span style="color: #38bdf8;">Speed:</span> <b>{v['speed']:.1f} kn</b></div>
                <div><span style="color: #38bdf8;">Heading:</span> <b>{np.random.randint(0, 360)}°</b></div>
                <div><span style="color: #38bdf8;">Lat:</span> <b>{v['lat']:.3f}°N</b></div>
                <div><span style="color: #38bdf8;">Lon:</span> <b>{v['lon']:.3f}°E</b></div>
            </div>
            <div style="font-size: 10px; color: #64748b; text-align: right;">Last update: {datetime.now(timezone.utc).strftime("%H:%M:%S UTC")}</div>
        </div>
        """
        folium.Marker(
            location=[v["lat"], v["lon"]],
            icon=_create_vessel_hud_divicon(v["id"], v["speed"]),
            popup=folium.Popup(vessel_popup, max_width=280),
            tooltip=f"Vessel: {v['id']} | {v['speed']:.1f} kn",
        ).add_to(vessel_group)

    vessel_group.add_to(m)

    # -----------------------------------------------------------------------
    # LAYER I: Marine Sanctuaries & Eco-Geofences
    # -----------------------------------------------------------------------
    sanctuary_group = folium.FeatureGroup(
        name="🛡️ Marine Sanctuaries & Eco-Zones",
        show=True,
    )

    # Known Indian marine sanctuaries / protected areas
    sanctuaries = [
        {"name": "Gulf of Mannar", "lat": 9.0, "lon": 79.0, "level": "Marine National Park", "restriction": "No fishing, no extraction"},
        {"name": "Mahatma Gandhi Marine NP", "lat": 11.5, "lon": 92.5, "level": "National Park", "restriction": "No fishing, tourism regulated"},
        {"name": "Gahirmatha Marine Sanctuary", "lat": 20.7, "lon": 87.0, "level": "Sanctuary", "restriction": "Turtle nesting protection"},
        {"name": "Malvan Marine Sanctuary", "lat": 16.0, "lon": 73.5, "level": "Sanctuary", "restriction": "Coral reef protection"},
        {"name": "Pirotan Island (Marine NP)", "lat": 22.6, "lon": 70.0, "level": "Marine National Park", "restriction": "Coral & mangrove protection"},
    ]

    for s in sanctuaries:
        sanctuary_popup = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; min-width: 240px; background: #0f172a; color: #fff; padding: 12px; border-radius: 8px; border: 1px solid #334155; border-left: 4px solid #818cf8; box-shadow: 0 4px 14px rgba(0,0,0,0.5);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #818cf8;">MARINE PROTECTED AREA</div>
            <div style="font-size: 16px; font-weight: 700; margin: 4px 0 8px 0; color: #fff;">{s['name']}</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #131c2e; padding: 8px; border-radius: 6px; font-size: 12px; margin-bottom: 8px;">
                <div><span style="color: #94a3b8;">Status:</span> <b style="color: #818cf8;">{s['level']}</b></div>
                <div><span style="color: #94a3b8;">Coords:</span> <b>{s['lat']:.2f}°N, {s['lon']:.2f}°E</b></div>
            </div>
            <div style="font-size: 11px; line-height: 1.5; color: #e2e8f0; background: #111928; padding: 8px; border-radius: 4px;">
                <b>Restrictions:</b> {s['restriction']}
            </div>
            <div style="font-size: 10px; color: #64748b; text-align: right; margin-top: 8px;">Eco-geofence active</div>
        </div>
        """
        folium.Marker(
            location=[s["lat"], s["lon"]],
            icon=_create_sanctuary_divicon(s["name"], s["level"]),
            popup=folium.Popup(sanctuary_popup, max_width=300),
            tooltip=f"🛡️ {s['name']} — {s['level']}",
        ).add_to(sanctuary_group)

        # Add a circular buffer zone around sanctuary
        folium.Circle(
            location=[s["lat"], s["lon"]],
            radius=15000,  # 15 km buffer
            color="#818cf8",
            weight=1,
            fill=True,
            fill_color="#818cf8",
            fill_opacity=0.05,
            dash_array="5, 5",
        ).add_to(sanctuary_group)

    sanctuary_group.add_to(m)

    # -----------------------------------------------------------------------
    # 3. Interactive Plugins
    # -----------------------------------------------------------------------
    plugins.Fullscreen(
        position="topright",
        title="Expand to Fullscreen",
        title_cancel="Exit Fullscreen",
        force_separate_button=True,
    ).add_to(m)

    plugins.MousePosition(
        position="bottomright",
        separator=" | ",
        prefix="Coordinates: ",
        lat_formatter="function(num) {return num.toFixed(3) + '° N';}",
        lng_formatter="function(num) {return num.toFixed(3) + '° E';}",
    ).add_to(m)

    plugins.MiniMap(
        tile_layer=folium.TileLayer(
            tiles="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            attr="OpenStreetMap",
            subdomains="abc",
        ),
        position="bottomleft",
        width=130,
        height=130,
        collapsed_width=25,
        collapsed_height=25,
        toggle_display=True,
        zoom_level_offset=-3,
    ).add_to(m)

    # Add measure tool
    plugins.MeasureControl(
        position="topright",
        primary_length_unit="kilometers",
        secondary_length_unit="nauticalmiles",
        primary_area_unit="sqkilometers",
        secondary_area_unit="acres",
    ).add_to(m)

    # -----------------------------------------------------------------------
    # 4. Layer Control
    # -----------------------------------------------------------------------
    folium.LayerControl(position="topright", collapsed=False).add_to(m)

    return m


def create_pfz_map() -> folium.Map:
    """Convenience factory for PFZ-focused map."""
    return create_ocean_dashboard_map(active_view="pfz")


def create_safety_map() -> folium.Map:
    """Convenience factory for safety-alert-focused map."""
    return create_ocean_dashboard_map(active_view="safety")


def create_fallback_map(error_msg: str = "", title: str = "Ocean Map") -> folium.Map:
    """Generate a clean fallback Folium map with Indian ports when raster data is unavailable."""
    m = folium.Map(
        location=[15.0, 77.5],
        zoom_start=5,
        min_zoom=4,
        max_zoom=12,
        tiles="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attr='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    )
    m.get_root().header.add_child(folium.Element(PULSE_CSS))

    for port in INDIAN_PORTS:
        icon = _create_port_divicon(port)
        folium.Marker(
            location=[port["lat"], port["lon"]],
            icon=icon,
            tooltip=f"⚓ {port['name']} ({port['state']})",
            popup=f"<b>⚓ {port['name']}</b><br>{port['state']}<br>Operational Fishing Base",
        ).add_to(m)

    banner_html = f'''
    <div style="
        position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
        z-index: 9999; background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(34, 211, 238, 0.5);
        color: #e2e8f0; padding: 6px 16px; border-radius: 8px; font-family: sans-serif; font-size: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5); pointer-events: none; text-align: center;
    ">
        🧭 <strong>{title}</strong> — Harbours & Coastal Perimeter Active
    </div>
    '''
    m.get_root().html.add_child(folium.Element(banner_html))
    return m


def create_test_dark_map() -> folium.Map:
    """Generate a test map with all markers for visual QA."""
    clear_map_cache()
    m = create_ocean_dashboard_map(active_view="combined")
    # Save to HTML for manual inspection
    m.save("test_light_map.html")
    m.save("test_dark_map.html")
    return m