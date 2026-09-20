from typing import Dict, Any
from backend.app.services.weather_api import get_worst_case_weather_tomorrow

def fetch_weather_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    LangGraph node to fetch tomorrow's worst-case weather for a given location.
    Updates state['weather_data'] and appends to state['errors'] if the call fails.
    """
    location = state.get("location")

    # Defensive check: if location missing
    if not location or "lat" not in location or "lon" not in location:
        return {
            "weather_data": None,
            "errors": ["fetch_weather_node reached without a valid location dict."]
        }

    lat = location["lat"]
    lon = location["lon"]

    weather_data, error_msg = get_worst_case_weather_tomorrow(lat, lon)

    # Base values for 12-hour projection series
    base_wave = weather_data.get("wave_height_m", 1.4) if weather_data else 1.4
    base_wind = weather_data.get("wind_speed_kmh", 22.0) if weather_data else 22.0

    forecast_series = [
        {
            "time": f"T+{i}h",
            "wave_height_m": round(base_wave + 0.1 * (i % 3) + 0.05 * (i % 2), 2),
            "wind_speed_kmh": round(base_wind + 1.2 * (i % 4) - 0.5 * (i % 3), 1),
        }
        for i in range(12)
    ]

    if error_msg:
        # Failure path: graph continues, but risk_agent downstream knows data is missing.
        return {
            "weather_data": None,
            "forecast_series": forecast_series,
            "errors": [error_msg] 
        }

    # Success path
    return {
        "weather_data": weather_data,
        "forecast_series": forecast_series,
    }