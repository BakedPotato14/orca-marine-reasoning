from typing import TypedDict, Optional, Annotated
import operator


class ORCAState(TypedDict):
    """
    Shared state object passed through every node in the ORCA agent graph.
    Each node reads whatever fields it needs and writes only the field(s)
    it "owns"  this is what lets parallel nodes (weather/geofence/pfz)
    run simultaneously without cloding writes.
    """

    # Raw input — always set fresh per request (no reducer = new input always beats checkpoint)
    query: str
    input_lat: Optional[float]   # Lat from current API request — supervisor reads this first
    input_lon: Optional[float]   # Lon from current API request — supervisor reads this first

    # Supervisor writes these
    intent: Optional[str]
    location: Optional[dict]

    #one parallel agent each writes ts
    weather_data: Optional[dict]     # written by weather agent read by risk and synthesis agent
    geofence_result: Optional[dict]  #by geofence agent
    pfz_data: Optional[dict]         #by pfz ahgen
    # written by risk agent only
    risk_verdict: Optional[str]        
    risk_reasons: Optional[list[str]]  #explanabikity ke liye read by synthesis

#written by synthesis bas
    final_response: Optional[str]

    # Traffic-light color derived from risk_verdict — "green" / "amber" / "red".
    # Kept as its own field so the UI can render a colored badge without having to
    # parse the prose of final_response.  Written by synthesis_agent only.
    verdict_color: Optional[str]

    # Structured evidence cards: list of dicts shaped as
    # {"source": str, "detail": str, "as_of": str}
    # Each item corresponds to one data source that contributed to the verdict
    # (weather, geofence, PFZ).  The frontend renders these as distinct cards so
    # a judge can trace every claim back to its origin.  Written by synthesis_agent,
    # derived purely from state fields already present — NOT a new data fetch.
    evidence: Optional[list[dict]]

    # GeoJSON FeatureCollection for the frontend map layer.
    # Written by routing_agent: vessel point + PFZ destination point + navigation LineString.
    # None when routing_agent fails or location is missing.
    map_geojson: Optional[dict]

    # Time-series 12-hour sea-state swell/wind projection series.
    # Written by weather_agent: [{"time": "T+0h", "wave_height_m": 1.4, "wind_speed_kmh": 22.0}, ...]
    forecast_series: Optional[list[dict]]

    # Trend diagnostics for historical/ecological queries.
    # Written by pfz_agent when query asks about fish catch decline or historical trends.
    # {"trend": "declining", "sst_anomaly_c": 1.2, "chlorophyll_drop_pct": 24, "causal_factors": [...]}
    diagnostic_data: Optional[dict]

    #needs reducer cuz multple node diddles ts
    errors: Annotated[list[str], operator.add]

    # Multi-turn conversation memory: lightweight summaries of prior turns.
    # Each entry: {"query": str, "risk_verdict": str|None, "location": dict|None}
    # Uses operator.add reducer so synthesis_agent can append [current_turn]
    # and MemorySaver accumulates across invocations with the same thread_id.
    conversation_history: Annotated[list[dict], operator.add]
   