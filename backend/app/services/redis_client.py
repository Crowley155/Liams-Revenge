"""
Redis client — connection pool, job queue, and SerpAPI response cache.

Falls back gracefully when Redis is unreachable (dev without Docker).
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import timedelta

from app.config import settings

logger = logging.getLogger(__name__)

_redis = None
_available = False

CACHE_TTL = timedelta(hours=24)
JOB_KEY_PREFIX = "job:"
CACHE_KEY_PREFIX = "serp_cache:"


def _get_redis():
    global _redis, _available
    if _redis is not None:
        return _redis

    try:
        import redis
        _redis = redis.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
        )
        _redis.ping()
        _available = True
        logger.info("Redis connected at %s", settings.redis_url)
    except Exception as e:
        _available = False
        _redis = None
        logger.info("Redis not available (non-fatal): %s", e)

    return _redis


def is_available() -> bool:
    _get_redis()
    return _available


# ---------------------------------------------------------------------------
# SerpAPI response cache
# ---------------------------------------------------------------------------

def cache_key(query: str) -> str:
    return CACHE_KEY_PREFIX + hashlib.sha256(query.encode()).hexdigest()[:16]


def get_cached_search(query: str) -> dict | None:
    r = _get_redis()
    if not r:
        return None
    try:
        raw = r.get(cache_key(query))
        return json.loads(raw) if raw else None
    except Exception:
        return None


def set_cached_search(query: str, data: dict):
    r = _get_redis()
    if not r:
        return
    try:
        r.setex(cache_key(query), int(CACHE_TTL.total_seconds()), json.dumps(data, default=str))
    except Exception as e:
        logger.warning("Failed to cache search result: %s", e)


# ---------------------------------------------------------------------------
# Job status (supplementary — SQLite is primary, this enables pub/sub later)
# ---------------------------------------------------------------------------

def publish_job_update(job_id: str, status: str, data: dict | None = None):
    r = _get_redis()
    if not r:
        return
    try:
        payload = json.dumps({"job_id": job_id, "status": status, **(data or {})}, default=str)
        r.publish(f"job_updates:{job_id}", payload)
    except Exception:
        pass


def set_rate_limit(key: str, max_calls: int, window_seconds: int) -> bool:
    """
    Simple sliding-window rate limiter.
    Returns True if the call is allowed, False if rate-limited.
    """
    r = _get_redis()
    if not r:
        return True

    try:
        count = r.incr(f"ratelimit:{key}")
        if count == 1:
            r.expire(f"ratelimit:{key}", window_seconds)
        return count <= max_calls
    except Exception:
        return True
