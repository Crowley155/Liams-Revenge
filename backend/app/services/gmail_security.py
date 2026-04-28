from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta

from cryptography.fernet import Fernet

from app.config import settings


STATE_TTL_MINUTES = 15


def _env(key: str, default: str = "") -> str:
    value = os.getenv(key)
    return value if value else default


def gmail_client_id() -> str:
    return _env("GOOGLE_OAUTH_CLIENT_ID", settings.google_oauth_client_id or "")


def gmail_client_secret() -> str:
    return _env("GOOGLE_OAUTH_CLIENT_SECRET", settings.google_oauth_client_secret or "")


def gmail_redirect_uri() -> str:
    explicit = _env("GOOGLE_OAUTH_REDIRECT_URI", settings.google_oauth_redirect_uri or "")
    if explicit:
        return explicit
    public_backend = _env("BACKEND_PUBLIC_URL", settings.backend_public_url or "").rstrip("/")
    if public_backend:
        return f"{public_backend}/api/gmail/oauth/callback"
    return "http://localhost:8000/api/gmail/oauth/callback"


def frontend_public_url() -> str:
    return _env("FRONTEND_PUBLIC_URL", settings.frontend_public_url).rstrip("/")


def has_google_oauth_config() -> bool:
    return bool(gmail_client_id() and gmail_client_secret() and gmail_redirect_uri())


def token_encryption_configured() -> bool:
    return bool(_env("GMAIL_TOKEN_ENCRYPTION_KEY", settings.gmail_token_encryption_key or ""))


def _fernet() -> Fernet:
    secret = _env("GMAIL_TOKEN_ENCRYPTION_KEY", settings.gmail_token_encryption_key or "")
    if not secret:
        raise RuntimeError("GMAIL_TOKEN_ENCRYPTION_KEY is not configured")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_token(token: str) -> str:
    if not token:
        return ""
    return _fernet().encrypt(token.encode("utf-8")).decode("utf-8")


def decrypt_token(value: str) -> str:
    if not value:
        return ""
    return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")


def new_oauth_state() -> tuple[str, str, datetime]:
    state = secrets.token_urlsafe(32)
    return state, hash_oauth_state(state), datetime.utcnow() + timedelta(minutes=STATE_TTL_MINUTES)


def hash_oauth_state(state: str) -> str:
    return hashlib.sha256(state.encode("utf-8")).hexdigest()


def state_matches(raw_state: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_oauth_state(raw_state), stored_hash or "")
