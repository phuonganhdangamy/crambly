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
    uid = str(s.crambly_demo_user_id)
    sb = supabase_client()
    sb.table("users").upsert(
        {"id": uid, "email": s.crambly_demo_user_email},
    ).execute()
    return s.crambly_demo_user_id


def vector_to_pg(vec: list[float]) -> str:
    """Format for pgvector via PostgREST (string literal of array)."""
    return "[" + ",".join(str(float(x)) for x in vec) + "]"
