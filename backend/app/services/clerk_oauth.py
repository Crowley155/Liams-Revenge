from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import quote

import httpx

from app.config import settings


CLERK_API_BASE = "https://api.clerk.com/v1"
CLERK_GOOGLE_PROVIDER = "google"
INVISIBLE_COPY_CHARS_RE = re.compile(r"[\ufeff\u200b-\u200d\u2060]")


class ClerkOAuthError(RuntimeError):
    pass


class ClerkOAuthNotConfigured(ClerkOAuthError):
    pass


class ClerkOAuthConsentRequired(ClerkOAuthError):
    pass


def _env(key: str, default: str = "") -> str:
    value = os.getenv(key)
    return value if value else default


def _clean_secret(value: str) -> str:
    return INVISIBLE_COPY_CHARS_RE.sub("", value or "").strip()


def clerk_secret_key() -> str:
    return _clean_secret(_env("CLERK_SECRET_KEY", settings.clerk_secret_key or ""))


def clerk_oauth_configured() -> bool:
    return bool(clerk_secret_key())


def _token_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        return [item for item in payload["data"] if isinstance(item, dict)]
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    return []


def fetch_clerk_google_oauth_token(clerk_user_id: str, *, required_scope: str) -> dict[str, Any]:
    if not clerk_user_id:
        raise ClerkOAuthConsentRequired("Sign in again before connecting Gmail.")
    secret = clerk_secret_key()
    if not secret:
        raise ClerkOAuthNotConfigured("Gmail import needs CLERK_SECRET_KEY on the backend.")

    user_id = quote(clerk_user_id, safe="")
    provider = quote(CLERK_GOOGLE_PROVIDER, safe="")
    url = f"{CLERK_API_BASE}/users/{user_id}/oauth_access_tokens/{provider}"
    try:
        with httpx.Client(timeout=20) as client:
            response = client.get(url, headers={
                "Authorization": f"Bearer {secret}",
                "Accept": "application/json",
            })
    except httpx.HTTPError as exc:
        raise ClerkOAuthError("Could not reach Clerk to check Gmail access.") from exc

    if response.status_code == 404:
        raise ClerkOAuthConsentRequired("Grant read-only Gmail access from your USDWatch account before importing messages.")
    if response.status_code in {401, 403}:
        raise ClerkOAuthError("Clerk rejected the backend key used for Gmail access.")
    if response.status_code >= 400:
        raise ClerkOAuthError(f"Clerk Gmail token lookup failed: {response.status_code}")

    tokens = _token_items(response.json())
    for token_info in tokens:
        token = str(token_info.get("token") or "")
        scopes = [str(scope) for scope in token_info.get("scopes") or []]
        if token and required_scope in scopes:
            return {
                "token": token,
                "scopes": scopes,
                "external_account_id": str(token_info.get("externalAccountId") or token_info.get("external_account_id") or ""),
                "expires_at": token_info.get("expiresAt") or token_info.get("expires_at"),
            }

    raise ClerkOAuthConsentRequired("Grant read-only Gmail access from your USDWatch account before importing messages.")
