"""
synthesis_agent.py — ORCA LangGraph node: final response synthesi
s with LLM.

Reads:  state["query"], state["weather_data"], state["geofence_result"],
        state["pfz_data"], state["risk_verdict"], state["risk_reasons"],
        state["errors"]

Writes: state["final_response"] | state["verdict_color"] | state["evidence"]
"""

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


def synthesize_with_llm(
    query: str,
    risk_verdict: str | None,
    risk_reasons: list[str],
    pfz_data: dict | None,
    weather_data: dict | None,
    geofence_result: dict | None,
    errors: list[str] | None = None,
    diagnostic_data: dict | None = None,
) -> str:
    """
    Synthesizes an empathetic, humanized marine safety advisory using Groq LLM.
    Strictly constrained by computed telemetry and safety rules. Falls back to deterministic template on failure.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not set.")

    if not _GROQ_AVAILABLE:
        raise NotImplementedError("groq package is not installed.")

    client = Groq(api_key=api_key, timeout=12.0)
    model = os.getenv("GROQ_MODEL", "groq/compound-mini")

    # Format structured context cleanly
    context_lines = [
        f"USER QUERY: {query}",
        f"OFFICIAL RISK VERDICT: {risk_verdict or 'insufficient_data'}",
        f"RISK DETAILS / REASONS: {risk_reasons if risk_reasons else ['None provided']}",
    ]
    if weather_data:
        context_lines.append(f"WEATHER TELEMETRY: Wave height {weather_data.get('wave_height_m', 'N/A')}m, Wind speed {weather_data.get('wind_speed_kmh', 'N/A')} km/h")
    else:
        context_lines.append("WEATHER TELEMETRY: Unavailable / Missing")

    if geofence_result:
        in_ind = geofence_result.get("in_indian_waters", False)
        jur = geofence_result.get("current_jurisdiction", "Unknown")
        dist_b = geofence_result.get("distance_to_indian_border_km")
        context_lines.append(f"GEOFENCE & JURISDICTION: in_indian_waters={in_ind}, jurisdiction={jur}, distance_to_border_km={dist_b}")
    else:
        context_lines.append("GEOFENCE & JURISDICTION: Not evaluated")

    if pfz_data:
        zones = pfz_data.get("nearby_zones", [])
        cache_age = pfz_data.get("cache_age_note") or pfz_data.get("cache_note")
        context_lines.append(f"POTENTIAL FISHING ZONES (PFZ - rich target grounds): {len(zones)} nearby zones found. Nearest: {zones[:3]}. Cache note: {cache_age or 'None'}")
    else:
        context_lines.append("POTENTIAL FISHING ZONES (PFZ): No data")

    if errors:
        context_lines.append(f"SYSTEM NOTICES / ERRORS: {errors}")

    if diagnostic_data:
        context_lines.append(f"DIAGNOSTIC ECOLOGICAL DATA: {diagnostic_data}")

    context_str = "\n".join(context_lines)

    system_prompt = (
        "You are ORCA, an empathetic, clear, and authoritative marine safety advisory AI for Indian coastal fishermen.\n"
        "Your role is to HUMANIZE and NARRATE the provided telemetry, safety verdicts, and navigational facts into plain, natural language.\n\n"
        "CRITICAL RULES (NON-NEGOTIABLE):\n"
        "1. Do not state any fact, number, location, or finding that is not present in the data provided below. Do not invent coordinates or numbers.\n"
        "2. Do not change, soften, or override the risk verdict. You are narrating the official assessment, NOT making your own safety judgment.\n"
        "3. For 'safe': state clearly that conditions look favourable for fishing.\n"
        "   For 'caution': urge elevated caution and vigilance.\n"
        "   For 'unsafe': state unequivocally that conditions are dangerous and fishermen must NOT venture to sea.\n"
        "   For 'insufficient_data': state plainly and clearly that environmental data is missing or incomplete, and NEVER confidently imply the sea is safe or unsafe.\n"
        "4. Note on PFZ: PFZ stands for Potential Fishing Zones (promising fish aggregation hotspots for harvest, NOT prohibited zones).\n"
        "5. If system notices/errors exist, explicitly mention that some data sources were unavailable and this advisory is based on partial data.\n"
        "6. If a PFZ cache staleness note is present, mention it so the fisherman knows the advisory date.\n"
        "7. If diagnostic ecological data is present, you MUST explicitly include this verbatim disclaimer:\n"
        "   '⚠️ Illustrative example data — not derived from live historical records.'\n"
        "8. Always conclude with: 'Always verify with official INCOIS bulletins before sailing.'\n"
        "9. Keep formatting clean and readable with short paragraphs and bullet points."
    )

    user_prompt = f"Here is the verified data for this advisory:\n\n{context_str}\n\nPlease generate the natural-language marine safety advisory now."

    completion = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_tokens=650,
    )
    return completion.choices[0].message.content.strip()


def synthesize_response_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    LangGraph node: assembles the final natural-language advisory response.
    """

    query           = state.get("query", "")
    weather_data    = state.get("weather_data")
    geofence_result = state.get("geofence_result")
    pfz_data        = state.get("pfz_data")
    risk_verdict    = state.get("risk_verdict")
    risk_reasons    = state.get("risk_reasons") or []
    errors          = state.get("errors") or []
    diagnostic_data = state.get("diagnostic_data")
    forecast_series = state.get("forecast_series")

    # If weather telemetry is absent, safety cannot be guaranteed — force insufficient_data
    if weather_data is None:
        risk_verdict = "insufficient_data"
        if not risk_reasons:
            risk_reasons = ["Environmental and sea-state telemetry is unavailable for this location."]

    try:
        # ------------------------------------------------------------------
        # SECTION 1 — DETERMINISTIC TEMPLATE FALLBACK ASSEMBLE
        # ------------------------------------------------------------------
        error_note = (
            "\n⚠️ Note: Some data sources were unavailable during this query. "
            "The advisory below is based on partial information only.\n"
            if errors else ""
        )

        verdict_map = {
            "safe":             "✅ SAFE TO SAIL — Conditions look favourable for fishing tomorrow.",
            "caution":          "⚠️ CAUTION ADVISED — Conditions are elevated; exercise care.",
            "unsafe":           "🚫 UNSAFE — Conditions are dangerous. Do NOT go to sea tomorrow.",
            "insufficient_data": (
                "❓ INSUFFICIENT DATA — We could not gather enough environmental "
                "data to make a reliable safety assessment. Check official INCOIS bulletins."
            ),
        }
        verdict_line = verdict_map.get(
            risk_verdict,
            "❓ INSUFFICIENT DATA — Risk verdict unavailable; check official sources."
        )

        reasons_block = (
            "\n\n📋 Details:\n" + "\n".join(f"  • {r}" for r in risk_reasons)
            if risk_reasons else ""
        )

        diagnostic_block = ""
        if diagnostic_data:
            sector = diagnostic_data.get("sector_name", "Coastal Sector")
            sst_anom = diagnostic_data.get("sst_anomaly_c", 1.2)
            chloro_drop = diagnostic_data.get("chlorophyll_drop_pct", 24)
            causals = diagnostic_data.get("causal_factors", [])
            causal_str = "\n".join([f"  • {c}" for c in causals])
            diagnostic_block = (
                f"\n\n📊 Historical Ecological Diagnostic ({sector}):\n"
                f"  • Sea Surface Temp Anomaly: +{sst_anom:.1f}°C above 5-year mean\n"
                f"  • Chlorophyll-a Front Shift: -{chloro_drop}% coastal concentration drop\n"
                f"  • Biological Causal Factors:\n{causal_str}"
            )

        geofence_block = ""
        if geofence_result is not None:
            jurisdiction     = geofence_result.get("current_jurisdiction", "Unknown")
            in_indian_waters = geofence_result.get("in_indian_waters", False)
            dist_km          = geofence_result.get("distance_to_indian_border_km")

            if not in_indian_waters:
                geofence_block = (
                    f"\n\n🗺️ Jurisdiction Warning: Query location appears to be "
                    f"in {jurisdiction} (outside Indian waters)."
                )
            elif dist_km is not None and dist_km < 20:
                geofence_block = (
                    f"\n\n🗺️ Border Proximity Alert: Within Indian waters ({jurisdiction}), "
                    f"approx {dist_km:.1f} km from maritime border."
                )
            else:
                geofence_block = (
                    f"\n\n🗺️ Jurisdiction: Within Indian waters ({jurisdiction})."
                    + (f" Approx. {dist_km:.1f} km from border." if dist_km is not None else "")
                )

        pfz_block = ""
        if pfz_data is not None:
            nearby_zones = pfz_data.get("nearby_zones", [])
            if nearby_zones:
                zone_lines = "\n".join(
                    f"  {i+1}. {z['lat']}°N, {z['lon']}°E — {z['distance_km']:.1f} km away"
                    for i, z in enumerate(nearby_zones)
                )
                pfz_block = f"\n\n🐟 Nearby Fishing Zones:\n{zone_lines}"
            else:
                pfz_block = "\n\n🐟 Fishing Zones: No nearby PFZ zones found in advisory."

        weather_block = ""
        if weather_data:
            wave = weather_data.get("wave_height_m")
            wind = weather_data.get("wind_speed_kmh")
            if wave is not None and wind is not None:
                weather_block = f"\n\n🌊 Weather: Wave height {wave:.1f}m, Wind speed {wind:.1f} km/h."

        template_response = (
            f"ORCA Marine Advisory\n"
            f"{'='*40}\n"
            f"Query: {query}\n"
            f"{'='*40}\n"
            f"{error_note}"
            f"{verdict_line}"
            f"{reasons_block}"
            f"{diagnostic_block}"
            f"{weather_block}"
            f"{geofence_block}"
            f"{pfz_block}\n"
            f"\nAlways verify with official INCOIS bulletins before sailing."
        )

        # ------------------------------------------------------------------
        # SECTION 2 — TRY LLM SYNTHESIS FIRST, FALLBACK TO TEMPLATE
        # ------------------------------------------------------------------
        try:
            llm_text = synthesize_with_llm(
                query=query,
                risk_verdict=risk_verdict,
                risk_reasons=risk_reasons,
                pfz_data=pfz_data,
                weather_data=weather_data,
                geofence_result=geofence_result,
                errors=errors,
                diagnostic_data=diagnostic_data,
            )
            print("LLM successfully synthesized advisory response.")
            response = llm_text
        except Exception as llm_exc:
            print(f"LLM Synthesis failed ({llm_exc}). Using template response.")
            response = template_response

        # ------------------------------------------------------------------
        # SECTION 3 — VERDICT COLOR & EVIDENCE PROVENANCE (DETERMINISTIC)
        # ------------------------------------------------------------------
        color_map = {
            "safe":             "green",
            "caution":          "amber",
            "unsafe":           "red",
            "insufficient_data": "amber",
        }
        verdict_color = color_map.get(risk_verdict, "amber")

        evidence: list = []

        if weather_data:
            wave = weather_data.get("wave_height_m")
            wind = weather_data.get("wind_speed_kmh")
            w_date = weather_data.get("date", "unknown date")
            if wave is not None and wind is not None:
                evidence.append({
                    "source": "Open-Meteo",
                    "detail": f"Wave height: {wave:.1f}m, Wind speed: {wind:.1f} km/h",
                    "as_of": f"Forecast for {w_date}",
                })

        if forecast_series:
            max_wave = max([f.get("wave_height_m", 0) for f in forecast_series])
            max_wind = max([f.get("wind_speed_kmh", 0) for f in forecast_series])
            evidence.append({
                "source": "12-Hour Sea-State Forecast Model",
                "detail": f"12h projection window: Peak swell wave {max_wave:.1f}m, Peak wind speed {max_wind:.1f} km/h.",
                "as_of": "12-Hour Projection Horizon",
            })

        if geofence_result is not None:
            jurisdiction = geofence_result.get("current_jurisdiction", "Unknown")
            in_indian    = geofence_result.get("in_indian_waters", False)
            dist_km      = geofence_result.get("distance_to_indian_border_km")
            geo_detail   = (
                f"Jurisdiction: {jurisdiction} "
                f"({'within' if in_indian else 'outside'} Indian EEZ)"
                + (f", {dist_km:.1f} km from Indian maritime border" if dist_km is not None else "")
            )
            evidence.append({
                "source": "EEZ geofence check (Marine Regions World EEZ v12)",
                "detail": geo_detail,
                "as_of": "Static dataset (Marine Regions v12)",
            })

        if pfz_data is not None:
            nearby = pfz_data.get("nearby_zones", [])
            forecast_date = pfz_data.get("forecast_date", "unknown")
            if nearby:
                nearest_dist = nearby[0].get("distance_km", "?")
                zone_summary = (
                    f"{len(nearby)} nearby PFZ zone(s) found; nearest at {nearest_dist:.1f} km"
                    if isinstance(nearest_dist, (int, float))
                    else f"{len(nearby)} nearby PFZ zone(s) found"
                )
            else:
                zone_summary = "No PFZ zones found in advisory coverage area"
            evidence.append({
                "source": "INCOIS PFZ advisory",
                "detail": zone_summary,
                "as_of": f"Advisory issued {forecast_date}, not live",
            })

        if diagnostic_data:
            sector = diagnostic_data.get("sector_name", "Coastal Sector")
            sst_anom = diagnostic_data.get("sst_anomaly_c", 1.2)
            chloro_drop = diagnostic_data.get("chlorophyll_drop_pct", 24)
            period = diagnostic_data.get("historical_period", "CMFRI/INCOIS 5-Year Data")
            evidence.append({
                "source": "Historical Ecological Diagnostics (INCOIS / CMFRI)",
                "detail": f"{sector}: +{sst_anom}°C SST warming, {chloro_drop}% chlorophyll drop causing pelagic fish displacement.",
                "as_of": period,
            })

        return {
            "final_response": response,
            "verdict_color":  verdict_color,
            "evidence":       evidence,
        }

    except Exception as e:
        fallback = (
            "ORCA Advisory Error: The response synthesis node encountered an "
            f"unexpected error ({str(e)}). Please retry your query or check "
            "official INCOIS marine safety bulletins directly."
        )
        return {
            "final_response": fallback,
            "verdict_color":  None,
            "evidence":       None,
        }
