"""
routing_agent.py — ORCA LangGraph node: waypoint route generation and GeoJSON assembly.

Reads:  state["location"]        — vessel coordinates {lat, lon}
        state["pfz_data"]        — nearby fishing zones (or None)
        state["weather_data"]    — wave height + wind speed (or None)
        state["geofence_result"] — border distance + jurisdiction (or None)

Writes: state["map_geojson"]     — GeoJSON FeatureCollection for the frontend map
      | state["errors"]          — list with one string on failure

Role in the pipeline
--------------------
This node runs in parallel with risk_node (both depend on the parallel fan-out
of weather/geofence/pfz), then joins synthesis_node.

Its sole responsibility is to produce a map-ready GeoJSON payload so the
Streamlit frontend can render:
  - 📍 Vessel position (Point)
  - 🎣 Best PFZ destination (Point)
  - 🗺️  Planned navigation route (LineString) with hazard + border avoidance

No safety logic lives here — that is risk_agent's job.  This agent only
decides *where to go* (nearest PFZ or safe offshore fallback) and *how to
get there* (straight line with midpoint nudged away from weather or border
hazards when thresholds are crossed — a simple heuristic, not graph-based
pathfinding).

Module-level data loading
-------------------------
No external files are loaded here — all inputs come from state written by
upstream nodes.  There is nothing to load at module level.
"""

import math
from typing import Dict, Any, Optional, List


