"""
main.py — ORCA FastAPI application entry-point.

Responsibilities:
  - Expose the REST surface that the Streamlit frontend talks to.
  - Act as a synchronous bridge between the HTTP request/response cycle
    and the stateful LangGraph orchestrator (run_orca).
  - Wrap the pipeline with a Localization Layer so users can submit queries
    in Indian coastal languages (Tamil, Telugu, Malayalam, Kannada, etc.)
    and receive advisories in their own language — without exposing any of
    the LangGraph agents to multilingual complexity.
  - Keep this layer thin: no safety logic lives here.  Validation is
    handled by Pydantic; orchestration is handled by graph.py;
    translation is handled by services/localization.py.
"""

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# run_orca is the single public entry-point of the LangGraph graph.
from backend.app.graph import run_orca

# Services: Audio Synthesis, Speech-to-Text, and Localization
from backend.app.services.audio_service import generate_speech_base64
from backend.app.services.stt_service import transcribe_audio
from backend.app.services.localization import (
    detect_and_translate_to_english,
    translate_to_regional,
)
from backend.app.services.pfz_fetcher import refresh_pfz_cache, start_pfz_scheduler

# ---------------------------------------------------------------------------
# LOGGING
# ---------------------------------------------------------------------------
# Module-level logger so all messages from this file are tagged "orca.api".
# FastAPI/uvicorn's default log config will pick this up automatically.
logger = logging.getLogger("orca.api")


