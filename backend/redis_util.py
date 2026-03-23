"""
Lightweight Redis helpers for task queuing (MVP: enqueue only; workers optional).
"""

from __future__ import annotations

import json
import logging
from typing import Any

import redis

from config import get_settings

logger = logging.getLogger(__name__)


def get_redis() -> redis.Redis | None:
    url = (get_settings().redis_url or "").strip()
    if not url:
        return None
    try:
        client = redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=1.5,
        )
        client.ping()
        return client
    except redis.exceptions.RedisError:
        logger.warning("Redis unreachable — continuing without queue.", exc_info=True)
        return None
    except Exception:  # noqa: BLE001
        logger.warning("Redis unavailable — continuing without queue.", exc_info=True)
        return None


def enqueue_ingestion(payload: dict[str, Any]) -> None:
    """Never raises: ingestion already runs in-process; the queue is optional."""
    try:
        r = get_redis()
        if not r:
            return
        r.lpush("crambly:ingestion", json.dumps(payload))
    except redis.exceptions.RedisError:
        logger.warning("Skipped Redis enqueue (server not running).", exc_info=True)
    except Exception:  # noqa: BLE001
        logger.warning("Skipped Redis enqueue.", exc_info=True)
