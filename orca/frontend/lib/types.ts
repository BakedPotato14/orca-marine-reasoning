/**
 * lib/types.ts — ORCA TypeScript schema types
 *
 * Derived directly from:
 *   - Python Pydantic models in orca-sih/backend/app/main.py (QueryRequest, QueryResponse)
 *   - Geospatial API response shapes in mapsandshit/Projects/geospatial/routers/data.py
 *
 * Keep in sync with any backend schema changes.
 */

// ---------------------------------------------------------------------------
// ORCA AI Advisory Backend types  (POST /api/orca/query, POST /api/orca/transcribe)
// ---------------------------------------------------------------------------

/** Sent to POST /api/orca/query */
export interface QueryRequest {
  query: string;
  lat: number;
  lon: number;
  /** Session ID for multi-turn MemorySaver continuity. Stored in localStorage. */
  thread_id: string;
}

/** One evidence card returned by the advisory pipeline */
export interface EvidenceCard {
  source: string;   // e.g. "Open-Meteo Weather API"
  detail: string;   // prose explanation
  as_of: string;    // human-readable timestamp string
}

/** One point in the 12-hour sea-state forecast series */
export interface ForecastPoint {
  time: string;           // e.g. "T+0h", "T+1h" ...
  wave_height_m: number;
  wind_speed_kmh: number;
}

/**
 * Ecological trend diagnostic data.
 * IMPORTANT: ALWAYS render this with the disclaimer:
 * "⚠️ Illustrative example data — not derived from live historical records."
 */
export interface DiagnosticData {
  trend: string;                // e.g. "declining"
  sst_anomaly_c: number;        // SST anomaly in °C
  chlorophyll_drop_pct: number; // Chl drop percentage
  causal_factors: string[];     // explanation strings
  sector?: string;              // coastal sector label
  period?: string;              // always "Illustrative demo values" — never a real source
}

/** Full response from POST /api/orca/query */
export interface QueryResponse {
  final_response: string;
  /** Safety verdict color */
  verdict_color: "green" | "amber" | "red";
  evidence: EvidenceCard[];
  errors: string[];
  /** ISO 639-1 code, e.g. "ta", "en", "ml" */
  detected_language: string;
  /** GeoJSON for the advisory map — vessel + destination + route line */
  map_geojson: GeoJSONFeatureCollection | null;
  forecast_series: ForecastPoint[] | null;
  /**
   * Ecological diagnostic — ALWAYS show disclaimer when rendering.
   * Backend guarantee: period field always reads "Illustrative demo values"
   */
  diagnostic_data: DiagnosticData | null;
  /**
   * Base64 MP3 audio string. Backend returns it with data URI prefix: "data:audio/mp3;base64,...".
   * Handled safely by audioDataUri() in lib/utils.ts.
   */
  audio_base64: string | null;
}

/** Response from POST /api/orca/transcribe */
export interface TranscribeResponse {
  transcription: string | null;
  lang_code?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Geospatial Backend types  (GET /api/geo/data/*)
// ---------------------------------------------------------------------------

export interface OceanSummary {
  status: string;
  timestamp: string;
  region: string;
  bounding_box: {
    min_lon: number; max_lon: number;
    min_lat: number; max_lat: number;
  };
  sst: {
    min_celsius: number;
    max_celsius: number;
    mean_celsius: number;
    depth: string;
  };
  waves: {
    min_height_m: number;
    max_height_m: number;
    mean_height_m: number;
    depth: string;
  };
  chlorophyll: {
    min_mg_m3: number;
    max_mg_m3: number;
    mean_mg_m3: number;
    depth: string;
  };
  pfz: {
    total_detected_hotspots: number;
    high_probability_count: number;
    moderate_probability_count: number;
    top_hotspot: { id: string; pfz_score: number } | null;
  };
  marine_safety: {
    /** "NORMAL" | "CAUTION" | "ROUGH ALERT" | "DANGER" */
    overall_status: string;
    status_color: string; // hex
    active_sectors_evaluated: number;
    sectors_under_alert: number;
    imbl_geofence_alerts: number;
  };
}

export interface PFZHotspot {
  id: string;
  latitude: number;
  longitude: number;
  pfz_score: number;
  /** "High Probability" | "Moderate Probability" | "Promising Edge" */
  category: string;
  color: string;   // hex
  sst_celsius: number;
  chl_mg_m3: number;
  front_gradient: number;
  target_species: string;
  nearest_port: string;
  state: string;       // Indian coastal state
  distance_km: number;
  bearing: string;     // compass bearing, e.g. "SSE"
  timestamp: string;
}

export interface PFZListResponse {
  count: number;
  total_available: number;
  hotspots: PFZHotspot[];
}

// ---------------------------------------------------------------------------
// GeoJSON types  (minimal — for react-leaflet rendering of map_geojson)
// ---------------------------------------------------------------------------

export interface GeoJSONGeometry {
  type: "Point" | "LineString" | "Polygon" | "MultiPolygon";
  coordinates: number[] | number[][] | number[][][] | number[][][][];
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: GeoJSONGeometry;
  properties: Record<string, unknown>;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// UI-only types
// ---------------------------------------------------------------------------

/** One entry in the local conversation display list */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** Full backend response, attached to assistant messages */
  response?: QueryResponse;
}

/** Three Folium map tabs in MapPanel */
export type MapTab = "ocean" | "pfz" | "safety";
