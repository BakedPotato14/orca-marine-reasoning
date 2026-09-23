"""
pfz_agent.py — ORCA LangGraph node: Potential Fishing Zone (PFZ) lookup.

Reads:  state["location"]
Writes: state["pfz_data"]  |  state["errors"]  (on failure)

Data source: A locally cached copy of the INCOIS PFZ advisory (pfz_cache.json).
The live INCOIS endpoint is not hit at runtime; we load the snapshot once at
import time (module-level), pin it for the entire server process, and serve
from memory on every query.  This avoids:
  - Network latency on every request
  - INCOIS rate-limits / downtime killing the agent mid-graph
  - Re-parsing the JSON file on every single node invocation

Failure behaviour: if the cache file is missing or malformed we print a
CRITICAL error and leave PFZ_CACHE as None.  The node then returns
pfz_data=None + an errors list entry so the rest of the graph can continue
without PFZ data (graceful degradation — same philosophy as geofence_agent).
"""

import json
import os
import math
from typing import Dict, Any, Optional

# ---------------------------------------------------------------------------
# MODULE-LEVEL LOAD — executes exactly ONCE when Python first imports this file
# ---------------------------------------------------------------------------

# Build an absolute path relative to THIS file so the import works regardless
# of where the process is started from (e.g. uvicorn from repo root, or a test
# runner from backend/).
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_CACHE_PATH = os.path.join(os.path.dirname(_BASE_DIR), "data", "pfz_cache.json")

# Typed None by default; if loading succeeds this will be the parsed dict.
PFZ_CACHE: Optional[dict] = None

# ---------------------------------------------------------------------------
# IMPORTANT: These are illustrative example values used to demonstrate the
# ecological-diagnostics capability. They are NOT derived from real historical
# satellite or fishery records. Do not present these as real historical findings.
# ---------------------------------------------------------------------------
ILLUSTRATIVE_SECTOR_TRENDS_DEMO_ONLY = {
    "karnataka": {
        "sector_name": "Karnataka Coastal Sector (Mangalore / Malpe)",
        "trend": "declining",
        "sst_anomaly_c": 1.2,
        "chlorophyll_drop_pct": 24,
        "causal_factors": [
            "Thermal displacement of pelagic oil sardines away from shallow nearshore waters",
            "Disruption of seasonal coastal upwelling dynamics along Malpe shelf",
            "Localized overfishing pressure during early spawning season"
        ],
        "historical_period": "Illustrative demo values — not from real historical records"
    },
    "tamil_nadu": {
        "sector_name": "Tamil Nadu Coastal Sector (Chennai / Nagapattinam)",
        "trend": "declining",
        "sst_anomaly_c": 1.4,
        "chlorophyll_drop_pct": 28,
        "causal_factors": [
            "Sea surface temperature elevation causing southward migration of mackerel shoals",
            "Monsoon riverine runoff alteration reducing coastal nutrient enrichment",
            "Intensive trawling impact on benthic nursery habitat"
        ],
        "historical_period": "Illustrative demo values — not from real historical records"
    },
    "kerala": {
        "sector_name": "Kerala Coastal Sector (Kochi / Kollam)",
        "trend": "fluctuating",
        "sst_anomaly_c": 0.9,
        "chlorophyll_drop_pct": 18,
        "causal_factors": [
            "Modulated upwelling along Malabar coast shifting sardine congregation zones offshore",
            "Variable sea surface chlorophyll-a front formation"
        ],
        "historical_period": "Illustrative demo values — not from real historical records"
    },
    "gujarat": {
        "sector_name": "Gujarat Coastal Sector (Veraval / Porbandar)",
        "trend": "stable",
        "sst_anomaly_c": 0.5,
        "chlorophyll_drop_pct": 10,
        "causal_factors": [
            "Sustained northern Arabian Sea chlorophyll-a productivity fronts",
            "Slight thermal warming along Gulf of Kutch shelf"
        ],
        "historical_period": "Illustrative demo values — not from real historical records"
    }
}

