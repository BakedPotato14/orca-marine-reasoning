import io
import base64
import logging
import re
from typing import Optional, Tuple
from gtts import gTTS

SUPPORTED_INDIC_TTS = {
    'hi': 'Hindi',
    'ta': 'Tamil',
    'te': 'Telugu',
    'ml': 'Malayalam',
    'kn': 'Kannada',
    'mr': 'Marathi',
    'gu': 'Gujarati',
    'bn': 'Bengali',
    'en': 'English'
}

def generate_speech_base64(text: str, lang_code: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Converts localized text to spoken audio using the specific regional language model.
    Returns (audio_base64_uri, error_message_if_any).
    """
    if not text:
        return (None, None)
        
    try:
        # Clean & extract base language code (e.g., 'ta-IN' -> 'ta')
        raw_lang = (lang_code or "en").lower().strip()
        safe_lang = raw_lang.split("-")[0]
        
        # 1. Print Debug Log safely without throwing cp1252 encoding errors
        try:
            safe_text_preview = text[:120].encode('ascii', errors='backslashreplace').decode('ascii')
            print(f"DEBUG TTS Input - Lang: {safe_lang}, Text: {safe_text_preview}")
        except Exception:
            pass
        
        # 2. Check for missing native script warning
        if safe_lang == 'ta' and not re.search(r'[\u0B80-\u0BFF]', text):
            print(f"SEVERE WARNING: TTS requested in Tamil ('ta') but text contains no Tamil script!")
            
        # 3. Force fallback to English ONLY if language code isn't supported by gTTS
        tts_lang = safe_lang if safe_lang in SUPPORTED_INDIC_TTS else 'en'
        
        # Clean decorative lines (like "==========") so TTS speaks actual advisory content
        clean_lines = [
            line for line in text.splitlines()
            if not re.match(r'^[=\-*#\s]+$', line)
        ]
        clean_text = " ".join(clean_lines)
        clean_text = re.sub(r'[=\-*#_`~]', ' ', clean_text)
        clean_text = re.sub(r'\s+', ' ', clean_text).strip()
        
        if not clean_text:
            return (None, None)
            
        speech_text = clean_text[:350]

        # 4. Generate speech explicitly forcing regional language code (e.g. lang='ta')
        tts = gTTS(text=speech_text, lang=tts_lang, slow=False)
        
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        
        audio_bytes = fp.read()
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        
        return (f"data:audio/mp3;base64,{audio_base64}", None)
        
    except Exception as e:
        err_msg = f"Vernacular speech audio generation (gTTS) failed for language '{lang_code}': {str(e)}."
        logging.error(err_msg)
        print(f"DEBUG TTS Exception for lang '{lang_code}': {str(e)}")
        return (None, err_msg)
