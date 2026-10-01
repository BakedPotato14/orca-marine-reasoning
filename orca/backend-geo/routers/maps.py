"""
routers/maps.py
===============
ORCA ISRO Marine AI Platform — Map Serving Endpoints
Serves dynamic, interactive Folium maps directly as HTML responses.
"""

from __future__ import annotations

import logging
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from services.map_service import (
    create_ocean_dashboard_map,
    create_pfz_map,
    create_safety_map,
    create_fallback_map,
    get_cached_map_html,
    set_cached_map_html,
)

log = logging.getLogger("routers.maps")

router = APIRouter(prefix="/maps", tags=["Interactive Folium Maps"])


@router.get(
    "/ocean",
    response_class=HTMLResponse,
    summary="Combined Oceanic Dashboard Map",
    description="Interactive multi-layer Folium map featuring SST, Chlorophyll-a, Wave Heights, PFZ advisories, and Safety Alerts.",
)
def get_ocean_map():
    """Renders the primary multi-layer oceanographic map."""
    cached = get_cached_map_html("combined")
    if cached:
        return HTMLResponse(content=cached, status_code=200)
    try:
        folium_map = create_ocean_dashboard_map(active_view="combined")
        html = folium_map.get_root().render()
        set_cached_map_html("combined", html)
        return HTMLResponse(content=html, status_code=200)
    except Exception as exc:
        log.exception("Error rendering ocean map: %s", exc)
        folium_map = create_fallback_map(str(exc), "Ocean Overview")
        html = folium_map.get_root().render()
        return HTMLResponse(content=html, status_code=200)


@router.get(
    "/pfz",
    response_class=HTMLResponse,
    summary="Potential Fishing Zone (PFZ) Advisory Map",
    description="Specialized view focusing on high-probability fish aggregation zones, thermal fronts, and nearest harbour vectors.",
)
def get_pfz_map():
    """Renders the PFZ-centric advisory map."""
    cached = get_cached_map_html("pfz")
    if cached:
        return HTMLResponse(content=cached, status_code=200)
    try:
        folium_map = create_pfz_map()
        html = folium_map.get_root().render()
        set_cached_map_html("pfz", html)
        return HTMLResponse(content=html, status_code=200)
    except Exception as exc:
        log.exception("Error rendering PFZ map: %s", exc)
        folium_map = create_fallback_map(str(exc), "PFZ Advisory Chart")
        html = folium_map.get_root().render()
        return HTMLResponse(content=html, status_code=200)


@router.get(
    "/safety",
    response_class=HTMLResponse,
    summary="Marine Safety & Wave Hazard Map",
    description="Specialized coastal safety view displaying rough sea alert sectors, maximum wave heights, and vessel navigation cautions.",
)
def get_safety_map():
    """Renders the coastal safety & wave alert map."""
    cached = get_cached_map_html("safety")
    if cached:
        return HTMLResponse(content=cached, status_code=200)
    try:
        folium_map = create_safety_map()
        html = folium_map.get_root().render()
        set_cached_map_html("safety", html)
        return HTMLResponse(content=html, status_code=200)
    except Exception as exc:
        log.exception("Error rendering safety map: %s", exc)
        folium_map = create_fallback_map(str(exc), "Marine Safety & Hazard Map")
        html = folium_map.get_root().render()
        return HTMLResponse(content=html, status_code=200)
