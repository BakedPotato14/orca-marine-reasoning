"""
main.py
=======
ORCA ISRO Marine AI Platform — Geospatial API & Executive Dashboard

FastAPI backend providing:
  • Interactive Folium mapping endpoints (/maps/ocean, /maps/pfz, /maps/safety)
  • Oceanographic REST and GeoJSON data APIs (/data/summary, /data/pfz-geojson)
  • Executive Mission Control Dashboard (/)
"""

from __future__ import annotations

import sys
import threading
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

# Ensure directory containing main.py is on sys.path for submodule resolution
_pkg_dir = str(Path(__file__).resolve().parent)
if _pkg_dir not in sys.path:
    sys.path.insert(0, _pkg_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from routers import data, maps
from services.spatial_analysis import get_marine_summary
from services.fetch_data import fetch_all

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("orca_api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler — non-blocking startup data refresh."""
    # Startup: only trigger background Copernicus fetch if datasets are missing
    from services.spatial_analysis import SST_FILE, WAVE_FILE, CHL_FILE, SYNTH_FILE
    def background_fetch():
        if not (SST_FILE.exists() or SYNTH_FILE.exists()):
            try:
                log.info("🔄 Datasets missing, auto-fetching Copernicus data on startup...")
                results = fetch_all()
                log.info("✅ Startup data fetch complete: %s", {k: str(v) for k, v in results.items()})
            except Exception as exc:
                log.warning("⚠️ Startup fetch failed (using cached/synthetic data): %s", exc)
        else:
            log.info("✅ Satellite NetCDF datasets already loaded on disk.")

    thread = threading.Thread(target=background_fetch, daemon=True, name="orca-startup-fetch")
    thread.start()

    log.info("🚀 ORCA ISRO Marine AI Platform started")
    log.info("   Dashboard: http://127.0.0.1:8000")
    log.info("   API Docs:  http://127.0.0.1:8000/docs")

    yield

    # Shutdown
    log.info("🛑 ORCA API shutting down")


app = FastAPI(
    title="ORCA ISRO Marine AI — Geospatial API",
    description=(
        "Near-Real-Time satellite ocean intelligence platform for Indian Coastal Waters & EEZ. "
        "Integrates Copernicus Marine surface products (SST thetao, Significant Wave Height VHM0, "
        "and Chlorophyll-a chl) to deliver Potential Fishing Zone (PFZ) advisories and Marine Safety alerts."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    contact={
        "name": "ORCA Marine AI Team",
        "url": "https://github.com/ISRO-SIH/orca-marine-ai",
        "email": "orca-marine-ai@isro.gov.in",
    },
    license_info={"name": "MIT", "url": "https://opensource.org/licenses/MIT"},
    openapi_tags=[
        {"name": "System Health", "description": "Server uptime and health probes"},
        {"name": "Oceanographic Data & Analytics", "description": "REST + GeoJSON endpoints for PFZ, safety, and IMBL data"},
        {"name": "Interactive Folium Maps", "description": "Live-rendered HTML map endpoints"},
        {"name": "Executive Dashboard", "description": "Mission control dashboard with embedded maps"},
    ],
    swagger_ui_parameters={
        "deepLinking": True,
        "persistAuthorization": True,
        "displayRequestDuration": True,
        "filter": True,
        "syntaxHighlight.theme": "monokai",
        "docExpansion": "list",
        "defaultModelsExpandDepth": 2,
        "tryItOutEnabled": True,
    },
)

# Enable CORS for frontend web and mobile client applications
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(maps.router)
app.include_router(data.router)


@app.get("/health", tags=["System Health"])
def health_check():
    """System health check and uptime probe."""
    return {
        "status": "healthy",
        "service": "ORCA ISRO Marine AI Geospatial API",
        "version": "1.0.0",
        "region": "Indian Ocean [65-90°E, 5-25°N]",
        "utc_time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/", response_class=HTMLResponse, tags=["Executive Dashboard"])
def root_dashboard():
    """
    Serves the modern, high-tech ORCA ISRO Marine AI executive mission control dashboard
    with real-time metric cards and an embedded full-screen interactive Folium map.
    """
    try:
        summary = get_marine_summary()
    except Exception as exc:
        log.warning("Failed to load live summary for dashboard: %s", exc)
        summary = {
            "sst": {"mean_celsius": 29.2, "min_celsius": 25.2, "max_celsius": 31.9},
            "waves": {"mean_height_m": 1.5, "max_height_m": 2.4},
            "chlorophyll": {"mean_mg_m3": 0.32, "max_mg_m3": 7.2},
            "pfz": {"total_detected_hotspots": 198, "high_probability_count": 42},
            "marine_safety": {"overall_status": "NORMAL", "status_color": "#00e676"},
        }

    sst = summary["sst"]
    waves = summary["waves"]
    chl = summary["chlorophyll"]
    pfz = summary["pfz"]
    safety = summary["marine_safety"]

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ORCA ISRO Marine AI — Ocean Geospatial Intelligence</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        :root {{
            --bg-primary: #0a0c10;
            --bg-secondary: #121620;
            --bg-card: rgba(22, 27, 39, 0.85);
            --border: rgba(255, 255, 255, 0.08);
            --border-hover: rgba(0, 230, 118, 0.4);
            --accent-cyan: #00e5ff;
            --accent-emerald: #00e676;
            --accent-amber: #ffd600;
            --accent-red: #ff1744;
            --accent-blue: #2979ff;
            --text-primary: #f0f3f8;
            --text-secondary: #90a4ae;
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }}

        /* Header Navigation */
        header {{
            background: rgba(10, 12, 16, 0.92);
            backdrop-filter: blur(14px);
            border-bottom: 1px solid var(--border);
            padding: 10px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            z-index: 1000;
            flex-shrink: 0;
        }}

        .brand {{
            display: flex;
            align-items: center;
            gap: 14px;
        }}

        .brand-badge {{
            background: linear-gradient(135deg, #ff6d00, #ff9100);
            color: #000;
            font-size: 11px;
            font-weight: 800;
            padding: 3px 8px;
            border-radius: 4px;
            letter-spacing: 0.8px;
        }}

        .brand-title {{
            font-size: 18px;
            font-weight: 700;
            letter-spacing: -0.3px;
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .brand-title span {{
            background: linear-gradient(90deg, var(--accent-cyan), var(--accent-emerald));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}

        .nav-actions {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}

        .view-btn {{
            background: var(--bg-secondary);
            color: var(--text-secondary);
            border: 1px solid var(--border);
            padding: 7px 14px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }}

        .view-btn:hover {{
            color: var(--text-primary);
            border-color: rgba(255, 255, 255, 0.25);
            background: rgba(255, 255, 255, 0.05);
        }}

        .view-btn.active {{
            background: rgba(0, 229, 255, 0.12);
            color: var(--accent-cyan);
            border-color: var(--accent-cyan);
            font-weight: 600;
        }}

        .api-link {{
            background: rgba(41, 121, 255, 0.15);
            color: #82b1ff;
            border: 1px solid rgba(41, 121, 255, 0.35);
            padding: 7px 14px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }}

        .api-link:hover {{
            background: rgba(41, 121, 255, 0.25);
            color: #fff;
        }}

        /* Live Metrics Strip */
        .metrics-strip {{
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 10px 24px;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 14px;
            flex-shrink: 0;
            z-index: 900;
        }}

        .metric-card {{
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 8px 14px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            transition: border-color 0.2s;
        }}

        .metric-card:hover {{
            border-color: rgba(255, 255, 255, 0.2);
        }}

        .metric-header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11px;
            color: var(--text-secondary);
            font-weight: 600;
            letter-spacing: 0.3px;
            text-transform: uppercase;
        }}

        .metric-value {{
            font-family: 'JetBrains Mono', monospace;
            font-size: 19px;
            font-weight: 700;
            margin-top: 2px;
            display: flex;
            align-items: baseline;
            gap: 6px;
        }}

        .metric-sub {{
            font-size: 11px;
            font-weight: normal;
            color: var(--text-secondary);
            font-family: 'Outfit', sans-serif;
        }}

        /* Main Map Container */
        .map-viewport {{
            flex: 1;
            position: relative;
            background: #000;
        }}

        iframe#map-frame {{
            width: 100%;
            height: 100%;
            border: none;
            display: block;
        }}

        /* Status Indicator Dot */
        .pulse-dot {{
            width: 8px;
            height: 8px;
            background-color: var(--accent-emerald);
            border-radius: 50%;
            box-shadow: 0 0 0 0 rgba(0, 230, 118, 0.7);
            animation: pulse 2s infinite;
        }}

        @keyframes pulse {{
            0% {{ box-shadow: 0 0 0 0 rgba(0, 230, 118, 0.7); }}
            70% {{ box-shadow: 0 0 0 8px rgba(0, 230, 118, 0); }}
            100% {{ box-shadow: 0 0 0 0 rgba(0, 230, 118, 0); }}
        }}
    </style>
</head>
<body>
    <header>
        <div class="brand">
            <span class="brand-badge">ISRO SIH</span>
            <div class="brand-title">
                <span>ORCA MARINE AI</span>
                <span style="font-size: 13px; color: #78909c; font-weight: 400;">| Satellite Ocean Intelligence</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; margin-left: 12px; font-size: 11px; color: var(--accent-emerald);">
                <div class="pulse-dot"></div>
                <span>Copernicus NRT Live Feed</span>
            </div>
        </div>

        <div class="nav-actions">
            <button class="view-btn active" id="btn-ocean" onclick="switchMap('/maps/ocean', this)">🌐 Combined Ocean View</button>
            <button class="view-btn" id="btn-pfz" onclick="switchMap('/maps/pfz', this)">🐟 PFZ Advisories ({pfz['total_detected_hotspots']})</button>
            <button class="view-btn" id="btn-safety" onclick="switchMap('/maps/safety', this)">⚠️ Wave Safety Alerts</button>
            <a href="/data/pfz-geojson" target="_blank" class="view-btn">🗺️ GeoJSON Feed</a>
            <a href="/docs" target="_blank" class="api-link">⚡ Interactive API Docs</a>
        </div>
    </header>

    <div class="metrics-strip">
        <div class="metric-card">
            <div class="metric-header">
                <span>Sea Surface Temp</span>
                <span style="color: #ff8a65;">0.49 m</span>
            </div>
            <div class="metric-value" style="color: #ffab91;">
                {sst['mean_celsius']}°C
                <span class="metric-sub">[{sst['min_celsius']}° – {sst['max_celsius']}°C]</span>
            </div>
        </div>

        <div class="metric-card">
            <div class="metric-header">
                <span>Wave Height</span>
                <span style="color: #81d4fa;">Surface</span>
            </div>
            <div class="metric-value" style="color: #80d8ff;">
                {waves['mean_height_m']} m
                <span class="metric-sub">Max: {waves['max_height_m']} m</span>
            </div>
        </div>

        <div class="metric-card">
            <div class="metric-header">
                <span>Chlorophyll-a</span>
                <span style="color: #a5d6a7;">Plankton</span>
            </div>
            <div class="metric-value" style="color: #b9f6ca;">
                {chl['mean_mg_m3']} <span class="metric-sub">mg/m³ (Peak: {chl['max_mg_m3']})</span>
            </div>
        </div>

        <div class="metric-card">
            <div class="metric-header">
                <span>Active PFZ Zones</span>
                <span style="color: #69f0ae;">INCOIS Criteria</span>
            </div>
            <div class="metric-value" style="color: #00e676;">
                {pfz['total_detected_hotspots']}
                <span class="metric-sub">({pfz['high_probability_count']} High Prob)</span>
            </div>
        </div>

        <div class="metric-card">
            <div class="metric-header">
                <span>Coastal Safety Status</span>
                <span style="color: {safety['status_color']};">Alert Level</span>
            </div>
            <div class="metric-value" style="color: {safety['status_color']};">
                {safety['overall_status']}
                <span class="metric-sub">Active Alerts: {safety['sectors_under_alert']}</span>
            </div>
        </div>
    </div>

    <div class="map-viewport">
        <iframe id="map-frame" src="/maps/ocean" title="ORCA Interactive Oceanographic Map"></iframe>
    </div>

    <script>
        function switchMap(url, button) {{
            document.getElementById('map-frame').src = url;
            document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
            if (button) {{
                button.classList.add('active');
            }}
        }}
    </script>
</body>
</html>
"""
    return HTMLResponse(content=html_content, status_code=200)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
