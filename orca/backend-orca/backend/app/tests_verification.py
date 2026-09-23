"""
tests_verification.py — Automated verification for ORCA enhancements:
1. Risk agent boundary distance & weather integration.
2. NAVTEX ITU-R M.540 formatting compliance (max 400 chars, ZCZC / NNNN).
3. PFZ edge cache reload & refresh handling.
4. Redis checkpointer fallback mechanism.
"""

import sys
import os

# Ensure backend root is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(BASE_DIR)
REPO_ROOT = os.path.dirname(APP_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app.agents.risk_agent import assess_risk_node
from backend.app.main import format_navtex_message
from backend.app.services.pfz_fetcher import refresh_pfz_cache
from backend.app.graph import _init_checkpointer
from langgraph.checkpoint.memory import MemorySaver


def test_risk_agent_scenarios():
    print("Testing assess_risk_node scenarios...")

    # Scenario 1: Safe sea state & Safe border clearance (>20 km)
    state_safe = {
        "weather_data": {"wave_height_m": 1.2, "wind_speed_kmh": 18.0},
        "geofence_result": {
            "in_indian_waters": True,
            "current_jurisdiction": "India",
            "distance_to_indian_border_km": 42.5,
        },
    }
    res_safe = assess_risk_node(state_safe)
    assert res_safe["risk_verdict"] == "safe", f"Expected safe, got {res_safe['risk_verdict']}"
    assert any("safe operating limits" in r for r in res_safe["risk_reasons"])
    print("  [PASS] Scenario 1: Safe sea state + border clearance > 20 km -> SAFE")

    # Scenario 2: Safe sea state + Caution border clearance (< 20 km)
    state_caution_border = {
        "weather_data": {"wave_height_m": 1.2, "wind_speed_kmh": 18.0},
        "geofence_result": {
            "in_indian_waters": True,
            "current_jurisdiction": "India",
            "distance_to_indian_border_km": 14.2,
        },
    }
    res_caution_border = assess_risk_node(state_caution_border)
    assert res_caution_border["risk_verdict"] == "caution", f"Expected caution, got {res_caution_border['risk_verdict']}"
    assert any("< 20 km" in r for r in res_caution_border["risk_reasons"])
    print("  [PASS] Scenario 2: Safe sea state + border clearance < 20 km -> CAUTION")

    # Scenario 3: Safe sea state + Extreme border proximity (< 5 km)
    state_unsafe_border = {
        "weather_data": {"wave_height_m": 1.2, "wind_speed_kmh": 18.0},
        "geofence_result": {
            "in_indian_waters": True,
            "current_jurisdiction": "India",
            "distance_to_indian_border_km": 3.1,
        },
    }
    res_unsafe_border = assess_risk_node(state_unsafe_border)
    assert res_unsafe_border["risk_verdict"] == "unsafe", f"Expected unsafe, got {res_unsafe_border['risk_verdict']}"
    assert any("< 5 km" in r for r in res_unsafe_border["risk_reasons"])
    print("  [PASS] Scenario 3: Extreme border proximity < 5 km -> UNSAFE")

    # Scenario 4: Outside Indian waters
    state_outside = {
        "weather_data": {"wave_height_m": 1.0, "wind_speed_kmh": 15.0},
        "geofence_result": {
            "in_indian_waters": False,
            "current_jurisdiction": "Sri Lanka",
            "distance_to_indian_border_km": 8.0,
        },
    }
    res_outside = assess_risk_node(state_outside)
    assert res_outside["risk_verdict"] == "unsafe", f"Expected unsafe, got {res_outside['risk_verdict']}"
    assert any("outside Indian territorial waters" in r for r in res_outside["risk_reasons"])
    print("  [PASS] Scenario 4: Outside Indian EEZ -> UNSAFE")

    # Scenario 5: High waves (>= 3.5m)
    state_high_wave = {
        "weather_data": {"wave_height_m": 3.8, "wind_speed_kmh": 22.0},
        "geofence_result": {
            "in_indian_waters": True,
            "current_jurisdiction": "India",
            "distance_to_indian_border_km": 50.0,
        },
    }
    res_high_wave = assess_risk_node(state_high_wave)
    assert res_high_wave["risk_verdict"] == "unsafe", f"Expected unsafe, got {res_high_wave['risk_verdict']}"
    print("  [PASS] Scenario 5: Wave height >= 3.5m -> UNSAFE")


def test_navtex_serialization():
    print("Testing NAVTEX broadcast message formatting...")
    msg = format_navtex_message(
        lat=12.87,
        lon=74.84,
        verdict="safe",
        reasons=["Normal conditions"],
        weather={"wave_height_m": 1.4, "wind_speed_kmh": 20.0},
        geofence={"in_indian_waters": True, "distance_to_indian_border_km": 45.0},
    )
    assert msg.startswith("ZCZC QA01"), f"Missing ZCZC header: {msg}"
    assert msg.strip().endswith("NNNN"), f"Missing NNNN trailer: {msg}"
    assert len(msg) <= 400, f"NAVTEX exceeds 400 char limit ({len(msg)} chars)"
    assert "12.87N 74.84E" in msg
    assert "VERDICT: SAFE" in msg
    print(f"  [PASS] NAVTEX message verified ({len(msg)} chars <= 400 limit):\n{msg}")


def test_pfz_fetcher_fallback():
    print("Testing PFZ edge fetcher fallback...")
    res = refresh_pfz_cache()
    assert res["status"] in ["cached", "success"]
    print(f"  [PASS] PFZ edge status: {res}")


def test_redis_checkpointer_fallback():
    print("Testing Redis checkpointer initialization fallback...")
    cp = _init_checkpointer()
    assert isinstance(cp, MemorySaver)
    print("  [PASS] MemorySaver fallback successfully verified.")


if __name__ == "__main__":
    test_risk_agent_scenarios()
    test_navtex_serialization()
    test_pfz_fetcher_fallback()
    test_redis_checkpointer_fallback()
    print("\nALL BACKEND ENHANCEMENT TESTS PASSED SUCCESSFULLY! [OK]")
