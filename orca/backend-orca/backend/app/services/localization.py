"""
localization.py — ORCA Localization / Translation Service.

Role in the pipeline
--------------------
This module acts as the "Localization Wrapper" that brackets the entire
LangGraph orchestrator:

    User query (vernacular)
           │
           ▼
    detect_and_translate_to_english()   ← this module (pre-pipeline)
           │
           ▼
    ORCA LangGraph agents               ← English only, no multilingual complexity
           │
           ▼
    translate_to_regional()             ← this module (post-pipeline)
           │
           ▼
    Advisory in user's language
"""

import logging
import os
import re
from pathlib import Path
from typing import Tuple, Optional
from dotenv import load_dotenv

# Ensure .env is loaded from backend-orca root
env_path = Path(__file__).resolve().parents[3] / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

logger = logging.getLogger("orca.localization")

try:
    from groq import Groq
    _GROQ_AVAILABLE = True
except ImportError:
    _GROQ_AVAILABLE = False

try:
    from deep_translator import GoogleTranslator, single_detection
    _DEEP_TRANSLATOR_AVAILABLE = True
except ImportError:
    logger.critical(
        "deep-translator is not installed. Run: pip install deep-translator. "
        "Fallback localization will be disabled."
    )
    _DEEP_TRANSLATOR_AVAILABLE = False


INDIAN_LANG_NAMES = {
    "ta": "Tamil",
    "te": "Telugu",
    "hi": "Hindi",
    "ml": "Malayalam",
    "kn": "Kannada",
    "gu": "Gujarati",
    "bn": "Bengali",
    "mr": "Marathi",
    "or": "Odia",
}


def detect_indic_script(text: str) -> Optional[str]:
    """Detects Indian regional languages using Unicode script ranges."""
    if re.search(r'[\u0B80-\u0BFF]', text):
        return 'ta'  # Tamil
    if re.search(r'[\u0C00-\u0C7F]', text):
        return 'te'  # Telugu
    if re.search(r'[\u0900-\u097F]', text):
        return 'hi'  # Hindi / Devanagari
    if re.search(r'[\u0D00-\u0D7F]', text):
        return 'ml'  # Malayalam
    if re.search(r'[\u0C80-\u0CFF]', text):
        return 'kn'  # Kannada
    if re.search(r'[\u0A80-\u0AFF]', text):
        return 'gu'  # Gujarati
    if re.search(r'[\u0980-\u09FF]', text):
        return 'bn'  # Bengali
    return None