# ---------------------------------------------------------------------------
# INTERNAL GEOMETRY HELPERS
# ---------------------------------------------------------------------------

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Great-circle distance between two WGS-84 points in kilometres.
    Used to rank PFZ zones by proximity to the vessel.
    """
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _midpoint(lat1: float, lon1: float, lat2: float, lon2: float) -> tuple:
    """Return the geographic midpoint of two points (equirectangular, fine at <500 km)."""
    return ((lat1 + lat2) / 2, (lon1 + lon2) / 2)


def _offset_waypoint(
    mid_lat: float, mid_lon: float,
    direction: str = "west",
    offset_deg: float = 0.15
) -> tuple:
    """
    Nudge a midpoint lat/lon by `offset_deg` degrees in a cardinal direction.

    Used for two avoidance heuristics:
      - Weather avoidance: push the midpoint westward (toward the coast /
        shallower, more sheltered water) when wave height or wind is high.
      - Border avoidance: push the midpoint southwest / inward when the vessel
        is dangerously close to an international maritime border.

    0.15° ≈ 16 km — enough to show a visible curve on the map without being
    geographically absurd for Indian coastal distances.
    """
    if direction == "west":
        return (mid_lat, mid_lon - offset_deg)
    elif direction == "east":
        return (mid_lat, mid_lon + offset_deg)
    elif direction == "south":
        return (mid_lat - offset_deg, mid_lon)
    elif direction == "southwest":
        return (mid_lat - offset_deg * 0.7, mid_lon - offset_deg * 0.7)
    else:
        return (mid_lat, mid_lon)


# ---------------------------------------------------------------------------
# NODE FUNCTION
# ---------------------------------------------------------------------------

def routing_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    LangGraph node: build a GeoJSON FeatureCollection for the frontend map.

    This node is purely a data-assembly node — it reads already-computed
    state fields and packages them into a standard GeoJSON structure.
    No external API calls, no ML inference, no safety decisions.

    Returns:
        {"map_geojson": {...}}         on success
        {"map_geojson": None,
         "errors": ["..."]}            on any failure
    """

    # ------------------------------------------------------------------
    # GUARD: vessel location is the non-negotiable minimum input.
    # Without it we cannot draw any map features.
    # ------------------------------------------------------------------
    location = state.get("location")
    if not location or "lat" not in location or "lon" not in location:
        return {
            "map_geojson": None,
            "errors": ["Vessel location missing — cannot generate navigation route."],
        }

    try:
        vessel_lat: float = float(location["lat"])
        vessel_lon: float = float(location["lon"])

        # Pull the other inputs — all optional (upstream nodes may have failed)
        pfz_data:        Optional[dict] = state.get("pfz_data")
        weather_data:    Optional[dict] = state.get("weather_data")
        geofence_result: Optional[dict] = state.get("geofence_result")

        # ------------------------------------------------------------------
        # STEP 1: SELECT DESTINATION
        #
        # Priority order:
        #   A) Nearest zone from pfz_data["nearby_zones"] — the agent's
        #      primary purpose is to route vessels toward INCOIS-advised
        #      fishing zones, so this is the preferred destination.
        #   B) Safe offshore fallback (+0.1° lat, +0.12° lon ≈ 11–15 km
        #      northeast of the vessel) when PFZ data is absent or empty.
        # ------------------------------------------------------------------
        dest_lat:   float = vessel_lat  + 0.10   # fallback: ~11 km north
        dest_lon:   float = vessel_lon  + 0.12   # fallback: ~12 km east
        dest_depth: Optional[float] = None
        dest_dist:  Optional[float] = None
        has_pfz_dest: bool = False

        nearby_zones: Optional[list] = (
            pfz_data.get("nearby_zones") if pfz_data else None
        )

        if nearby_zones:
            # Zones were already sorted by distance in pfz_agent, so the first
            # element is the nearest.  We take [0] and trust pfz_agent's sort.
            nearest = nearby_zones[0]
            dest_lat   = float(nearest.get("lat",  vessel_lat + 0.10))
            dest_lon   = float(nearest.get("lon",  vessel_lon + 0.12))
            dest_depth = nearest.get("depth_m")
            dest_dist  = nearest.get("distance_from_coast_km")
            has_pfz_dest = True

        # ------------------------------------------------------------------
        # STEP 2: BUILD NAVIGATION ROUTE WAYPOINTS
        #
        # Baseline: straight line [vessel → dest]
        # We then apply up to two independent avoidance adjustments to the
        # midpoint of that straight line:
        #
        # A) Weather avoidance
        #    Triggered when wave_height_m > 2.0 OR wind_speed_kmh > 35.0
        #    (below the risk_agent's "unsafe" thresholds but already
        #    uncomfortable for small fishing boats).
        #    Action: curve the midpoint westward toward more sheltered water.
        #
        # B) Border proximity avoidance
        #    Triggered when distance_to_indian_border_km < 10 (very close to
        #    an international maritime border — risky for fishermen).
        #    Action: offset the midpoint southwest to keep the route clearly
        #    inside Indian waters.
        #
        # Both adjustments compound: if both fire, both offsets are applied
        # (accumulated from the same midpoint, so the curve is more pronounced).
        # ------------------------------------------------------------------
        mid_lat, mid_lon = _midpoint(vessel_lat, vessel_lon, dest_lat, dest_lon)

        wave_height  = (weather_data  or {}).get("wave_height_m",  0.0) or 0.0
        wind_speed   = (weather_data  or {}).get("wind_speed_kmh", 0.0) or 0.0
        border_dist  = (geofence_result or {}).get("distance_to_indian_border_km", 999.0) or 999.0

        weather_avoidance: bool = (wave_height > 2.0) or (wind_speed > 35.0)
        border_avoidance:  bool = border_dist < 10.0

        if weather_avoidance:
            # Push the intermediate waypoint west — toward the coast and
            # shallower, calmer water.  Magnitude: 0.15° ≈ 16 km.
            mid_lat, mid_lon = _offset_waypoint(mid_lat, mid_lon, "west", 0.15)

        if border_avoidance:
            # Push southwest — inward, away from the international border.
            # We use a smaller offset (0.10°) so we don't overshoot the coast.
            mid_lat, mid_lon = _offset_waypoint(mid_lat, mid_lon, "southwest", 0.10)

        # Build the route coordinate list.  GeoJSON uses [lon, lat] order.
        if weather_avoidance or border_avoidance:
            # 3-point curved route: vessel → avoidance waypoint → destination
            route_coords: List[List[float]] = [
                [vessel_lon, vessel_lat],
                [mid_lon,    mid_lat],
                [dest_lon,   dest_lat],
            ]
        else:
            # Straight-line 2-point route: vessel → destination
            route_coords = [
                [vessel_lon, vessel_lat],
                [dest_lon,   dest_lat],
            ]

        # ------------------------------------------------------------------
        # STEP 3: ASSEMBLE GEOJSON FEATURECOLLECTION
        #
        # Standard RFC 7946 GeoJSON.  Three features:
        #   1. Vessel Point   — where the user is right now
        #   2. Destination Point — nearest PFZ zone (or fallback waypoint)
        #   3. Route LineString  — the navigation path
        #
        # Properties are kept minimal and UI-friendly: the Streamlit frontend
        # reads "type" to decide which icon / color to use for each feature.
        # ------------------------------------------------------------------
        dest_properties: dict = {
            "type":  "pfz" if has_pfz_dest else "waypoint",
            "title": "Recommended Fishing Zone" if has_pfz_dest else "Safe Offshore Waypoint",
        }
        if dest_depth is not None:
            dest_properties["depth_m"] = dest_depth
        if dest_dist is not None:
            dest_properties["distance_km"] = dest_dist

        route_properties: dict = {
            "type":  "route",
            "title": "Suggested Waypoint Route",
            "weather_avoidance": weather_avoidance,
            "border_avoidance":  border_avoidance,
        }

        geojson: dict = {
            "type": "FeatureCollection",
            "features": [
                # Feature 1 — Vessel position
                {
                    "type": "Feature",
                    "geometry": {
                        "type":        "Point",
                        "coordinates": [vessel_lon, vessel_lat],  # [lon, lat] per RFC 7946
                    },
                    "properties": {
                        "type":  "vessel",
                        "title": "Your Vessel",
                    },
                },
                # Feature 2 — Destination (PFZ or fallback waypoint)
                {
                    "type": "Feature",
                    "geometry": {
                        "type":        "Point",
                        "coordinates": [dest_lon, dest_lat],
                    },
                    "properties": dest_properties,
                },
                # Feature 3 — Navigation route
                {
                    "type": "Feature",
                    "geometry": {
                        "type":        "LineString",
                        "coordinates": route_coords,
                    },
                    "properties": route_properties,
                },
            ],
        }

        return {"map_geojson": geojson}

    except Exception as exc:
        # Catch-all: routing failure must never crash the rest of the pipeline.
        # synthesis_node and risk_node run independently; the map just won't render.
        return {
            "map_geojson": None,
            "errors": [f"Routing failure: {str(exc)}"],
        }
