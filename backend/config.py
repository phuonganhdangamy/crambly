"""
Central settings for the FastAPI service. Loads from environment / .env at repo root.
"""

from functools import lru_cache
from uuid import UUID

from pydantic import Field
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
    # JWT secret from Supabase Dashboard → Project Settings → API → JWT Secret (verify HS256 access tokens).
    supabase_jwt_secret: str = ""
    # If true, API uses CRAMBLY_DEMO_USER_ID and ignores Authorization (local/dev without JWT).
    # Set false in production with SUPABASE_JWT_SECRET and Bearer tokens from the web app.
    # Env must be CRAMBLY_AUTH_DISABLED (not AUTH_DISABLED — that was a silent footgun).
    auth_disabled: bool = Field(default=True, validation_alias="CRAMBLY_AUTH_DISABLED")
    supabase_upload_bucket: str = "uploads"
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    youtube_api_key: str = ""
    # Resend (transactional email). https://resend.com — set RESEND_API_KEY; use a verified domain for `from`.
    resend_api_key: str = ""
    resend_from_email: str = "Crambly <onboarding@resend.dev>"
    # Base URL for links inside notification emails (study hub, courses).
    crambly_public_web_url: str = "http://localhost:3000"
    # Gemini TTS fallback when ElevenLabs fails (low quota — use as fallback only).
    gemini_tts_model: str = "gemini-2.5-flash-preview-tts"
    # Empty = skip Redis (demo-friendly). Set e.g. redis://localhost:6379/0 when you run a worker queue.
    redis_url: str = ""

    # Browser CORS: comma-separated origins, e.g. https://app.example.com,https://www.example.com
    # Use * for local dev only; production should list explicit HTTPS origins.
    cors_origins: str = "*"
    # Ignored when cors_origins is * (browsers disallow credentials with wildcard).
    cors_allow_credentials: bool = False

    # In-process digest/reminder scheduler. Set false on extra API replicas to avoid duplicate sends.
    enable_notification_scheduler: bool = True

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
