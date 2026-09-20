# 🌊 ORCA — Ocean Risk & Condition Advisory Platform

**ORCA** is an AI-powered marine safety advisory system for Indian Ocean fisheries. It combines real-time satellite telemetry (SST, chlorophyll-a, wave data) from Copernicus Marine Service with a multi-agent LangGraph AI system to deliver natural-language safety advisories in multiple Indian languages.

---

## Architecture

```
orca/
├── frontend/          # Next.js 16 App Router — unified dashboard UI
├── backend-geo/       # FastAPI — geospatial data server (Folium maps, NetCDF pipeline)
├── backend-orca/      # FastAPI — LangGraph multi-agent advisory system
│   └── backend/       # Python package root (imports: backend.app.main)
│       └── app/       # Agents, services, graph, routes
└── docs/              # PROGRESS.md, architecture docs
```

### Three-Service Stack

| Service | Port | Purpose |
|---------|------|---------|
| **backend-geo** | `:8000` | Serves Folium HTML maps, ocean data summaries, PFZ hotspot GeoJSON, safety alerts, and EEZ geofence data from Copernicus satellite NetCDF files. |
| **backend-orca** | `:8001` | LangGraph multi-agent advisory engine: supervisor → (weather, maritime-safety, PFZ, synthesis) agents. Returns structured advisories with verdict, evidence, forecast, TTS audio, and diagnostic data. |
| **frontend** | `:3000` | Next.js dashboard proxying both backends via `/api/geo/*` and `/api/orca/*`. Features: interactive maps, AI chat, PFZ table, OceanStatsBar, voice I/O. |

---

## Quick Start

### Prerequisites
- **Python 3.12+** with `pip`
- **Node.js 18+** with `npm`
- (Optional) **Groq API key** in `backend-orca/.env` for LLM-powered synthesis

### 1. Geospatial Backend (Terminal 1)

```powershell
cd D:\SIH\orca\backend-geo
python -m venv .venv
& .\.venv\Scripts\pip.exe install -r requirements.txt
& .\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 2. ORCA Advisory Backend (Terminal 2)

```powershell
cd D:\SIH\orca\backend-orca
python -m venv .venv
& .\.venv\Scripts\pip.exe install -r requirements.txt
# Optional: copy .env.example to .env and add GROQ_API_KEY
& .\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001
```

### 3. Frontend Dashboard (Terminal 3)

```powershell
cd D:\SIH\orca\frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Key Features

- 🛡️ **Safety Verdicts**: Green / Amber / Red go/no-go advisories based on real-time conditions
- 🗣️ **Multilingual Voice I/O**: Queries in Hindi, Tamil, Telugu, Kannada, Malayalam, and more
- 🌡️ **Live Satellite Data**: SST, chlorophyll-a, wave height from Copernicus Marine Service
- 🐟 **PFZ Advisories**: Potential Fishing Zone hotspots with proximity-filtered local metrics
- 📊 **12-Hour Forecasts**: Wave height and wind speed forecast charts
- 🗺️ **Dual Map System**: Folium satellite overlays + React-Leaflet advisory fly-to maps
- 💬 **Multi-Turn AI Chat**: Context-preserving conversation with thread continuity

---

## Environment Variables

### backend-orca/.env
```
GROQ_API_KEY=your_groq_api_key_here
```

If no Groq API key is set, the system falls back to deterministic template-based responses (fully functional, just not LLM-synthesized prose).

---

## License

Built for Smart India Hackathon (SIH) — Indian Ocean fisheries safety advisory.
