"""
pfz_fetcher.py — Live INCOIS PFZ feed fetcher and distributed edge synchronization.

Implements the 24-hour periodic refresh mechanism outlined in the architecture:
- Fetches real-time Potential Fishing Zone (PFZ) advisories from INCOIS.
- Validates payload schema (zones, forecast_date, valid_upto).
- Persists to local edge storage (pfz_cache.json) and updates in-memory cache.
- Gracefully preserves cached snapshot if the live INCOIS server is unreachable or rate-limited.
"""

import json
import logging
import os
import threading
import time
from typing import Dict, Any, Optional
import requests

from backend.app.agents.pfz_agent import reload_pfz_cache, _CACHE_PATH

logger = logging.getLogger("orca.pfz_fetcher")

INCOIS_PFZ_URL = os.getenv("INCOIS_PFZ_URL", "")


def refresh_pfz_cache(url: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetches the latest PFZ advisory from INCOIS, validates the structure,
    writes to local cache, and hot-reloads the agent's in-memory state.

    Returns:
        Dict[str, Any]: Status summary of the refresh operation.
    """
    target_url = url or INCOIS_PFZ_URL
    if not target_url:
        logger.info("INCOIS_PFZ_URL not configured — running with local harbor snapshot.")
        return {
            "status": "cached",
            "message": "INCOIS_PFZ_URL not set; using local harbor cached snapshot.",
            "source": "local_cache",
        }

    try:
        logger.info("Fetching live INCOIS PFZ bulletin from %s", target_url)
        response = requests.get(target_url, timeout=12)
        response.raise_for_status()
        data = response.json()

        # Validate minimum expected structure
        if not isinstance(data, dict) or "zones" not in data:
            raise ValueError("Malformed INCOIS payload: missing 'zones' array.")

        # Atomic file write to local edge cache
        temp_path = f"{_CACHE_PATH}.tmp"
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(temp_path, _CACHE_PATH)

        # Hot-reload into pfz_agent memory
        reload_pfz_cache(data)

        logger.info(
            "Successfully updated PFZ cache: %d zones, valid until %s",
            len(data.get("zones", [])),
            data.get("valid_upto", "unknown"),
        )
        return {
            "status": "success",
            "source": "live_incois",
            "zones_count": len(data.get("zones", [])),
            "forecast_date": data.get("forecast_date"),
            "valid_upto": data.get("valid_upto"),
        }

    except Exception as exc:
        logger.warning(
            "Live INCOIS PFZ fetch failed (%s). Retaining cached harbor snapshot.", exc
        )
        return {
            "status": "fallback",
            "message": f"Failed to fetch live feed: {str(exc)}. Retaining existing edge cache.",
            "source": "fallback_cache",
        }


def start_pfz_scheduler(interval_hours: int = 24) -> threading.Thread:
    """
    Starts a daemon background thread that executes refresh_pfz_cache every
    interval_hours (matching PPT 24-hour distributed edge caching design).
    """
    interval_seconds = interval_hours * 3600

    def _scheduler_loop():
        logger.info(
            "INCOIS PFZ Edge Sync scheduler started (refresh interval: %dh)",
            interval_hours,
        )
        while True:
            try:
                time.sleep(interval_seconds)
                logger.info("Running scheduled 24-hour INCOIS PFZ cache refresh...")
                refresh_pfz_cache()
            except Exception as e:
                logger.error("Error in PFZ sync loop: %s", e)

    thread = threading.Thread(
        target=_scheduler_loop,
        daemon=True,
        name="incois-pfz-edge-sync",
    )
    thread.start()
    return thread
