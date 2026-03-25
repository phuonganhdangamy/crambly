"""Gemini native TTS (fallback when ElevenLabs fails). Uses google-genai SDK."""

from __future__ import annotations

import io
import logging
import wave
from config import get_settings

logger = logging.getLogger(__name__)


def pcm_to_wav(pcm_data: bytes, sample_rate: int = 24000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_data)
    return buffer.getvalue()


def _parse_rate_from_mime(mime: str | None) -> int | None:
    if not mime:
        return None
    m = mime.lower()
    if "rate=" in m:
        try:
            part = m.split("rate=", 1)[1].split(";", 1)[0].strip()
            return int(float(part))
        except (ValueError, IndexError):
            return None
    return None


def synthesize_speech_gemini(text: str, *, max_chars: int = 4800) -> bytes:
    """
    Return WAV bytes. Raises on failure.
    """
    from google import genai
    from google.genai import types

    s = get_settings()
    if not (s.gemini_api_key or "").strip():
        raise RuntimeError("GEMINI_API_KEY is required for Gemini TTS fallback")

    cap = max(256, min(max_chars, 5000))
    snippet = (text or "").strip()[:cap]
    if not snippet:
        raise RuntimeError("Empty text for TTS")

    model_id = (s.gemini_tts_model or "gemini-2.5-flash-preview-tts").strip()
    client = genai.Client(api_key=s.gemini_api_key)

    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore"),
            ),
        ),
    )

    response = client.models.generate_content(
        model=model_id,
        contents=snippet,
        config=config,
    )

    pcm: bytes | None = None
    sample_rate = 24000
    cands = getattr(response, "candidates", None) or []
    for cand in cands:
        content = getattr(cand, "content", None)
        parts = getattr(content, "parts", None) if content else None
        if not parts:
            continue
        for part in parts:
            inline = getattr(part, "inline_data", None)
            if inline is None and isinstance(part, dict):
                inline = part.get("inline_data")
            if inline is None:
                continue
            data = getattr(inline, "data", None)
            mime = getattr(inline, "mime_type", None) or getattr(inline, "mimeType", None)
            if isinstance(inline, dict):
                data = data or inline.get("data")
                mime = mime or inline.get("mime_type") or inline.get("mimeType")
            if data:
                if isinstance(data, str):
                    import base64

                    data = base64.b64decode(data)
                pcm = data
                r = _parse_rate_from_mime(mime if isinstance(mime, str) else None)
                if r:
                    sample_rate = r
                break
        if pcm:
            break

    if not pcm:
        raise RuntimeError("Gemini TTS response contained no audio inline data")

    logger.info("Gemini TTS produced %s bytes PCM (rate=%s)", len(pcm), sample_rate)
    return pcm_to_wav(pcm, sample_rate=sample_rate)
