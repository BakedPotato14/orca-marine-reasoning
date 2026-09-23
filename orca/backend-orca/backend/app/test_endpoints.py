"""
test_endpoints.py — End-to-end FastAPI route verification using starlette/fastapi TestClient.
Tests:
- GET /
- POST /pfz/refresh
- POST /advisory/navtex (and /broadcast)
"""

import sys
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(BASE_DIR)
REPO_ROOT = os.path.dirname(APP_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_endpoints():
    print("Testing GET / health check...")
    r = client.get("/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    print("  [PASS] GET / ->", r.json())

    print("Testing POST /pfz/refresh...")
    r_pfz = client.post("/pfz/refresh")
    assert r_pfz.status_code == 200, f"Expected 200, got {r_pfz.status_code}"
    pfz_data = r_pfz.json()
    assert pfz_data["status"] in ["cached", "success"]
    print("  [PASS] POST /pfz/refresh ->", pfz_data)

    print("Testing POST /advisory/navtex...")
    payload = {
        "query": "Is it safe to fish tomorrow near Mangalore?",
        "lat": 12.87,
        "lon": 74.84,
        "thread_id": "test_session_navtex"
    }
    r_navtex = client.post("/advisory/navtex", json=payload)
    assert r_navtex.status_code == 200, f"Expected 200, got {r_navtex.status_code}: {r_navtex.text}"
    navtex_res = r_navtex.json()
    assert "navtex_message" in navtex_res
    assert navtex_res["char_count"] <= 400
    assert navtex_res["navtex_message"].startswith("ZCZC")
    assert navtex_res["navtex_message"].strip().endswith("NNNN")
    print("  [PASS] POST /advisory/navtex ->\n" + navtex_res["navtex_message"])

    print("\nALL FASTAPI ENDPOINT TESTS PASSED SUCCESSFULLY! [OK]")

if __name__ == "__main__":
    test_endpoints()
