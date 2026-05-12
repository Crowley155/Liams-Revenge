"""
Auth dependencies for FastAPI route protection.

Clerk owns identity. USDWatch resolves Clerk users/orgs into local workspaces
and forwards the workspace id through every protected route.
"""
from __future__ import annotations

import os
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError

from app.services.workspaces import resolve_user_workspace

bearer_scheme = HTTPBearer(auto_error=False)


def _env(key: str, default: str = "") -> str:
    value = os.getenv(key, default)
    return value or default


@lru_cache(maxsize=4)
def _jwk_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url)


def _extract_email(claims: dict) -> str:
    for key in ("email", "email_address", "primary_email_address"):
        if claims.get(key):
            return str(claims[key])
    return ""


def _extract_org_id(claims: dict) -> str:
    if claims.get("org_id"):
        return str(claims["org_id"])
    org = claims.get("o")
    if isinstance(org, dict) and org.get("id"):
        return str(org["id"])
    return ""


def verify_clerk_jwt(token: str) -> dict:
    """Validate a Clerk JWT and return claims.

    Tests and local development can opt into a deterministic dev token with
    ALLOW_DEV_AUTH=true and Authorization: Bearer dev:user@example.com.
    """
    if token.startswith("dev:") and _env("ALLOW_DEV_AUTH", "false").lower() == "true":
        email = token.removeprefix("dev:").strip() or "dev@example.com"
        return {"sub": f"dev_{email}", "email": email}

    issuer = _env("CLERK_ISSUER") or _env("CLERK_JWT_ISSUER")
    jwks_url = _env("CLERK_JWKS_URL") or (f"{issuer.rstrip('/')}/.well-known/jwks.json" if issuer else "")
    if not jwks_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CLERK_ISSUER or CLERK_JWKS_URL must be configured",
        )

    try:
        signing_key = _jwk_client(jwks_url).get_signing_key_from_jwt(token)
        decode_kwargs = {
            "algorithms": ["RS256"],
            "options": {"verify_aud": False},
        }
        if issuer:
            decode_kwargs["issuer"] = issuer.rstrip("/")
        return jwt.decode(token, signing_key.key, **decode_kwargs)
    except PyJWKClientConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Clerk signing keys are temporarily unavailable",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except PyJWKClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clerk token invalid",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clerk token expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clerk token invalid",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = verify_clerk_jwt(credentials.credentials)
    clerk_user_id = claims.get("sub")
    if not clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clerk token missing subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return resolve_user_workspace(
        clerk_user_id=str(clerk_user_id),
        email=_extract_email(claims),
        clerk_org_id=_extract_org_id(claims),
        clerk_org_name=str(claims.get("org_name") or claims.get("org_slug") or ""),
    )


def can_access_workspace(user: dict, workspace_id: str) -> bool:
    return workspace_id == user.get("workspace_id")


def scoped_items(items: list, user: dict) -> list:
    return [item for item in items if getattr(item, "workspace_id", "") == user.get("workspace_id")]
