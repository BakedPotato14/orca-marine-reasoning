import os
import re
from typing import Dict, Any
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parents[3] / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

try:
    from groq import Groq
    _GROQ_AVAILABLE = True
except ImportError:
    _GROQ_AVAILABLE = False

# Define fixed valid intents and supported locations
VALID_INTENTS = {"safety_check", "pfz_only", "geofence_only", "general_info"}

COASTAL_TOWNS = {
    "mangalore": {"lat": 12.87, "lon": 74.84},
    "goa":       {"lat": 15.30, "lon": 73.95},
    "kochi":     {"lat": 9.93,  "lon": 76.26},
    "chennai":   {"lat": 13.08, "lon": 80.27},
    "mumbai":    {"lat": 19.08, "lon": 72.88},
    "vizag":     {"lat": 17.69, "lon": 83.22},
    "puri":      {"lat": 19.80, "lon": 85.83},
}

def call_llm(query: str, context_prefix: str = "") -> str:
    """
    Calls Groq LLM (llama-3.3-70b-versatile) to classify user query into exactly one of the valid intents.
    Falls through to fallback_classifier if GROQ_API_KEY is unset or call fails.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not set.")

    if not _GROQ_AVAILABLE:
        raise NotImplementedError("groq package is not installed.")

    client = Groq(api_key=api_key, timeout=8.0)
    prompt = (
        f"{context_prefix}"
        f"You are the intent classifier for ORCA, an Indian marine safety AI.\n"
        f"Classify the following user query into exactly ONE category from this list:\n"
        f"- safety_check\n"
        f"- pfz_only\n"
        f"- geofence_only\n"
        f"- general_info\n\n"
        f"Rules: Return ONLY the single category name in lowercase (e.g. 'safety_check'). "
        f"Do not explain. Do not include punctuation, brackets, or extra words.\n"
        f"Query: \"{query}\""
    )
    model = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
    completion = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        max_tokens=20,
    )
    raw_label = completion.choices[0].message.content.strip().lower()
    return raw_label

def fallback_classifier(query: str) -> str:
    """Keyword/rule-based classifier to use if the LLM fails."""
    query_lower = query.lower()
    
    if any(word in query_lower for word in ["safe", "danger", "weather", "storm", "cyclone", "wave", "alert"]):
        return "safety_check"
    elif any(word in query_lower for word in ["pfz", "fish", "catch", "zone", "where to fish"]):
        return "pfz_only"
    elif any(word in query_lower for word in ["border", "geofence", "boundary", "cross", "limit", "sri lanka", "pakistan"]):
        return "geofence_only"
    else:
        return "general_info"

def classify_and_extract_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    LangGraph node function to extract location and classify user intent.
    Takes the current ORCAState and returns updates for 'intent' and 'location'.

    Multi-turn context: if conversation_history exists from prior turns (via
    MemorySaver checkpointer), a short summary of the last 1-2 turns is
    prepended to the LLM classification prompt so follow-up queries like
    "what about the day after" are understood in context.  The last-known
    location is also reused when the current query omits one.
    """
    query = state.get("query", "")
    query_lower = query.lower()
    conversation_history = state.get("conversation_history") or []

    # -----------------------------------------------------------------
    # 1. Build multi-turn context string from the last 1-2 turns
    # -----------------------------------------------------------------
    context_prefix = ""
    if conversation_history:
        recent = conversation_history[-2:]  # last 2 turns max
        lines = []
        for turn in recent:
            prev_q = turn.get("query", "?")
            prev_v = turn.get("risk_verdict") or "unknown"
            prev_loc = turn.get("location")
            loc_str = f"lat={prev_loc['lat']}, lon={prev_loc['lon']}" if prev_loc else "unknown"
            lines.append(f"  - Previous query: '{prev_q}', verdict was '{prev_v}', location was {loc_str}")
        context_prefix = (
            "Conversation context (prior turns):\n"
            + "\n".join(lines)
            + "\nThe current query may be a follow-up referencing the same location or situation.\n"
        )

    # -----------------------------------------------------------------
    # 2. Location Extraction — from current query, with fallback to
    #    last-known location from conversation_history
    # -----------------------------------------------------------------
    location = None
    for town, coords in COASTAL_TOWNS.items():
        if re.search(rf"\b{town}\b", query_lower):
            location = coords
            break

    # Fallback: reuse last-known location from prior turns
    if location is None and conversation_history:
        for turn in reversed(conversation_history):
            prev_loc = turn.get("location")
            if prev_loc and "lat" in prev_loc and "lon" in prev_loc:
                location = prev_loc
                print(f"Multi-turn: reusing prior location {location} for follow-up query.")
                break

    # -----------------------------------------------------------------
    # 3. Intent Classification via LLM (with multi-turn context)
    # -----------------------------------------------------------------
    intent = None
    try:
        llm_response = call_llm(query, context_prefix=context_prefix).strip().lower()
        clean_intent = re.sub(r'[^a-z_]', '', llm_response)

        # Validate LLM output against the fixed list
        if clean_intent in VALID_INTENTS:
            intent = clean_intent
        elif llm_response in VALID_INTENTS:
            intent = llm_response
        else:
            raise ValueError(f"LLM returned invalid intent: {llm_response}")
        print(f"LLM successfully classified intent: '{intent}'")
            
    except Exception as e:
        # Fallback Classification
        print(f"LLM classification failed ({e}). Using fallback classifier.")
        intent = fallback_classifier(query)

    # -----------------------------------------------------------------
    # 4. Handle Missing Location
    # -----------------------------------------------------------------
    location_dependent_intents = {"safety_check", "pfz_only", "geofence_only"}
    if location is None and intent in location_dependent_intents:
        print(f"Missing location for {intent}. Falling back to general_info.")
        intent = "general_info"

    return {
        "intent": intent,
        "location": location
    }