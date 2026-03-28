"""Supabase service-role client and small helpers shared by agents."""

from __future__ import annotations

from uuid import UUID

from supabase import Client, create_client

from config import get_settings


def supabase_client() -> Client:
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")
    return create_client(s.supabase_url, s.supabase_service_key)


def ensure_demo_user() -> UUID:
    """Upsert the hardcoded demo user used when auth UI is disabled."""
    s = get_settings()
    ensure_app_user(s.crambly_demo_user_id, s.crambly_demo_user_email)
    return s.crambly_demo_user_id


def ensure_app_user(user_id: UUID, email: str | None = None) -> None:
    """Ensure a row exists in public.users (id matches Supabase Auth user)."""
    sb = supabase_client()
    em = (email or "").strip() or f"user-{user_id}@users.local"
    sb.table("users").upsert({"id": str(user_id), "email": em}).execute()


def vector_to_pg(vec: list[float]) -> str:
    """Format for pgvector via PostgREST (string literal of array)."""
    return "[" + ",".join(str(float(x)) for x in vec) + "]"
