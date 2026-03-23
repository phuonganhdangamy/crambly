"""
Central settings for the FastAPI service. Loads from environment / .env at repo root.
"""

from functools import lru_cache
from uuid import UUID

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str = ""
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_upload_bucket: str = "uploads"
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    # Empty = skip Redis (demo-friendly). Set e.g. redis://localhost:6379/0 when you run a worker queue.
    redis_url: str = ""

    crambly_demo_user_id: UUID = UUID("00000000-0000-0000-0000-000000000001")
    crambly_demo_user_email: str = "demo@crambly.app"

    total_semester_days: float = 120.0
    # Legacy single model id (kept for backwards-compatibility with older envs).
    # New code uses:
    # - `gemini_text_model` for fast text tasks (transform, meme briefs, etc.)
    # - `gemini_ingestion_model` for multimodal ingestion (PDF/image/audio parsing)
    gemini_model: str = "gemini-3.1-pro-preview"

    # Fast tier (lower latency + higher RPM) for text-only tasks.
    gemini_text_model: str = "gemini-3.1-flash-lite-preview"
    # Heavy tier for multimodal ingestion (PDF/image/audio parsing).
    gemini_ingestion_model: str = "gemini-3.1-pro-preview"
    # Meme fallback / “AI Reimagine” image generation (REST generateContent + responseModalities).
    gemini_meme_image_model: str = "gemini-3.1-flash-image-preview"
    # Imgflip caption API (optional). Without these, meme flow uses Gemini image for all outputs.
    imgflip_username: str = ""
    imgflip_password: str = ""
    # text-embedding-004 was retired Jan 2026; use gemini-embedding-001 (+ optional output_dimensionality).
    gemini_embedding_model: str = "models/gemini-embedding-001"
    # Must match pgvector(N) on concepts.embedding (768 default). Use 3072 after optional SQL migration.
    gemini_embedding_output_dimensionality: int = 768


@lru_cache
def get_settings() -> Settings:
    return Settings()
