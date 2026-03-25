"""Study-deck TTS: ElevenLabs primary, Gemini TTS fallback. Does not change ElevenLabs client internals."""

from __future__ import annotations

import logging

from elevenlabs_client import synthesize_speech as elevenlabs_synthesize
from gemini_tts import synthesize_speech_gemini

logger = logging.getLogger(__name__)


def synthesize_study_audio(text: str, *, max_chars: int = 4800) -> tuple[bytes, str, str]:
    """
    Returns (audio_bytes, mime_type, provider) where provider is elevenlabs | gemini.
    """
    try:
        audio = elevenlabs_synthesize(text, max_chars=max_chars)
        return audio, "audio/mpeg", "elevenlabs"
    except Exception as e:  # noqa: BLE001
        logger.warning("ElevenLabs TTS failed (%s); falling back to Gemini TTS.", e)
    audio_wav = synthesize_speech_gemini(text, max_chars=max_chars)
    return audio_wav, "audio/wav", "gemini"
