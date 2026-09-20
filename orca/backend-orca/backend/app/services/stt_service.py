"""
stt_service.py — Speech-to-Text (STT) transcription service for ORCA.

Converts recorded WAV voice audio input into localized natural-language text.
"""

import io
import logging
from typing import Optional
import speech_recognition as sr

logger = logging.getLogger(__name__)


def transcribe_audio(audio_bytes: bytes, lang_code: str = "en-IN") -> Optional[str]:
    """
    Transcribes raw audio bytes (WAV/FLAC) into text using Google Speech Recognition.

    Args:
        audio_bytes (bytes): Raw audio file content (from Streamlit st.audio_input).
        lang_code (str): BCP-47 language tag (e.g. 'en-IN', 'ta-IN', 'hi-IN', 'te-IN', 'ml-IN').

    Returns:
        Optional[str]: Recognized transcription string or None if audio is unparseable.
    """
    if not audio_bytes:
        return None

    recognizer = sr.Recognizer()

    try:
        audio_stream = io.BytesIO(audio_bytes)
        with sr.AudioFile(audio_stream) as source:
            audio_data = recognizer.record(source)

        # Recognize speech using Google Web Speech API
        text = recognizer.recognize_google(audio_data, language=lang_code)
        logger.info(f"STT successful | lang={lang_code} | text={text!r}")
        return text

    except sr.UnknownValueError:
        logger.warning(f"STT: Speech could not be understood (lang={lang_code}).")
        return None
    except sr.RequestError as e:
        logger.error(f"STT: Speech recognition service request error: {e}")
        return None
    except Exception as e:
        logger.error(f"STT error processing audio bytes: {e}")
        return None
