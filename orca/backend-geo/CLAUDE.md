# CLAUDE.md — ORCA ISRO Marine AI Platform

> Project-level instructions for AI assistants working on this codebase.

---

## Project Identity

**Name**: ORCA ISRO Marine AI Platform  
**Purpose**: Near-Real-Time satellite ocean intelligence for Indian Coastal Waters & EEZ  
**Stack**: Python 3.11+ · FastAPI · Folium · xarray · NumPy · GeoPandas · Shapely  
**Entry point**: `uvicorn main:app --reload --host 127.0.0.1 --port 8000`

---

## Architecture Overview

```
geospatial/
├── main.py                    # FastAPI app + lifespan + executive dashboard HTML
├── verify_nc.py               # Dataset & endpoint verification script
├── requirements.txt           # pip dependencies (no version pins)
├── pyrightconfig.json         # Type checker config (venv at ../.venv)
├── data/                      # NetCDF datasets + IMBL GeoJSON (gitignored binaries)
│   ├── indian_ocean_sst.nc    # Live/synthetic SST (thetao)
│   ├── indian_ocean_waves.nc  # Live/synthetic VHM0 + VMDR
│   ├── indian_ocean_chl.nc    # Live/synthetic chlorophyll-a
│   ├── ocean_data.nc          # Merged synthetic fallback
│   └── imbl_boundary.geojson  # India EEZ boundary (3 polygons)
├── services/
│   ├── fetch_data.py          # Copernicus Marine download + synthetic fallback generator
│   ├── spatial_analysis.py    # PFZ engine, safety alerts, IMBL geofencing, data manager
│   └── map_service.py         # Folium map builder (raster overlays + vector layers)
└── routers/
    ├── __init__.py             # Package marker
    ├── data.py                 # REST + GeoJSON API endpoints
    └── maps.py                 # Map serving endpoints (HTML responses)
```

### Layer Dependency (top → bottom)

```
main.py  →  routers/{data,maps}.py
                 ↓
         services/map_service.py  →  services/spatial_analysis.py
                                              ↓
                                     services/fetch_data.py
                                              ↓
                                     data/*.nc, data/*.geojson
```

- **Never** import upward (e.g. services must not import from routers or main).
- `spatial_analysis.py` exposes a singleton `data_manager` (class `SpatialDataManager`) — always use it rather than raw `xr.open_dataset`.
- `map_service.py` depends on `spatial_analysis.py` for computed features (PFZ, safety, IMBL).

---

## Key Design Decisions

### Data Pipeline (`services/fetch_data.py`)

- **Copernicus Marine API** is the primary data source. Credentials come from environment variables (`COPERNICUSMARINE_SERVICE_USERNAME` / `PASSWORD`) OR a cached `~/.copernicusmarine/.copernicusmarine-credentials` file.
- If credentials are missing or download fails, the system **always falls back to synthetic NetCDF** — the server must never crash due to missing data.
- `copernicusmarine` is imported lazily (inside download functions) so the module loads even without it installed.
- **Depth constraint**: SST and Chl use `depth 0.494–1.0 m` (surface only). Wave datasets have no depth dimension.
- Variable fallback chains: SST tries `[thetao, tos, sea_water_potential_temperature]`; Chl tries `[chl, CHL, phyc, chlor_a]`.
- `overwrite=True` is used (not the deprecated `force_download`).

### PFZ Detection Algorithm (`services/spatial_analysis.py`)

```
PFZ_Score = 0.45 × Front_Score + 0.35 × Chl_Score + 0.20 × SST_Score

Front_Score = clip(∇SST / 0.15, 0, 1)
Chl_Score   = clip((Chl - 0.20) / 1.5, 0, 1)
SST_Score   = exp(-(SST - 28.5)² / 6.0)
```

- Composite scores ≥ 55% are extracted as hotspots (stride=5 grid cells).
- Categories: **High** (≥75%), **Moderate** (≥65%), **Promising Edge** (<65%).
- Each hotspot is mapped to nearest port with haversine distance + compass bearing.
- Species recommendations are SST + Chl conditioned.

### Marine Safety Classification

| Wave Height | Severity       |
|-------------|----------------|
| < 2.0 m     | NORMAL         |
| 2.0 – 2.5 m | CAUTION       |
| 2.5 – 3.5 m | ROUGH ALERT   |
| > 3.5 m     | DANGER         |

Evaluated across **7 coastal sectors** (Gujarat → Odisha/West Bengal).

### IMBL Geofencing

- Threshold: **5 NM** (9.26 km) from EEZ boundary.
- Checks all PFZ hotspots + 14 major ports.
- Uses Shapely `exterior.distance()` + haversine for km conversion.

### Maps (`services/map_service.py`)

- Base map: Folium, centered at `[15.0, 77.5]`, bounded to `[5°N–25°N, 65°E–90°E]`.
- 4 base tile layers (OSM default, CartoDB Dark, ESRI Satellite, CartoDB Positron).
- Raster overlays use `_arr_to_rgba()` → `ImageOverlay` (colormaps: turbo, YlGn, Blues).
- PFZ markers use custom CSS pulsing `DivIcon` (not standard Leaflet icons).
- Custom CSS is injected via `m.get_root().header.add_child(folium.Element(PULSE_CSS))`.
- Port markers have state-specific colors and emoji icons.

---

## Spatial Constants

