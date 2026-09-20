import requests
from datetime import datetime, timedelta
import pytz # pyright: ignore[reportMissingModuleSource] #TODO see this once try to remove the pyright
from typing import Optional, Tuple, Dict

# Open-Meteo requires separate endpoints for standard weather (wind) and marine data (waves)
WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast"
MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine"
TIMEOUT_SEC = 5.0

def get_worst_case_weather_tomorrow(lat: float, lon: float) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Fetches wind and wave data for 'tomorrow' and extracts the maximum (worst-case) values.
    Returns: (weather_data_dict, error_message)
    """
    try:
        # Define 'tomorrow' in the specific timezone of the users (IST)
        ist = pytz.timezone('Asia/Kolkata')
        now_ist = datetime.now(ist)
        tomorrow = now_ist + timedelta(days=1)
        tomorrow_date_str = tomorrow.strftime("%Y-%m-%d")

        # 1. Fetch Wind Data (Standard Weather API)
        # Passing timezone=Asia/Kolkata ensures the API returns hourly timestamps perfectly aligned with IST days
        wind_params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": "wind_speed_10m",
            "timezone": "Asia/Kolkata",
            "forecast_days": 3 # Fetch enough days to cover tomorrow safely
        }
        wind_resp = requests.get(WEATHER_API_URL, params=wind_params, timeout=TIMEOUT_SEC)
        wind_resp.raise_for_status()
        wind_data = wind_resp.json()

        # 2. Fetch Wave Data (Marine API)
        wave_params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": "wave_height",
            "timezone": "Asia/Kolkata",
            "forecast_days": 3
        }
        wave_resp = requests.get(MARINE_API_URL, params=wave_params, timeout=TIMEOUT_SEC)
        wave_resp.raise_for_status()
        wave_data = wave_resp.json()

        # 3. Parse and extract worst-case values for tomorrow
        hourly_times = wind_data.get("hourly", {}).get("time", [])
        wind_speeds = wind_data.get("hourly", {}).get("wind_speed_10m", [])
        
        # Marine API times should align perfectly since we used the same timezone and coordinates
        wave_heights = wave_data.get("hourly", {}).get("wave_height", [])

        tomorrow_winds = []
        tomorrow_waves = []

        for i, time_str in enumerate(hourly_times):
            if time_str.startswith(tomorrow_date_str):
                # Safely collect values, ignoring any None/null data points
                if wind_speeds[i] is not None:
                    tomorrow_winds.append(wind_speeds[i])
                if i < len(wave_heights) and wave_heights[i] is not None:
                    tomorrow_waves.append(wave_heights[i])

        if not tomorrow_winds or not tomorrow_waves:
            return None, f"Open-Meteo missing data for tomorrow ({tomorrow_date_str})"

        # Calculate the daily maximums (worst-case scenario)
        #max isliye liyq cuz worst case, we are not asking is it safe at this hour we are asking is it safe that specifuc day
        max_wind = max(tomorrow_winds)
        max_wave = max(tomorrow_waves)

        normalized_data = {
            "date": tomorrow_date_str,
            "wind_speed_kmh": max_wind,
            "wave_height_m": max_wave
        }
        
        return normalized_data, None

    except requests.exceptions.Timeout:
        return None, "Open-Meteo API request timed out."
    except requests.exceptions.RequestException as e:
        return None, f"Open-Meteo API HTTP error: {str(e)}"
    except Exception as e:
        return None, f"Unexpected error parsing weather data: {str(e)}"
