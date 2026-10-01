# ORCA Unified Next.js Frontend — Build Handoff (PROGRESS.md)

> **Audience**: A fresh AI session picking this up cold. Read this entire file before touching anything.

---

## Project Identity

**ORCA** — Ocean Risk & Coastal Advisory platform. Marine safety AI for Indian coastal fishermen.  
This is a **Smart India Hackathon** project.

**What we're building**: A unified Next.js 14 frontend that replaces the old Streamlit UI and integrates with two separate Python FastAPI backends.

---

## Source Codebases (DO NOT MODIFY EITHER PYTHON BACKEND)

### 1. Geospatial Map Backend
- **Path**: `D:\SIH\mapsandshit\Projects\geospatial\`
- **Purpose**: Serves Folium HTML maps (SST, Chl, wave, PFZ, safety layers) and oceanographic JSON data
- **Port**: `http://localhost:8000`
- **Key endpoints**:
  - `GET /maps/ocean` → full multi-layer Folium HTML map
  - `GET /maps/pfz` → PFZ advisory Folium HTML map
  - `GET /maps/safety` → safety/wave Folium HTML map
  - `GET /data/summary` → JSON: SST, wave, chl, PFZ count, safety status
  - `GET /data/pfz` → filtered PFZ hotspot list (JSON, query params: category, state, min_score, limit)
  - `GET /data/pfz-geojson` → RFC 7946 GeoJSON FeatureCollection of PFZ hotspots
  - `GET /data/safety-alerts` → wave sector alert JSON
  - `GET /data/imbl-geofence` → EEZ geofence alerts JSON
  - `POST /data/refresh` → triggers Copernicus data re-download (no body needed)
  - `GET /health` → health probe