def _get_groq_client_and_model() -> Tuple[Optional[Groq], str]:
    """Instantiates Groq client and resolves suitable model."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or not _GROQ_AVAILABLE:
        return None, ""
    client = Groq(api_key=api_key, timeout=8.0)
    model = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
    return client, model


def _translate_to_english_groq(text: str, detected_lang: str) -> str:
    """Translates non-English query to English using Groq."""
    client, model = _get_groq_client_and_model()
    if not client:
        raise ValueError("Groq client not available")

    lang_name = INDIAN_LANG_NAMES.get(detected_lang, detected_lang)
    prompt = (
        f"You are a translator for Indian coastal fishermen. "
        f"Translate the following user query from {lang_name} to English.\n"
        f"Preserve all coastal towns and port names in standard English (e.g. Mangalore, Kochi, Chennai, Goa, Vizag, Veraval, Mumbai).\n"
        f"Return ONLY the English translation without quotes, explanations, or introductory text.\n\n"
        f"Query: {text}"
    )
    completion = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        max_tokens=100,
    )
    content = completion.choices[0].message.content.strip()
    # Strip any accidental surrounding quotes
    content = re.sub(r'^["\']|["\']$', '', content).strip()
    if not content:
        raise ValueError("Groq returned empty translation")
    return content


def _translate_to_regional_groq(text: str, target_lang_code: str) -> str:
    """Translates English advisory to regional language using Groq."""
    client, model = _get_groq_client_and_model()
    if not client:
        raise ValueError("Groq client not available")

    lang_name = INDIAN_LANG_NAMES.get(target_lang_code, target_lang_code)
    prompt = (
        f"You are a professional maritime translator for Indian coastal fisheries.\n"
        f"Translate the following English marine safety advisory into {lang_name} ({target_lang_code}).\n\n"
        f"Rules:\n"
        f"1. Preserve numbers, units (m, km/h, °N, °E), bullet points, and warning symbols (✅, ⚠️, 🚫).\n"
        f"2. Do not change, omit, or soften any safety verdict or fact.\n"
        f"3. Return ONLY the translated advisory in {lang_name} script, with no introductory or meta commentary.\n\n"
        f"Text to translate:\n{text}"
    )
    completion = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=800,
    )
    content = completion.choices[0].message.content.strip()
    if not content:
        raise ValueError("Groq returned empty regional translation")
    return content


def detect_and_translate_to_english(text: str) -> Tuple[str, str, Optional[str]]:
    """
    Detect the language of `text` and translate it to English if needed.
    Priority 1: Groq LLM translation.
    Priority 2: deep-translator GoogleTranslator fallback.
    Priority 3: Return original text with clear error notice.
    Returns (english_text, detected_lang_code, error_message_if_any).
    """
    if not text or not text.strip():
        return (text, "en", None)

    script_lang = detect_indic_script(text)
    detected_lang = script_lang
    det_error = None

    if not detected_lang and _DEEP_TRANSLATOR_AVAILABLE:
        try:
            detected_lang = single_detection(text, api_key=None)
            logger.info("Language detected via API: '%s' for query: %r", detected_lang, text[:60])
        except Exception as det_exc:
            logger.warning("Language detection API failed (%s). Treating query as English.", det_exc)
            det_error = f"Language detection service failed: {str(det_exc)}. Query processed as English."
            detected_lang = "en"

    if not detected_lang:
        detected_lang = "en"

    if detected_lang == "en":
        return (text, "en", det_error)

    # 1. Try Groq Translation first (reliable, no rate limits)
    try:
        translated = _translate_to_english_groq(text, detected_lang)
        logger.info(
            "Translated '%s' -> 'en' via Groq: %r -> %r",
            detected_lang, text[:60], translated[:60]
        )
        return (translated, detected_lang, det_error)
    except Exception as groq_exc:
        logger.warning("Groq translation failed (%s). Falling back to deep-translator.", groq_exc)

    # 2. Fallback to deep-translator GoogleTranslator
    if _DEEP_TRANSLATOR_AVAILABLE:
        try:
            translated: str = GoogleTranslator(
                source=detected_lang, target="en"
            ).translate(text)

            if not translated or not translated.strip():
                raise ValueError("translate() returned empty string")

            logger.info(
                "Translated '%s' -> 'en' via deep-translator fallback: %r -> %r",
                detected_lang, text[:60], translated[:60]
            )
            return (translated, detected_lang, det_error)
        except Exception as dt_exc:
            logger.warning("deep-translator fallback also failed: %s", dt_exc)

    # 3. Both failed: return original text with explicit error
    err_msg = (
        f"Translation from '{detected_lang}' to English failed across all providers. "
        "Processing original query text — location parsing may require English names."
    )
    logger.error(err_msg)
    return (text, detected_lang, err_msg)


def translate_to_regional(text: str, target_lang_code: Optional[str]) -> Tuple[str, Optional[str]]:
    """
    Translate the English advisory response back into the user's language.
    Priority 1: Groq LLM translation.
    Priority 2: deep-translator GoogleTranslator fallback.
    Priority 3: Return original English text with clear error notice.
    Returns (localized_text, error_message_if_any).
    """
    if not target_lang_code or target_lang_code == "en":
        return (text, None)

    if not text or not text.strip():
        return (text, None)

    # Extract 2-letter base ISO code (e.g. 'ta-IN' -> 'ta')
    lang_base = target_lang_code.split("-")[0].lower()

    if lang_base == "en":
        return (text, None)

    # 1. Try Groq Translation first
    try:
        translated = _translate_to_regional_groq(text, lang_base)
        logger.info(
            "Translated response 'en' -> '%s' via Groq (%d chars -> %d chars)",
            lang_base, len(text), len(translated)
        )
        return (translated, None)
    except Exception as groq_exc:
        logger.warning("Groq regional translation failed (%s). Falling back to deep-translator.", groq_exc)

    # 2. Fallback to deep-translator
    if _DEEP_TRANSLATOR_AVAILABLE:
        try:
            clean_lines = [
                line for line in text.splitlines()
                if not re.match(r'^[=\-*#\s]+$', line)
            ]
            text_to_translate = "\n".join(clean_lines).strip()

            translated: str = GoogleTranslator(
                source="auto", target=lang_base
            ).translate(text_to_translate)

            if not translated or not translated.strip():
                raise ValueError("translate() returned empty string")

            logger.info(
                "Translated response 'en' -> '%s' via deep-translator (%d chars -> %d chars)",
                lang_base, len(text), len(translated)
            )
            return (translated, None)
        except Exception as dt_exc:
            logger.warning("deep-translator back-translation failed: %s", dt_exc)

    # 3. Both failed: return English text with explicit error
    err_msg = (
        f"Back-translation to regional language '{target_lang_code}' failed across all providers. "
        "Displaying English advisory."
    )
    logger.error(err_msg)
    return (text, err_msg)
