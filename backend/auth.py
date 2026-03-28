"""
Supabase JWT verification for FastAPI. User id comes from the `sub` claim.
When CRAMBLY_AUTH_DISABLED=true, falls back to the configured demo user (local dev only).

Supports:
- HS256 + legacy JWT secret (older projects)
- ES256/RS256 via JWKS after "JWT Signing Keys" migration (see Supabase docs)
"""

from __future__ import annotations

import logging
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient, get_unverified_header

from config import Settings, get_settings

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

_DECODE_OPTS = {
    "verify_signature": True,
    "verify_exp": True,
    "verify_aud": False,
}


def require_uid_match(path_uid: str, token_uid: UUID) -> None:
    if path_uid != str(token_uid):
        raise HTTPException(403, "Forbidden")


def _decode_payload(token: str, settings: Settings) -> dict:
    """Verify signature using HS256 secret or asymmetric key from JWKS (new signing keys)."""
    try:
        header = get_unverified_header(token)
    except jwt.PyJWTError as e:
        raise HTTPException(401, "Invalid or expired token") from e

    alg = (header.get("alg") or "HS256").upper()

    if alg == "HS256":
        secret = settings.supabase_jwt_secret.strip().strip('"').strip("'")
        if not secret:
            raise HTTPException(500, "SUPABASE_JWT_SECRET is not configured (required for HS256 tokens)")
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options=_DECODE_OPTS,
            leeway=30,
        )

    base = settings.supabase_url.strip().rstrip("/")
    if not base:
        raise HTTPException(
            500,
            "SUPABASE_URL is required to verify asymmetric JWTs (JWT Signing Keys / JWKS)",
        )

    jwks_url = f"{base}/auth/v1/.well-known/jwks.json"
    try:
        jwks_client = PyJWKClient(jwks_url, cache_keys=True)
        signing_key = jwks_client.get_signing_key_from_jwt(token)
    except Exception as e:  # noqa: BLE001 — network / parse
        logger.warning("JWKS verification setup failed: %s", e)
        raise HTTPException(401, "Invalid or expired token") from e

    known = {"ES256", "ES384", "ES512", "RS256", "RS384", "RS512"}
    algorithms = [alg] if alg in known else ["ES256", "RS256"]
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=algorithms,
        options=_DECODE_OPTS,
        leeway=30,
    )


def get_current_user_id(
    settings: Settings = Depends(get_settings),
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> UUID:
    if settings.auth_disabled:
        return settings.crambly_demo_user_id

    if credentials is None or not credentials.credentials:
        raise HTTPException(401, "Missing or invalid Authorization header")
    token = credentials.credentials

    try:
        payload = _decode_payload(token, settings)
    except HTTPException:
        raise
    except jwt.PyJWTError as e:
        raise HTTPException(401, "Invalid or expired token") from e

    if payload.get("role") != "authenticated":
        raise HTTPException(401, "Invalid or expired token")

    base = settings.supabase_url.strip().rstrip("/")
    if base:
        iss = payload.get("iss")
        if isinstance(iss, str) and iss and not iss.startswith(base):
            raise HTTPException(401, "Invalid or expired token")

    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(401, "Token missing sub")
    try:
        return UUID(sub)
    except ValueError as e:
        raise HTTPException(401, "Invalid user id in token") from e
