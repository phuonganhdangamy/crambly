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
    # Latest preview Pro (multimodal: PDF/image/audio). Override with GEMINI_MODEL in .env.
    # If 404, pick another id from https://ai.google.dev/gemini-api/docs/models for your key.
    gemini_model: str = "gemini-3.1-pro-preview"
    # Matches pgvector(768) in supabase migration (embedding-001 = 768 dims).
    gemini_embedding_model: str = "models/embedding-001"


@lru_cache
def get_settings() -> Settings:
    return Settings()
