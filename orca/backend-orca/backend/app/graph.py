"""
graph.py — ORCA LangGraph StateGraph definition.

DAG topology (updated with routing_node and MemorySaver)
---------------------------------------------------------

                         ┌──────────────────┐
                         │      START       │
                         └────────┬─────────┘
                                  │
               ┌──────────────────┼──────────────────┐
               │                  │                  │
               ▼                  ▼                  ▼
        weather_node        geofence_node        pfz_node
     (fetch_weather_node) (geofence_check_node) (pfz_lookup_node)
               │    │            │  │                 │ │
               │    └─────┬──────┘  │                 │ │
               │          ▼         │                 │ │
               │      risk_node ◄───┘                 │ │
               │   (assess_risk_node)                 │ │
               │          │                           │ │
               └──────────┤◄──────────────────────────┘ │
                          │◄────────────────────────────┘
                          ▼
                    routing_node
                   (routing_node)
                          │
               ┌──────────┘
               │
               ▼
         synthesis_node
    (synthesize_response_node)
               │
               ▼
              END

Parallelism notes
-----------------
START fans out to three independent nodes simultaneously:
  weather_node, geofence_node, pfz_node

Two joins:
  JOIN 1 — weather + geofence → risk_node
  JOIN 2 — risk_node + pfz_node + weather_node + geofence_node → routing_node
            (routing_node needs all four data sources for its avoidance logic)

routing_node and risk_node are independent of each other — they can run
concurrently if the LangGraph runtime schedules them that way once their
respective join conditions are met.

synthesis_node joins risk_node + routing_node — it produces the final
advisory text and evidence cards only after both are complete.

Memory / Checkpointer
---------------------
orca_graph is compiled with MemorySaver.  This enables multi-turn
conversational memory: subsequent calls with the same thread_id will see
the accumulated state from previous turns.  The thread_id is passed via
`config={"configurable": {"thread_id": <id>}}` in run_orca().
"""

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from backend.app.state import ORCAState

# Node functions — thin wrappers that read state, do one job, return a
# partial-state dict.  The graph owns the wiring; the nodes own the logic.
from backend.app.agents.supervisor      import classify_and_extract_node
from backend.app.agents.weather_agent   import fetch_weather_node
from backend.app.agents.geofence_agent  import geofence_check_node
from backend.app.agents.pfz_agent       import pfz_lookup_node
from backend.app.agents.risk_agent      import assess_risk_node
from backend.app.agents.routing_agent   import routing_node
from backend.app.agents.synthesis_agent import synthesize_response_node


# ---------------------------------------------------------------------------
# BUILD THE GRAPH
# ---------------------------------------------------------------------------

builder = StateGraph(ORCAState)

# Register every node.  The string name is the stable identifier used when
# adding edges below; the callable is what LangGraph actually invokes.
builder.add_node("supervisor_node", classify_and_extract_node)
builder.add_node("weather_node",    fetch_weather_node)
builder.add_node("geofence_node",   geofence_check_node)
builder.add_node("pfz_node",        pfz_lookup_node)
builder.add_node("risk_node",       assess_risk_node)
builder.add_node("routing_node",    routing_node)
builder.add_node("synthesis_node",  synthesize_response_node)

# ------------------------------------------------------------------
# ENTRY POINT: START -> supervisor_node
# Supervisor classifies intent & resolves location (with multi-turn memory)
# ------------------------------------------------------------------
builder.add_edge(START, "supervisor_node")

# ------------------------------------------------------------------
# INTENT-BASED CONDITIONAL ROUTING
# supervisor_node classifies intent into state["intent"].
# route_by_intent reads this intent and dispatches ONLY the necessary node(s):
#   - "safety_check"  -> parallel fan-out to weather_node, geofence_node, pfz_node
#   - "pfz_only"      -> pfz_node only (skips weather & geofence APIs)
#   - "geofence_only" -> geofence_node only (skips weather & pfz APIs)
#   - "general_info"  -> synthesis_node directly (skips location agents)
# ------------------------------------------------------------------