### 2. ORCA AI Advisory Backend
- **Path**: `D:\SIH\orca-sih\backend\`
- **Port**: `http://localhost:8001`
- **Entry**: `uvicorn backend.app.main:app --port 8001` (run from `D:\SIH\orca-sih\`)
- **Key endpoints**:
  - `POST /query` → main advisory (body: `{query, lat, lon, thread_id}`)
  - `POST /transcribe` → multipart form: `file` (WAV), `lang_code` (default `"en-IN"`)
  - `GET /` → health check
- **QueryResponse fields** (all used in UI):
  - `final_response: str` — advisory text (localized)
  - `verdict_color: "green" | "amber" | "red"` — safety badge color
  - `evidence: [{source, detail, as_of}]` — evidence cards
  - `map_geojson: GeoJSON | null` — vessel + route + PFZ GeoJSON for advisory map
  - `forecast_series: [{time, wave_height_m, wind_speed_kmh}] | null` — 12-hour forecast
  - `diagnostic_data: {trend, sst_anomaly_c, chlorophyll_drop_pct, causal_factors, ...} | null` — illustrative ecological data (ALWAYS show disclaimer)
  - `audio_base64: string | null` — base64 MP3 (prepend `data:audio/mpeg;base64,` before using as audio src)
  - `detected_language: str` — ISO 639-1 code (display-only badge, no picker)
  - `errors: string[]` — non-fatal errors

---

## New Frontend Location
`D:\SIH\orca-sih\frontend-next\`  
Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui

**Dev server**: `npm run dev` → `http://localhost:3000`

---

## Architecture Decisions (LOCKED — do not deviate)

### Two Independent Maps
The UI has **two separate map components** — they do different jobs and share NO state:

1. **MapPanel** (`components/MapPanel.tsx`): An `<iframe>` embedding the Folium maps from the geospatial backend. Three tabs: Ocean Overview / PFZ Advisory / Safety Alerts. Shows the teammate's satellite data layers. **NEVER attempt cross-iframe scripting into the Folium map** — Folium generates randomized internal variable names per render, so it is not possible to script into the iframe's internal Leaflet state reliably.

2. **AdvisoryMap** (`components/AdvisoryMap.tsx`): A standalone `react-leaflet` `MapContainer` that lives near the ChatPanel/AdvisoryCard. It renders the `map_geojson` returned by the ORCA `/query` response (vessel point + destination + route line). It flies to the queried location on every new response. Completely independent of the iframe.

### API Proxy (Next.js Route Handlers)
Next.js route handlers at `app/api/**` proxy to both backends. The browser always talks to `:3000` — no CORS issues.
- `/api/geo/[...path]` → `http://localhost:8000/{path}`
- `/api/orca/[...path]` → `http://localhost:8001/{path}`

### Voice/STT
The UI includes a microphone button. On click: record audio (MediaRecorder API), send WAV blob to `/api/orca/transcribe`, receive transcription text, populate the query input field. Audio playback of the TTS response uses HTML5 `<audio>` with the `audio_base64` data URI.

### Language Detection
Display-only. Show `detected_language` as a small badge (e.g., `🌐 Tamil`). No manual override — the backend auto-detects.

### Multi-turn Memory
Each browser session generates a UUID `thread_id` stored in `localStorage`. Every `/query` call includes this `thread_id`. The ORCA backend's MemorySaver checkpointer accumulates conversation history server-side. The frontend stores the message list locally in React state for display.

### Data Refresh Button
A "Refresh Data" button calls `POST /api/geo/data/refresh`. Shows a spinner while in progress, then re-fetches the summary stats.

---

## Visual Design Tokens

```
Background primary:   #0a0c10
Background secondary: #121620
Card background:      rgba(22, 27, 39, 0.85)  + backdrop-filter: blur(14px)
Border:               rgba(255, 255, 255, 0.08)
Border hover:         rgba(0, 230, 118, 0.4)
Accent cyan:          #00e5ff
Accent emerald:       #00e676  (safe/green)
Accent amber:         #ffd600  (caution/amber)
Accent red:           #ff1744  (danger/red)
Accent blue:          #2979ff
Text primary:         #f0f3f8
Text secondary:       #90a4ae
Font UI:              Outfit (Google Fonts, weights 300/400/500/600/700/800)
Font monospace:       JetBrains Mono (Google Fonts, weights 400/500/700)
```

---

## File Structure (target)

```
frontend-next/
├── PROGRESS.md                     # This file
├── app/
│   ├── layout.tsx                  # Root layout: nav, providers, fonts
│   ├── page.tsx                    # / → redirect to /dashboard
│   ├── globals.css                 # Tailwind base + CSS custom properties
│   ├── dashboard/
│   │   └── page.tsx                # Main split-pane: MapPanel left, Chat+Advisory right
│   ├── map/
│   │   └── page.tsx                # Full-screen map explorer (all three Folium tabs)
│   ├── pfz/
│   │   └── page.tsx                # PFZ table + mini-map
│   └── api/
│       ├── geo/[...path]/route.ts  # Wildcard proxy → localhost:8000
│       └── orca/[...path]/route.ts # Wildcard proxy → localhost:8001
├── components/
│   ├── ui/                         # shadcn/ui primitives (auto-generated)
│   ├── MapPanel.tsx                # Folium iframe + tab switcher + refresh button
│   ├── AdvisoryMap.tsx             # Standalone react-leaflet for ORCA route GeoJSON
│   ├── ChatPanel.tsx               # Query input + mic button + conversation history
│   ├── AdvisoryCard.tsx            # Verdict badge + text + audio player + evidence
│   ├── EvidenceCards.tsx           # Evidence card grid
│   ├── ForecastChart.tsx           # 12-hour wave/wind recharts ComposedChart
│   ├── DiagnosticCard.tsx          # Ecological illustrative data (with disclaimer)
│   ├── OceanStatsBar.tsx           # Live SST / wave / chl / PFZ count header strip
│   ├── PFZTable.tsx                # Sortable, filterable PFZ hotspot table
│   ├── VerdictBadge.tsx            # Green/amber/red animated badge
│   ├── LocationPicker.tsx          # Lat/lon input + "use my location" geolocation
│   └── ErrorToast.tsx              # Non-fatal error display
├── hooks/
│   ├── useORCAQuery.ts             # POST /api/orca/query, manages loading + history
│   ├── useOceanSummary.ts          # GET /api/geo/data/summary (SWR, 30s poll)
│   └── usePFZData.ts               # GET /api/geo/data/pfz-geojson (SWR)
├── lib/
│   ├── types.ts                    # TypeScript types matching backend schemas
│   └── utils.ts                    # Color helpers, language name lookup, formatting
├── public/
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Build Phases

### Phase 1 — Bootstrap & Config ✅ COMPLETE
- [x] `create-next-app` with TypeScript, Tailwind, App Router
- [x] Install runtime deps: `recharts swr lucide-react leaflet react-leaflet @types/leaflet`
- [x] shadcn/ui init + generate Card, Button, Badge, Input, Select, Tabs, Separator, Tooltip, Skeleton
- [x] `next.config.ts` — wildcard proxy rewrites to both backends
- [x] `app/globals.css` — maritime design tokens, CSS custom properties, Outfit + JetBrains Mono
- [x] `lib/types.ts` — full TypeScript schema types
- [x] `lib/utils.ts` — helpers
- [x] `app/layout.tsx` — root layout with nav
- [x] `app/page.tsx` — redirect to /dashboard
- [x] `npm run build` passes

### Phase 2 — API Proxy Layer ✅ COMPLETE
- [x] `app/api/geo/[...path]/route.ts`
- [x] `app/api/orca/[...path]/route.ts`
- [x] `hooks/useOceanSummary.ts`
- [x] `hooks/usePFZData.ts`
- [x] `hooks/useORCAQuery.ts`

### Phase 3 — Core UI Components ✅ COMPLETE
- [x] `components/VerdictBadge.tsx`
- [x] `components/OceanStatsBar.tsx`
- [x] `components/MapPanel.tsx`
- [x] `components/AdvisoryMap.tsx`
- [x] `components/LocationPicker.tsx`
- [x] `components/ChatPanel.tsx`

### Phase 4 — Advisory Output Components ✅ COMPLETE
- [x] `components/EvidenceCards.tsx`
- [x] `components/ForecastChart.tsx`
- [x] `components/DiagnosticCard.tsx`
- [x] `components/AdvisoryCard.tsx`
- [x] `components/ErrorToast.tsx`

### Phase 5 — Pages ✅ COMPLETE
- [x] `app/dashboard/page.tsx`
- [x] `app/map/page.tsx`
- [x] `app/pfz/page.tsx`
- [x] `components/PFZTable.tsx`

### Phase 6 — Polish & Verify ✅ COMPLETE
- [x] `npm run build` clean (all 7 routes prerendered / dynamic)
- [x] `npx tsc --noEmit` clean (0 errors)
- [x] Live runtime verification with backends running (:3000, :8000, :8001)

---

## Current Status
**All phases complete. Full system running and verified end-to-end.**
- **Frontend (Next.js 14)**: `http://localhost:3000` (Listening)
- **Geospatial Backend**: `http://localhost:8000` (Listening)
- **ORCA Reasoning Backend**: `http://localhost:8001` (Listening)

### Resolved Issues
- **Missing Telemetry on Natural Language Queries**: In `backend/app/agents/supervisor.py`, `classify_and_extract_node` previously initialized `location = None` and only checked `COASTAL_TOWNS` matching the query text. If a user asked "Is it safe to sail today?" without naming a city, it discarded the client's GPS/UI coordinates in `state["location"]`, fell back to `general_info`, skipped the weather/risk nodes, and produced "telemetry unavailable". Fixed by prioritizing: (1) town in query text, (2) coordinates passed in `state["location"]`, (3) multi-turn memory fallback.

## Known Pitfalls
- `react-leaflet` requires `'use client'` + `dynamic(() => import(...), { ssr: false })` — Next.js SSR crashes on Leaflet's `window` reference.
- Folium maps are full HTML documents — embed ONLY via `<iframe>`, never `dangerouslySetInnerHTML`.
- `diagnostic_data` MUST always render with the disclaimer: "⚠️ Illustrative example data — not derived from live historical records."
- `audio_base64` from ORCA backend already includes the data URI prefix (`data:audio/mp3;base64,...`). `audioDataUri()` helper in `lib/utils.ts` detects this and passes it through directly without double-prefixing.
- ORCA backend starts with `uvicorn backend.app.main:app` (NOT `app.main:app`) — run from `backend-orca`.
