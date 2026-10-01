"""
stt_service.py — Speech-to-Text (STT) transcription service for ORCA.

Converts recorded WebM/WAV/OGG voice audio into localized natural-language text.
Browser MediaRecorder outputs audio/webm (not WAV), so we try multiple decoders.
"""

import io
import logging
import subprocess
import tempfile
import os
from typing import Optional
import speech_recognition as sr

logger = logging.getLogger(__name__)

# Map ISO-639-1 short codes → BCP-47 tags expected by Google Speech API
_LANG_MAP = {
    "en": "en-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "ml": "ml-IN",
    "kn": "kn-IN",
    "hi": "hi-IN",
    "mr": "mr-IN",
    "gu": "gu-IN",
    "bn": "bn-IN",
    "or": "or-IN",
}


def _normalize_lang(lang_code: str) -> str:
    """Convert ISO-639-1 code to BCP-47 if needed."""
    code = (lang_code or "en").strip().lower()
    return _LANG_MAP.get(code, code)


def _convert_to_wav(audio_bytes: bytes) -> Optional[bytes]:
    """
    Convert arbitrary audio (webm/ogg/mp4) to 16kHz mono WAV using ffmpeg.
    Returns None if ffmpeg is unavailable or conversion fails.
    """
    src_path = None
    out_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".input", delete=False) as src:
            src.write(audio_bytes)
            src_path = src.name

        out_path = src_path + ".wav"
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", src_path, "-ar", "16000", "-ac", "1", "-f", "wav", out_path],
            capture_output=True,
            timeout=15,
        )
        if result.returncode == 0 and os.path.exists(out_path):
            with open(out_path, "rb") as f:
                return f.read()
        logger.debug("ffmpeg failed (rc=%d): %s", result.returncode, result.stderr.decode(errors="replace"))
    except FileNotFoundError:
        logger.debug("ffmpeg not found — cannot convert browser audio to WAV.")
    except subprocess.TimeoutExpired:
        logger.warning("ffmpeg timed out during audio conversion.")
    except Exception as e:
        logger.debug("ffmpeg conversion error: %s", e)
    finally:
        for p in [src_path, out_path]:
            if p:
                try:
                    os.unlink(p)
                except Exception:
                    pass
    return None


# Sentinel: audio format unreadable → should trigger ffmpeg fallback
_FORMAT_ERROR = object()


def transcribe_audio(audio_bytes: bytes, lang_code: str = "en-IN") -> Optional[str]:
    """
    Transcribes raw audio bytes (WebM/WAV/OGG/FLAC) into text.

    Strategy:
      1. Try sr.AudioFile directly (works for WAV/AIFF/FLAC).
      2. If format unreadable (ValueError), convert via ffmpeg → WAV then retry.
      3. Return None if speech cannot be recognized.

    Args:
        audio_bytes: Raw audio file bytes from the browser MediaRecorder.
        lang_code: ISO-639-1 (e.g. 'ta') or BCP-47 (e.g. 'ta-IN') language code.
    """
    if not audio_bytes:
        return None

    bcp47 = _normalize_lang(lang_code)
    recognizer = sr.Recognizer()

    def _recognize(wav_bytes: bytes):
        """
        Returns:
          str          — recognized text
          None         — audio decoded OK but speech not understood
          _FORMAT_ERROR — audio format unreadable, try conversion
        """
        try:
            with sr.AudioFile(io.BytesIO(wav_bytes)) as source:
                audio_data = recognizer.record(source)
            text = recognizer.recognize_google(audio_data, language=bcp47)
            logger.info("STT successful | lang=%s | text=%r", bcp47, text)
            return text
        except (ValueError, EOFError):
            # sr.AudioFile raises ValueError for non-WAV/AIFF/FLAC formats
            return _FORMAT_ERROR
        except sr.UnknownValueError:
            logger.warning("STT: Speech could not be understood (lang=%s).", bcp47)
            return None
        except sr.RequestError as e:
            logger.error("STT: Google Speech API error: %s", e)
            return None
        except Exception as e:
            logger.error("STT: Unexpected recognition error: %s", e)
            return _FORMAT_ERROR

    # Attempt 1: treat bytes as WAV/FLAC directly (fast path)
    result = _recognize(audio_bytes)

    if result is _FORMAT_ERROR:
        # Attempt 2: browser sent webm/ogg — convert via ffmpeg
        logger.info("STT: Direct WAV decode failed; attempting ffmpeg conversion...")
        wav_bytes = _convert_to_wav(audio_bytes)
        if not wav_bytes:
            logger.error("STT: ffmpeg unavailable or failed — no transcription produced.")
            return None
        result = _recognize(wav_bytes)

    if result is _FORMAT_ERROR:
        logger.error("STT: Audio unreadable even after conversion.")
        return None

    return result  # str | None