def reload_pfz_cache(data: Optional[dict] = None) -> bool:
    """
    Reloads or updates the in-memory PFZ_CACHE from a dict or disk.
    Called on startup and by the background INCOIS PFZ fetcher.
    """
    global PFZ_CACHE
    if data is not None:
        PFZ_CACHE = data
        return True
    try:
        with open(_CACHE_PATH, "r", encoding="utf-8") as _f:
            PFZ_CACHE = json.load(_f)
        return True
    except Exception as _e:
        print(f"CRITICAL: pfz_agent could not load PFZ cache from {_CACHE_PATH}: {_e}")
        return False

reload_pfz_cache()


# ---------------------------------------------------------------------------
# NODE FUNCTION
# ---------------------------------------------------------------------------

def pfz_lookup_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    LangGraph node: looks up the nearest Potential Fishing Zones for a given
    location using the cached INCOIS PFZ advisory, and inspects query for
    ecological diagnostic intent.
    """

    if PFZ_CACHE is None:
        return {
            "pfz_data": None,
            "diagnostic_data": None,
            "errors": ["pfz_lookup_node: PFZ cache file failed to load at startup; no fishing-zone data available."]
        }

    location = state.get("location")
    if not location or "lat" not in location or "lon" not in location:
        return {
            "pfz_data": None,
            "diagnostic_data": None,
            "errors": ["pfz_lookup_node reached without a valid location dict."]
        }

    query_lat = location["lat"]
    query_lon = location["lon"]

    # Check for historical / ecological diagnostic intent in user query
    user_query = state.get("query", "").lower()
    diagnostic_keywords = ["why", "decline", "productivity", "fish catch", "historical", "trend", "less fish"]
    is_diagnostic = any(kw in user_query for kw in diagnostic_keywords)

    diagnostic_data = None
    if is_diagnostic:
        # Resolve target coastal sector based on lat/lon
        if query_lat > 20.0:
            sector_key = "gujarat"
        elif query_lon > 78.5:
            sector_key = "tamil_nadu"
        elif query_lat < 11.5 and query_lon < 77.5:
            sector_key = "kerala"
        else:
            sector_key = "karnataka"
        
        diagnostic_data = ILLUSTRATIVE_SECTOR_TRENDS_DEMO_ONLY.get(sector_key, ILLUSTRATIVE_SECTOR_TRENDS_DEMO_ONLY["karnataka"])

    try:
        zones = PFZ_CACHE.get("zones", [])

        if not zones:
            return {
                "pfz_data": None,
                "diagnostic_data": diagnostic_data,
                "errors": ["pfz_lookup_node: PFZ cache contains no zone entries."]
            }

        def _dist_km(zone: dict) -> float:
            dlat = query_lat - zone["lat"]
            dlon = query_lon - zone["lon"]
            return math.sqrt(dlat**2 + dlon**2) * 111.0

        enriched_zones = [
            {
                "lat":          z["lat"],
                "lon":          z["lon"],
                "distance_km":  round(_dist_km(z), 2),
                "depth_m":      z.get("depth_m"),
                "distance_from_coast_km": z.get("distance_from_coast_km"),
            }
            for z in zones
        ]

        enriched_zones.sort(key=lambda z: z["distance_km"])
        nearest_three = enriched_zones[:3]

        forecast_date_raw = PFZ_CACHE.get("forecast_date", "unknown")
        valid_upto_raw    = PFZ_CACHE.get("valid_upto", "unknown")

        def _fmt_date(iso_str: str) -> str:
            try:
                from datetime import datetime
                dt = datetime.strptime(iso_str, "%Y-%m-%d")
                return dt.strftime("%d %b %Y").lstrip("0")
            except Exception:
                return iso_str

        cache_age_note = (
            f"PFZ advisory issued {_fmt_date(forecast_date_raw)}, "
            f"valid until {_fmt_date(valid_upto_raw)}"
        )

        return {
            "pfz_data": {
                "nearby_zones":    nearest_three,
                "forecast_date":   forecast_date_raw,
                "valid_upto":      valid_upto_raw,
                "cache_age_note":  cache_age_note,
            },
            "diagnostic_data": diagnostic_data,
        }

    except Exception as e:
        return {
            "pfz_data": None,
            "diagnostic_data": diagnostic_data,
            "errors": [f"pfz_lookup_node failed unexpectedly: {str(e)}"]
        }