def route_by_intent(state: ORCAState):
    intent = state.get("intent", "safety_check")
    if intent == "pfz_only":
        return ["pfz_node"]
    elif intent == "geofence_only":
        return ["geofence_node"]
    elif intent == "general_info":
        return "synthesis_node"
    else:
        return ["weather_node", "geofence_node", "pfz_node"]


builder.add_conditional_edges(
    "supervisor_node",
    route_by_intent,
    {
        "weather_node":   "weather_node",
        "geofence_node":  "geofence_node",
        "pfz_node":       "pfz_node",
        "synthesis_node": "synthesis_node",
    },
)

# ------------------------------------------------------------------
# FAN-IN: weather + geofence + pfz → risk_node → routing_node → synthesis_node
# ------------------------------------------------------------------
builder.add_edge("weather_node",  "risk_node")
builder.add_edge("geofence_node", "risk_node")
builder.add_edge("pfz_node",      "risk_node")

builder.add_edge("risk_node",      "routing_node")
builder.add_edge("routing_node",   "synthesis_node")
builder.add_edge("synthesis_node", END)


# ---------------------------------------------------------------------------
# COMPILE WITH MEMORY CHECKPOINTER
#
# MemorySaver stores the full state snapshot after every node execution,
# keyed by thread_id.  Subsequent invocations with the same thread_id will
# resume from the last checkpoint — enabling multi-turn advisory sessions
# where the fisherman can follow up ("what about next week?" etc.).
#
# For a stateless one-shot invocation, pass thread_id="default_session".
# ---------------------------------------------------------------------------
memory = MemorySaver()
orca_graph = builder.compile(checkpointer=memory)


# ---------------------------------------------------------------------------
# PUBLIC HELPER
# ---------------------------------------------------------------------------

def run_orca(
    query: str,
    lat: float,
    lon: float,
    thread_id: str = "default_session",
) -> dict:
    """
    Convenience entry-point for the FastAPI layer (or tests) to invoke the
    full ORCA pipeline without having to construct the initial state manually.

    Args:
        query:     The raw natural-language query from the user/fisherman.
        lat:       Latitude of the location of interest (decimal degrees).
        lon:       Longitude of the location of interest (decimal degrees).
        thread_id: Session identifier for MemorySaver checkpointing.
                   Requests with the same thread_id share accumulated state
                   across turns.  Defaults to "default_session" for
                   stateless one-shot usage.

    Returns:
        The final ORCAState dict after all nodes have run, containing:
            final_response  — human-readable advisory string
            verdict_color   — "green" / "amber" / "red" for the UI badge
            evidence        — list of {source, detail, as_of} cards
            map_geojson     — GeoJSON FeatureCollection for the frontend map
            risk_verdict    — "safe" / "caution" / "unsafe" / "insufficient_data"
            risk_reasons    — list of explanation strings
            weather_data    — raw weather dict (or None on fetch failure)
            geofence_result — jurisdiction + border-distance dict (or None)
            pfz_data        — nearby fishing zones + cache_age_note (or None)
            errors          — accumulated list of any non-fatal errors from all nodes
    """
    # Build the initial state.  Only the fields this function *knows* at call
    # time are set; every other field starts absent and will be written by the
    # appropriate node.
    #
    # errors MUST be initialised to [] — the operator.add reducer concatenates
    # rather than overwrites, so the key must exist with a list value.
    initial_state: dict = {
        "query":    query,
        "location": {"lat": lat, "lon": lon},
        "errors":   [],
    }

    # config carries the thread_id to the MemorySaver checkpointer.
    # Without this, the checkpointer cannot associate the run with a session.
    config: dict = {"configurable": {"thread_id": thread_id}}

    # invoke() runs the graph synchronously and returns the final merged state.
    # For async usage in FastAPI, replace with: await orca_graph.ainvoke(...)
    final_state: dict = orca_graph.invoke(initial_state, config=config)

    return final_state
