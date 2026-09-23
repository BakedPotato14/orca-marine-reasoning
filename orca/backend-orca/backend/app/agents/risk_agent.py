from typing import Dict, Any, List

def assess_risk_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    LangGraph node to assess environmental safety based on fetched weather data.
    Updates state['risk_verdict'] and state['risk_reasons'].
    
    Thresholds:
    #TODO add in docs and cite that incois uses sophisiticated bsi componenets system and not thresholds we make use of thresholds because the wave height is driving componenet of many bsi componenets
    - Wave Height (Sourced from INCOIS high-wave alert bands):
        >= 3.5m : Unsafe
        2.5m - 3.49m : Caution
        < 2.5m : Safe
    - Wind Speed (Reasonable approximation/domain rule of thumb):
        >= 40 km/h : Unsafe
        30 - 39.9 km/h : Caution
        < 30 km/h : Safe
        
    Roll-up Rule: Highest severity wins. 
    If ANY factor is 'unsafe' -> overall 'unsafe'.
    If NO factor is 'unsafe' but ANY is 'caution' -> overall 'caution'.
    If ALL factors are 'safe' -> overall 'safe'.
    
    Note: Geofence bounds are NOT evaluated here. Physical risk and 
    jurisdictional risk are kept distinct in the state for clearer synthesis.
    """
    weather = state.get("weather_data")
    
    # 1. Handle Missing Data (Fail-Safe)
    if (
        weather is None 
        or weather.get("wave_height_m") is None 
        or weather.get("wind_speed_kmh") is None
    ):
        # Check if weather_agent failed (error logged in state) vs wasn't requested by intent
        errors = state.get("errors") or []
        intent = state.get("intent") or "safety_check"
        
        if intent == "safety_check" or errors:
            return {
                "risk_verdict": "insufficient_data",
                "risk_reasons": ["Incomplete or unavailable weather telemetry — cannot accurately assess physical safety."]
            }
        else:
            # Weather agent was legitimately not invoked for this query intent (e.g. pfz_only or geofence_only)
            return {
                "risk_verdict": None,
                "risk_reasons": []
            }
        
    wave_m = weather["wave_height_m"]
    wind_kmh = weather["wind_speed_kmh"]
    geofence = state.get("geofence_result")
    
    verdict = "safe"
    final_reasons: List[str] = []
    
    # 2. Evaluate Wave Height (INCOIS benchmarked)
    wave_status = "safe"
    if wave_m >= 3.5:
        wave_status = "unsafe"
        final_reasons.append(f"Wave height of {wave_m:.1f}m exceeds the unsafe threshold of 3.5m (based on INCOIS high-wave warning bands).")
    elif wave_m >= 2.5:
        wave_status = "caution"
        final_reasons.append(f"Wave height of {wave_m:.1f}m is elevated and warrants caution (INCOIS threshold: 2.5m - 3.5m).")

    # 3. Evaluate Wind Speed (Approximated threshold)
    wind_status = "safe"
    if wind_kmh >= 40:
        wind_status = "unsafe"
        final_reasons.append(f"Wind speed of {wind_kmh:.1f} km/h exceeds general safe operating limits (>= 40 km/h).")
    elif wind_kmh >= 30:
        wind_status = "caution"
        final_reasons.append(f"Wind speed of {wind_kmh:.1f} km/h is elevated and warrants caution (30 - 40 km/h band).")

    # 4. Evaluate Jurisdictional & Maritime Boundary Clearance
    jurisdiction_status = "safe"
    if geofence:
        in_indian_waters = geofence.get("in_indian_waters", True)
        current_jurisdiction = geofence.get("current_jurisdiction", "India")
        dist_km = geofence.get("distance_to_indian_border_km")

        if not in_indian_waters:
            jurisdiction_status = "unsafe"
            final_reasons.append(
                f"Vessel location is outside Indian territorial waters/EEZ (Current zone: {current_jurisdiction}). "
                "Crossing international maritime boundary is strictly hazardous."
            )
        elif dist_km is not None:
            if dist_km < 5.0:
                jurisdiction_status = "unsafe"
                final_reasons.append(
                    f"Extreme border proximity: Vessel is only {dist_km:.1f} km from international maritime boundary (< 5 km buffer)."
                )
            elif dist_km < 20.0:
                jurisdiction_status = "caution"
                final_reasons.append(
                    f"Border proximity warning: Vessel is {dist_km:.1f} km from international maritime boundary (caution band: < 20 km)."
                )

    # 5. Roll-up Logic (Highest watermark rule)
    if wave_status == "unsafe" or wind_status == "unsafe" or jurisdiction_status == "unsafe":
        verdict = "unsafe"
    elif wave_status == "caution" or wind_status == "caution" or jurisdiction_status == "caution":
        verdict = "caution"

    # 6. Final Output Construction
    if verdict == "safe":
        if geofence and geofence.get("distance_to_indian_border_km") is not None:
            final_reasons = [
                f"Conditions are safe: Wave height ({wave_m:.1f}m) and wind speed ({wind_kmh:.1f} km/h) are within safe operating limits, "
                f"and maritime boundary clearance ({geofence['distance_to_indian_border_km']:.1f} km) is well beyond the 20 km caution band."
            ]
        else:
            final_reasons = ["Both wave height and wind speed for tomorrow are within safe operating limits."]
            
    return {
        "risk_verdict": verdict,
        "risk_reasons": final_reasons
    }