```python
MIN_LON, MAX_LON = 65.0, 90.0   # Indian waters
MIN_LAT, MAX_LAT = 5.0, 25.0
MIN_DEPTH, MAX_DEPTH = 0.494, 1.0  # Surface-only
```

---

## API Endpoints

| Method | Path               | Returns             | Router        |
|--------|--------------------|----------------------|---------------|
| GET    | `/`                | Executive Dashboard  | `main.py`     |
| GET    | `/health`          | JSON health check    | `main.py`     |
| GET    | `/data/summary`    | Regional metrics     | `routers/data.py` |
| GET    | `/data/pfz`        | Filtered PFZ list    | `routers/data.py` |
| GET    | `/data/pfz-geojson` | GeoJSON RFC 7946    | `routers/data.py` |
| GET    | `/data/safety-alerts` | Sector advisories | `routers/data.py` |
| GET    | `/data/imbl-geofence` | IMBL proximity    | `routers/data.py` |
| POST   | `/data/refresh`    | Background fetch     | `routers/data.py` |
| GET    | `/maps/ocean`      | Combined Folium map  | `routers/maps.py` |
| GET    | `/maps/pfz`        | PFZ-focused map      | `routers/maps.py` |
| GET    | `/maps/safety`     | Safety-focused map   | `routers/maps.py` |

---

## Coding Conventions

1. **Type hints**: Use `from __future__ import annotations` at top of every module. Use `Optional`, `Dict`, `List`, `Tuple`, `Any` from `typing`.
2. **Logging**: Use `logging.getLogger("module_name")` — no `print()`. Emoji prefixes in log messages (🔄, ✅, ⚠️, 🛑) for readability.
3. **Docstrings**: Module-level `"""..."""` block at top describing purpose. Function docstrings describe behavior, not just restate name.
4. **Path handling**: Use `pathlib.Path` throughout. `DATA_DIR` is always relative to the module file: `Path(__file__).resolve().parent.parent / "data"`.
5. **NumPy only**: Spatial smoothing and interpolation use pure NumPy (no `scipy` dependency). See `_smooth_2d()` and `_interp_2d_numpy()`.
6. **Error resilience**: Every data loading path has a try/except fallback. Synthetic data is generated if live downloads fail. Dashboard shows hardcoded defaults if `get_marine_summary()` fails.
7. **No global mutable state** besides the `data_manager` singleton and `_IMBL_POLYGON` cache.
8. **HTML in Python**: The executive dashboard is an f-string HTML template in `main.py`. Use `{{` / `}}` for CSS braces in f-strings.

---

## Development Workflow

### Running the server

```bash
cd E:/codes/Projects/geospatial
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Verifying datasets & endpoints

```bash
python verify_nc.py
```

### Refreshing data

```bash
# Via API (background task)
curl -X POST http://127.0.0.1:8000/data/refresh

# Direct CLI
python services/fetch_data.py
```

### Virtual environment

The `.venv` is at `E:/codes/.venv` (parent directory), configured via `pyrightconfig.json`:
```json
{ "venvPath": "..", "venv": ".venv", "extraPaths": ["."] }
```

Activate: `E:\codes\.venv\Scripts\activate`

---

## Critical Gotchas

1. **NetCDF dimension squeezing**: Live datasets may have 3D+ arrays (time, depth, lat, lon). Always squeeze to 2D before analysis using `while da.ndim > 2: da = da.isel({da.dims[0]: 0})`.

2. **Coordinate name normalization**: Live Copernicus files use `latitude`/`longitude`. Synthetic files also use `latitude`/`longitude`. If a new data source uses `lat`/`lon`, it needs renaming.

3. **NaN handling**: Ocean data has NaN over land. Always use `np.nanmin`, `np.nanmax`, `np.nanmean`. Fill NaN before gradient computation with `np.nanmean()` fill.

4. **Chlorophyll grid mismatch**: Chl data is on a coarser grid (0.25° vs 0.083°). It gets bilinearly interpolated onto the SST grid in `compute_pfz_features()`.

5. **IMBL GeoJSON fields**: The tooltip/popup in `map_service.py` references fields `["name", "type", "source"]` from the GeoJSON properties. New boundary files must include these fields.

6. **Copernicus API changes**: Dataset IDs and variable names may change. The fallback chains in `fetch_data.py` handle this, but new variables may need to be added to the candidate lists.

7. **Thread safety**: The startup data fetch runs in a `daemon=True` background thread. `SpatialDataManager.load_datasets()` is not thread-safe — it re-reads from disk each call (acceptable for current scale).

8. **Dashboard f-string escaping**: CSS/JS in the dashboard HTML template requires `{{` and `}}` for literal braces. Missing this causes `KeyError`.

---

## Testing

```python
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)
assert client.get("/health").status_code == 200
assert client.get("/data/summary").status_code == 200
assert client.get("/data/pfz").status_code == 200
assert client.get("/data/pfz-geojson").status_code == 200
assert client.get("/data/safety-alerts").status_code == 200
assert client.get("/data/imbl-geofence").status_code == 200
assert client.get("/maps/ocean").status_code == 200
```

---

## Copernicus Dataset IDs

| Parameter     | Dataset ID                                          | Variables          |
|---------------|-----------------------------------------------------|--------------------|
| SST           | `cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m`     | `thetao`           |
| Waves         | `cmems_mod_glo_wav_anfc_0.083deg_PT3H-i`            | `VHM0`, `VMDR`     |
| Chlorophyll   | `cmems_mod_glo_bgc-pft_anfc_0.25deg_P1D-m`          | `chl`              |
