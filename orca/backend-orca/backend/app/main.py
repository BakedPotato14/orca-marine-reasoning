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

# ---------------------------------------------------------------------------
# LOGGING
# ---------------------------------------------------------------------------
# Module-level logger so all messages from this file are tagged "orca.api".
# FastAPI/uvicorn's default log config will pick this up automatically.
logger = logging.getLogger("orca.api")


# ---------------------------------------------------------------------------
# APP INITIALISATION
# ---------------------------------------------------------------------------

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