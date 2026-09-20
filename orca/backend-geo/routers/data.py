"""
routers/data.py
===============
ORCA ISRO Marine AI Platform — Oceanographic REST Data APIs
Serves structured JSON metrics, GeoJSON feature collections, and pipeline triggers.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from services.fetch_data import fetch_all
from services.map_service import clear_map_cache
from services.spatial_analysis import (
    clear_all_caches,
    compute_pfz_features,
    compute_safety_alerts,
    compute_imbl_geofence_alerts,
    get_marine_summary,
)

log = logging.getLogger("routers.data")

router = APIRouter(prefix="/data", tags=["Oceanographic Data & Analytics"])


@router.get(
    "/summary",
    summary="Oceanic Regional Summary",
    description="Aggregated summary of Sea Surface Temperature, Wave Heights, Chlorophyll-a, and active alert levels.",
    responses={
        200: {
            "description": "Successful regional summary",
            "content": {
                "application/json": {
                    "example": {
                        "status": "online",
                        "timestamp": "2026-09-15T12:00:00+00:00",
                        "region": "Indian Coastal Waters & Exclusive Economic Zone (EEZ)",
                        "bounding_box": {"min_lon": 65.0, "max_lon": 90.0, "min_lat": 5.0, "max_lat": 25.0},
                        "sst": {"min_celsius": 25.2, "max_celsius": 31.9, "mean_celsius": 29.37, "depth": "0.494 m (surface)"},
                        "waves": {"min_height_m": 0.1, "max_height_m": 3.48, "mean_height_m": 1.5, "depth": "0 m (surface)"},
                        "chlorophyll": {"min_mg_m3": 0.114, "max_mg_m3": 7.133, "mean_mg_m3": 0.32, "depth": "0.494 m (surface)"},
                        "pfz": {"total_detected_hotspots": 173, "high_probability_count": 51, "moderate_probability_count": 68, "top_hotspot": {"id": "PFZ-090", "pfz_score": 100.0}},
                        "marine_safety": {"overall_status": "NORMAL", "status_color": "#00e676", "active_sectors_evaluated": 7, "sectors_under_alert": 1, "imbl_geofence_alerts": 43}
                    }
                }
            }
        },
        500: {"description": "Data processing error"},
    }
)
def get_summary() -> Dict[str, Any]:
    """Return high-level regional ocean metrics."""
    try:
        return get_marine_summary()
    except Exception as exc:
        log.error("Failed to generate marine summary: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/pfz",
    summary="Potential Fishing Zones (PFZ) List",
    description="Filtered list of detected fish aggregation zones with species recommendations and distance to ports.",
    responses={
        200: {
            "description": "Filtered PFZ list",
            "content": {
                "application/json": {
                    "example": {
                        "count": 50,
                        "total_available": 173,
                        "hotspots": [
                            {
                                "id": "PFZ-090",
                                "latitude": 12.5,
                                "longitude": 75.0,
                                "pfz_score": 100.0,
                                "category": "High Probability",
                                "color": "#00e676",
                                "sst_celsius": 28.5,
                                "chl_mg_m3": 1.2,
                                "front_gradient": 0.18,
                                "target_species": "Indian Mackerel, Oil Sardine",
                                "nearest_port": "Mangalore (Old Port)",
                                "state": "Karnataka",
                                "distance_km": 43.6,
                                "bearing": "SSE",
                                "timestamp": "2026-09-15 12:00 UTC"
                            }
                        ]
                    }
                }
            }
        },
        500: {"description": "Data processing error"},
    }
)
def get_pfz_list(
    category: Optional[str] = Query(None, description="Filter by category: 'High Probability', 'Moderate Probability'"),
    state: Optional[str] = Query(None, description="Filter by coastal state, e.g. 'Kerala', 'Gujarat', 'Tamil Nadu'"),
    min_score: float = Query(50.0, ge=0.0, le=100.0, description="Minimum PFZ suitability score (0-100)"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of hotspots to return"),
) -> Dict[str, Any]:
    """Retrieve tabular PFZ features with query filters."""
    all_pfz = compute_pfz_features()

    filtered = [
        f for f in all_pfz
        if f["pfz_score"] >= min_score
        and (not category or f["category"].lower() == category.lower())
        and (not state or f["state"].lower() == state.lower())
    ]

    return {
        "count": len(filtered[:limit]),
        "total_available": len(all_pfz),
        "hotspots": filtered[:limit],
    }


@router.get(
    "/pfz-geojson",
    summary="PFZ GeoJSON FeatureCollection",
    description="Standard RFC 7946 GeoJSON representation of detected PFZ hotspots for web mapping and mobile apps.",
    responses={
        200: {
            "description": "PFZ GeoJSON FeatureCollection",
            "content": {
                "application/geo+json": {
                    "example": {
                        "type": "FeatureCollection",
                        "metadata": {"title": "ORCA ISRO Marine AI — PFZ", "generator": "ISRO ORCA Spatial Analysis Engine", "count": 173},
                        "features": [
                            {
                                "type": "Feature",
                                "geometry": {"type": "Point", "coordinates": [75.0, 12.5]},
                                "properties": {
                                    "id": "PFZ-090",
                                    "pfz_score": 100.0,
                                    "category": "High Probability",
                                    "sst_celsius": 28.5,
                                    "chl_mg_m3": 1.2,
                                    "front_gradient": 0.18,
                                    "target_species": "Indian Mackerel, Oil Sardine",
                                    "nearest_port": "Mangalore (Old Port)",
                                    "state": "Karnataka",
                                    "distance_km": 43.6,
                                    "bearing": "SSE",
                                    "timestamp": "2026-09-15 12:00 UTC"
                                }
                            }
                        ]
                    }
                }
            }
        },
        500: {"description": "Data processing error"},
    }
)
def get_pfz_geojson(
    min_score: float = Query(55.0, ge=0.0, le=100.0, description="Minimum score cutoff"),
) -> Dict[str, Any]:
    """Export PFZ features formatted as standard GeoJSON."""
    pfz_features = compute_pfz_features()

    features: List[Dict[str, Any]] = []
    for pfz in pfz_features:
        if pfz["pfz_score"] < min_score:
            continue

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [pfz["longitude"], pfz["latitude"]],
            },
            "properties": {
                "id": pfz["id"],
                "pfz_score": pfz["pfz_score"],
                "category": pfz["category"],
                "sst_celsius": pfz["sst_celsius"],
                "chl_mg_m3": pfz["chl_mg_m3"],
                "front_gradient": pfz["front_gradient"],
                "target_species": pfz["target_species"],
                "nearest_port": pfz["nearest_port"],
                "state": pfz["state"],
                "distance_km": pfz["distance_km"],
                "bearing": pfz["bearing"],
                "timestamp": pfz["timestamp"],
            },
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "metadata": {
            "title": "ORCA ISRO Marine AI — Potential Fishing Zones (PFZ)",
            "generator": "ISRO ORCA Spatial Analysis Engine",
            "count": len(features),
        },
        "features": features,
    }


@router.get(
    "/safety-alerts",
    summary="Marine Safety Hazard Advisories",
    description="Sector-by-sector coastal wave conditions and navigation warnings for small and mechanised crafts.",
    responses={
        200: {
            "description": "Marine safety advisories",
            "content": {
                "application/json": {
                    "example": {
                        "alert_count": 7,
                        "active_hazard_sectors": 1,
                        "sectors": [
                            {
                                "sector": "Gujarat Coast",
                                "max_wave_height_m": 1.87,
                                "mean_wave_height_m": 1.47,
                                "severity": "NORMAL",
                                "color": "#00e676",
                                "advisory": "Calm to Moderate: Normal fishing activities safe across the coastal sector.",
                                "center_lat": 22.0,
                                "center_lon": 70.25,
                                "bounds": [[20.0, 68.0], [24.0, 72.5]],
                                "timestamp": "2026-09-15 12:00 UTC"
                            }
                        ]
                    }
                }
            }
        },
        500: {"description": "Data processing error"},
    }
)
def get_safety_advisories() -> Dict[str, Any]:
    """Retrieve wave hazard advisories across Indian coastal sectors."""
    alerts = compute_safety_alerts()
    active_warnings = [a for a in alerts if a["severity"] in ["ROUGH ALERT", "DANGER"]]

    return {
        "alert_count": len(alerts),
        "active_hazard_sectors": len(active_warnings),
        "sectors": alerts,
    }


@router.get(
    "/imbl-geofence",
    summary="IMBL Maritime Boundary Geofence Alerts",
    description="Proximity alerts for PFZ hotspots and fishing ports near the International Maritime Boundary Line (IMBL) / EEZ boundary (< 5 NM).",
    responses={
        200: {
            "description": "IMBL geofence alerts",
            "content": {
                "application/json": {
                    "example": {
                        "alert_count": 43,
                        "threshold_nm": 5.0,
                        "alerts": [
                            {
                                "type": "PFZ_GEOFENCE",
                                "reference_id": "PFZ-090",
                                "reference_type": "PFZ Hotspot",
                                "latitude": 12.5,
                                "longitude": 75.0,
                                "distance_nm": 1.39,
                                "status": "GEOFENCE ALERT",
                                "message": "Vessel is 1.4 NM from IMBL boundary. IMMEDIATE COURSE CORRECTION REQUIRED.",
                                "timestamp": "2026-09-15 12:00 UTC"
                            }
                        ]
                    }
                }
            }
        },
        500: {"description": "Data processing error"},
    }
)
def get_imbl_geofence_alerts() -> Dict[str, Any]:
    """Retrieve IMBL geofence proximity alerts."""
    imbl_alerts = compute_imbl_geofence_alerts()
    return {
        "alert_count": len(imbl_alerts),
        "threshold_nm": 5.0,
        "alerts": imbl_alerts,
    }


def _run_fetch_pipeline() -> None:
    """Background worker for data pipeline execution."""
    log.info("Starting background Copernicus live data fetch...")
    try:
        results = fetch_all()
        log.info("Background Copernicus fetch completed: %s", results)
        # Clear all caches after new data is fetched
        clear_all_caches()
        clear_map_cache()
    except Exception as exc:
        log.error("Background Copernicus fetch failed: %s", exc)


@router.post(
    "/refresh",
    summary="Trigger Pipeline Data Refresh",
    description="Asynchronously queries Copernicus Marine to download the latest Near-Real-Time SST, Waves, and Chlorophyll-a layers.",
)
def trigger_refresh(background_tasks: BackgroundTasks) -> Dict[str, Any]:
    """Enqueue live Copernicus Marine download job."""
    background_tasks.add_task(_run_fetch_pipeline)
    return {
        "status": "queued",
        "message": "Live Copernicus Marine satellite data refresh initiated in the background.",
    }
