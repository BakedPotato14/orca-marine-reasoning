from typing import Dict, Any
from backend.app.services.geofence_data import check_jurisdiction

def geofence_check_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    LangGraph node to verify jurisdiction and distance to maritime borders.
    Updates state['geofence_result'] and appends to state['errors'] on failure.
    """
    location = state.get("location")

    # Defensive guard (same pattern as weather_agent)
    if not location or "lat" not in location or "lon" not in location:
        return {
            "geofence_result": None,
            "errors": ["geofence_check_node reached without a valid location dict."]
        }

    lat = location["lat"]
    lon = location["lon"]

    try:
        jurisdiction_data = check_jurisdiction(lat, lon)
        
        return {
            "geofence_result": jurisdiction_data
        }
    except Exception as e:
        # Catch unexpected geometry failures or unloaded data
        return {
            "geofence_result": None,
            "errors": [f"Geofence evaluation failed: {str(e)}"]
        }