# ---------------------------------------------------------------------------
# APP LIFESPAN & INITIALISATION
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler:
    - Starts the 24-hour distributed edge PFZ sync scheduler.
    - Performs initial INCOIS cache validation.
    """
    logger.info("Initializing ORCA background edge services...")
    start_pfz_scheduler(interval_hours=24)
    refresh_pfz_cache()
    yield
    logger.info("ORCA background services shut down cleanly.")


app = FastAPI(
    title="ORCA — Ocean Risk & Coastal Advisory API",
    description=(
        "Multi-agent marine safety system for Indian coastal fishermen. "
        "Integrates weather forecasts (Open-Meteo), EEZ geofencing (Marine Regions), "
        "and INCOIS PFZ advisories into a single structured advisory payload."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# REQUEST / RESPONSE SCHEMAS
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    """
    Incoming query payload from the Streamlit frontend.
    """
    query: str = Field(
        ...,
        description="User's question in natural language (any Indian language or English).",
        examples=["நான் இன்று எங்கே மீன் பிடிக்க வேண்டும்?"],
    )
    lat: float = Field(
        ...,
        description="Vessel latitude in decimal degrees.",
        examples=[12.87],
    )
    lon: float = Field(
        ...,
        description="Vessel longitude in decimal degrees.",
        examples=[74.84],
    )
    thread_id: str = Field(
        default="default_session",
        description="Session identifier for multi-turn memory.",
    )


class QueryResponse(BaseModel):
    """
    Structured advisory payload returned to the frontend after the full
    LangGraph pipeline completes.
    """
    final_response: str = Field(
        description="Full human-readable advisory in the user's detected language."
    )
    verdict_color: str = Field(
        description='Traffic-light color for the UI badge: "green", "amber", or "red".'
    )
    evidence: List[dict] = Field(
        description='Structured evidence cards.'
    )
    errors: List[str] = Field(
        description="Non-fatal errors accumulated across all agent nodes."
    )
    detected_language: str = Field(
        description="ISO 639-1 language code detected from the user's query."
    )
    map_geojson: Optional[dict] = Field(
        default=None,
        description="GeoJSON FeatureCollection for the frontend map layer.",
    )
    forecast_series: Optional[List[dict]] = Field(
        default=None,
        description="12-hour sea-state wave and wind forecast projection series.",
    )
    diagnostic_data: Optional[dict] = Field(
        default=None,
        description="Historical ecological trend diagnostics for decline queries.",
    )
    audio_base64: Optional[str] = Field(
        default=None,
        description="Base64-encoded MP3 audio data URI for spoken vernacular advisory.",
    )


# ---------------------------------------------------------------------------
# STATIC FILES & HEALTH CHECK
# ---------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")

app.mount("/static", StaticFiles(directory=DATA_DIR), name="static")


@app.get("/", tags=["health"])
def health_check():
    return {"status": "online", "message": "ORCA API is up and running!"}


# ---------------------------------------------------------------------------
# SPEECH-TO-TEXT ENDPOINT
# ---------------------------------------------------------------------------

@app.post("/transcribe", tags=["speech"])
async def transcribe_endpoint(
    file: UploadFile = File(...),
    lang_code: str = Form("en-IN"),
):
    """
    Transcribes uploaded WAV audio voice recording into natural language text.
    """
    try:
        audio_bytes = await file.read()
        transcription = transcribe_audio(audio_bytes, lang_code=lang_code)
        if transcription:
            return {"transcription": transcription, "lang_code": lang_code}
        return {
            "transcription": None,
            "error": "Speech could not be recognized or audio was silent.",
        }
    except Exception as e:
        logger.exception("Error in /transcribe endpoint: %s", e)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


# ---------------------------------------------------------------------------
# MAIN ADVISORY ENDPOINT
# ---------------------------------------------------------------------------

@app.post("/query", response_model=QueryResponse, tags=["advisory"])
def query_endpoint(request: QueryRequest) -> QueryResponse:
    logger.info(
        "Received query | lat=%.4f lon=%.4f | query=%r",
        request.lat, request.lon, request.query,
    )

    english_query, detected_lang, detect_err = detect_and_translate_to_english(request.query)

    try:
        final_state: dict = run_orca(
            query=english_query,
            lat=request.lat,
            lon=request.lon,
            thread_id=request.thread_id,
        )
    except Exception as exc:
        logger.exception("run_orca raised an unhandled exception: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="ORCA pipeline encountered an internal error.",
        )

    english_response: str = final_state.get(
        "final_response",
        "ORCA could not generate a response. Please check official INCOIS bulletins.",
    )

    localized_response, reg_err = translate_to_regional(english_response, detected_lang)

    # Synthesize vernacular audio stream
    audio_b64, tts_err = generate_speech_base64(localized_response, detected_lang)

    # Accumulate all non-fatal service errors (pipeline errors + localization + TTS errors)
    accumulated_errors: List[str] = list(final_state.get("errors") or [])
    if detect_err:
        accumulated_errors.append(detect_err)
    if reg_err:
        accumulated_errors.append(reg_err)
    if tts_err:
        accumulated_errors.append(tts_err)

    response_payload = QueryResponse(
        final_response=localized_response,
        verdict_color=final_state.get("verdict_color", "amber"),
        evidence=final_state.get("evidence") or [],
        errors=accumulated_errors,
        detected_language=detected_lang,
        map_geojson=final_state.get("map_geojson"),
        forecast_series=final_state.get("forecast_series"),
        diagnostic_data=final_state.get("diagnostic_data"),
        audio_base64=audio_b64,
    )

    return response_payload


# ---------------------------------------------------------------------------
# PFZ EDGE REFRESH ENDPOINT
# ---------------------------------------------------------------------------

@app.post("/pfz/refresh", tags=["pfz"])
def refresh_pfz_endpoint():
    """
    Triggers an immediate synchronization of the INCOIS PFZ cache (harbor-level edge sync).
    """
    res = refresh_pfz_cache()
    return res


# ---------------------------------------------------------------------------
# NATIONAL BROADCAST / VHF / NAVTEX SERIALIZATION ENDPOINT
# ---------------------------------------------------------------------------

class NavtexResponse(BaseModel):
    """
    ITU-R M.540 / IMO standard NAVTEX marine safety message payload.
    """
    navtex_message: str = Field(
        ...,
        description="Formatted uppercase teleprinter message strictly ≤ 400 characters.",
    )
    char_count: int = Field(
        ...,
        description="Byte/character count of the serialized broadcast message.",
    )
    station_id: str = Field(
        default="QA01",
        description="NAVTEX coastal radio transmitter station identifier.",
    )
    timestamp_utc: str = Field(
        ...,
        description="UTC transmission timestamp in NAVTEX notation.",
    )
    risk_verdict: str = Field(
        ...,
        description="Deterministic safety verdict (SAFE / CAUTION / UNSAFE / INSUFFICIENT_DATA).",
    )


def format_navtex_message(
    lat: float,
    lon: float,
    verdict: str,
    reasons: List[str],
    weather: Optional[dict] = None,
    geofence: Optional[dict] = None,
) -> str:
    """
    Formats the marine safety advisory into international maritime NAVTEX standard text.
    Maximum length is capped at 400 characters (standard 518 kHz teleprinter slot limit).
    """
    now_utc = datetime.now(timezone.utc).strftime("%d%H%M UTC %b").upper()
    verdict_str = (verdict or "UNKNOWN").upper()

    lat_dir = "N" if lat >= 0 else "S"
    lon_dir = "E" if lon >= 0 else "W"
    loc_str = f"{abs(lat):.2f}{lat_dir} {abs(lon):.2f}{lon_dir}"

    wave_val = weather.get("wave_height_m") if weather else None
    wind_val = weather.get("wind_speed_kmh") if weather else None
    cond_parts = []
    if wave_val is not None:
        cond_parts.append(f"WAVE {wave_val:.1f}M")
    if wind_val is not None:
        cond_parts.append(f"WIND {wind_val:.1f}KM/H")
    cond_str = ", ".join(cond_parts) if cond_parts else "METEO DATA PENDING"

    border_str = ""
    if geofence:
        dist = geofence.get("distance_to_indian_border_km")
        in_ind = geofence.get("in_indian_waters", True)
        if not in_ind:
            border_str = f"OUTSIDE EEZ ({geofence.get('current_jurisdiction','NON-IND')[:8].upper()})"
        elif dist is not None:
            border_str = f"EEZ DIST: {dist:.1f}KM"

    if verdict_str == "SAFE":
        action = "NORMAL SAILING PERMITTED. MONITOR VHF CH16."
    elif verdict_str == "CAUTION":
        action = "HIGH CAUTION ADVISED. NEARSHORE VOYAGE ONLY."
    elif verdict_str == "UNSAFE":
        action = "DO NOT SAIL. DANGEROUS CONDITIONS/RESTRICTED."
    else:
        action = "INSUFFICIENT TELEMETRY. CHECK INCOIS BULLETIN."

    body_lines = [
        "ZCZC QA01",
        f"{now_utc}",
        "ORCA NAVTEX MARINE SAFETY ADVISORY",
        f"POS: {loc_str}",
        f"VERDICT: {verdict_str}",
        f"COND: {cond_str}",
    ]
    if border_str:
        body_lines.append(f"BORDER: {border_str}")
    body_lines.append(f"ACTION: {action}")
    body_lines.append("NNNN")

    raw_msg = "\n".join(body_lines)
    return raw_msg[:400]


@app.post("/advisory/navtex", response_model=NavtexResponse, tags=["broadcast"])
@app.post("/broadcast", response_model=NavtexResponse, tags=["broadcast"])
def navtex_endpoint(request: QueryRequest) -> NavtexResponse:
    """
    Serializes live marine risk advisory into ITU-R M.540 standard NAVTEX format
    for direct coastal radio and VHF text broadcasts.
    """
    try:
        final_state: dict = run_orca(
            query=request.query,
            lat=request.lat,
            lon=request.lon,
            thread_id=request.thread_id,
        )
    except Exception as exc:
        logger.exception("run_orca failed in navtex_endpoint: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate NAVTEX broadcast advisory.",
        )

    verdict = final_state.get("risk_verdict", "unknown")
    reasons = final_state.get("risk_reasons") or []
    weather = final_state.get("weather_data")
    geofence = final_state.get("geofence_result")

    navtex_msg = format_navtex_message(
        lat=request.lat,
        lon=request.lon,
        verdict=verdict,
        reasons=reasons,
        weather=weather,
        geofence=geofence,
    )

    now_utc_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    return NavtexResponse(
        navtex_message=navtex_msg,
        char_count=len(navtex_msg),
        station_id="QA01",
        timestamp_utc=now_utc_str,
        risk_verdict=verdict.upper(),
    )