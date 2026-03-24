"""Text-to-speech via ElevenLabs HTTP API."""

from __future__ import annotations

import logging

import httpx

from config import get_settings

logger = logging.getLogger(__name__)


def synthesize_speech(text: str, *, max_chars: int = 2500) -> bytes:
    s = get_settings()
    if not s.elevenlabs_api_key:
        raise RuntimeError("ELEVENLABS_API_KEY is not set")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{s.elevenlabs_voice_id}"
    headers = {
        "xi-api-key": s.elevenlabs_api_key,
        "accept": "audio/mpeg",
        "content-type": "application/json",
    }
    cap = max(256, min(max_chars, 10000))
    body = {
        "text": text[:cap],
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.4, "similarity_boost": 0.75},
    }
    with httpx.Client(timeout=120.0) as client:
        r = client.post(url, json=body, headers=headers)
        r.raise_for_status()
        return r.content
