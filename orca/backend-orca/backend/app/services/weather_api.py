import requests
import math
from datetime import datetime, timedelta
import pytz # pyright: ignore[reportMissingModuleSource]
from typing import Optional, Tuple, Dict, List

WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast"
MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine"
TIMEOUT_SEC = 6.0

# Major Indian coastal reference stations for marine wave resolution when anchor is inland or on coastal land
COASTAL_REFERENCE_PORTS = [
    {"name": "Mangalore Old Port", "lat": 12.86, "lon": 74.84},
    {"name": "Kochi Harbour", "lat": 9.94, "lon": 76.26},
    {"name": "Veraval Port", "lat": 20.90, "lon": 70.37},
    {"name": "Mumbai Sassoon Dock", "lat": 18.91, "lon": 72.82},
    {"name": "Mormugao Port", "lat": 15.42, "lon": 73.80},
    {"name": "Tuticorin Port", "lat": 8.76, "lon": 78.13},
    {"name": "Chennai Kasimedu", "lat": 13.12, "lon": 80.30},
    {"name": "Visakhapatnam Port", "lat": 17.70, "lon": 83.30},
    {"name": "Paradip Port", "lat": 20.32, "lon": 86.61},
    {"name": "Kollam Neendakara", "lat": 8.94, "lon": 76.53},
]


def _fetch_marine_waves_for_date(target_lat: float, target_lon: float, date_str: str) -> List[float]:
    """Helper to query Open-Meteo marine wave height for a specific coordinate and date."""
    try:
        wave_params = {
            "latitude": target_lat,
            "longitude": target_lon,
            "hourly": "wave_height",
            "timezone": "Asia/Kolkata",
            "forecast_days": 3,
        }
        resp = requests.get(MARINE_API_URL, params=wave_params, timeout=TIMEOUT_SEC)
        if resp.status_code != 200:
            return []
        data = resp.json()
        hourly_times = data.get("hourly", {}).get("time", [])
        wave_heights = data.get("hourly", {}).get("wave_height", [])
        valid_waves = [
            wave_heights[i]
            for i, t in enumerate(hourly_times)
            if t.startswith(date_str) and i < len(wave_heights) and wave_heights[i] is not None
        ]
        return valid_waves
    except Exception:
        return []


def get_worst_case_weather_tomorrow(lat: float, lon: float) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Fetches wind and wave data for 'tomorrow' and extracts the maximum (worst-case) values.
    If the vessel is inland or on coastal land where wave models have no grid cells,
    automatically resolves marine wave telemetry from the nearest coastal waters.
    Returns: (weather_data_dict, error_message)
    """
    try:
        ist = pytz.timezone("Asia/Kolkata")
        now_ist = datetime.now(ist)
        tomorrow = now_ist + timedelta(days=1)
        tomorrow_date_str = tomorrow.strftime("%Y-%m-%d")

        # 1. Fetch Wind Data (Standard Weather API - covers all land and sea)
        wind_params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": "wind_speed_10m",
            "timezone": "Asia/Kolkata",
            "forecast_days": 3,
        }
        wind_resp = requests.get(WEATHER_API_URL, params=wind_params, timeout=TIMEOUT_SEC)
        wind_resp.raise_for_status()
        wind_data = wind_resp.json()

        hourly_times = wind_data.get("hourly", {}).get("time", [])
        wind_speeds = wind_data.get("hourly", {}).get("wind_speed_10m", [])

        tomorrow_winds = [
            wind_speeds[i]
            for i, time_str in enumerate(hourly_times)
            if time_str.startswith(tomorrow_date_str) and wind_speeds[i] is not None
        ]

        if not tomorrow_winds:
            return None, f"Open-Meteo missing wind telemetry for tomorrow ({tomorrow_date_str})"

        # 2. Fetch Wave Data at vessel coordinates
        tomorrow_waves = _fetch_marine_waves_for_date(lat, lon, tomorrow_date_str)
        marine_reference_note = None

        # 3. If vessel is inland or on coastline where marine wave cells are null, resolve nearest sea waters
        if not tomorrow_waves:
            # A) Probe offshore in steps: westward for Arabian Sea (lon < 78.5) or eastward for Bay of Bengal (lon >= 78.5)
            direction_mult = -1.0 if lon < 78.5 else 1.0
            for step_deg in [0.15, 0.35, 0.75, 1.25, 1.85, 2.5]:
                test_lon = lon + (step_deg * direction_mult)
                probed = _fetch_marine_waves_for_date(lat, test_lon, tomorrow_date_str)
                if probed:
                    tomorrow_waves = probed
                    marine_reference_note = f"Observed at nearest coastal sea sector ({lat:.2f}°N, {test_lon:.2f}°E) — anchor is inland/harbour."
                    break

        # B) Fallback to nearest major Indian fishing harbour if directional probe was inland
        if not tomorrow_waves:
            sorted_ports = sorted(
                COASTAL_REFERENCE_PORTS,
                key=lambda p: (p["lat"] - lat) ** 2 + (p["lon"] - lon) ** 2,
            )
            for port in sorted_ports:
                port_waves = _fetch_marine_waves_for_date(port["lat"], port["lon"], tomorrow_date_str)
                if port_waves:
                    tomorrow_waves = port_waves
                    marine_reference_note = f"Observed at {port['name']} ({port['lat']}°N, {port['lon']}°E) — closest operational coastal sector."
                    break

        # C) Final safety fallback: If marine API is temporarily unavailable or remote, use safe coastal climatological baseline (1.2m)
        if not tomorrow_waves:
            tomorrow_waves = [1.2]
            marine_reference_note = "Estimated from seasonal coastal baseline (1.2m); live Open-Meteo marine wave grid point offline."

        max_wind = max(tomorrow_winds)
        max_wave = max(tomorrow_waves)

        normalized_data = {
            "date": tomorrow_date_str,
            "wind_speed_kmh": round(max_wind, 1),
            "wave_height_m": round(max_wave, 2),
            "telemetry_note": marine_reference_note,
        }

        return normalized_data, None

    except requests.exceptions.Timeout:
        return None, "Open-Meteo API request timed out."
    except requests.exceptions.RequestException as e:
        return None, f"Open-Meteo API HTTP error: {str(e)}"
    except Exception as e:
        return None, f"Unexpected error parsing weather data: {str(e)}"

