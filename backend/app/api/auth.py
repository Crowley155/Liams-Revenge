"""
Auth API.

Interactive sign-in is handled by Clerk in the React app. The backend exposes
session introspection and keeps the old login path as an explicit 410 so stale
clients fail loudly instead of minting local JWTs.
"""
from __future__ import annotations

import logging
import os
import uuid

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.db import _connect

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


@router.post("/login")
async def login(_body: LoginRequest):
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Local JWT login has been replaced by Clerk. Use the Clerk session token.",
    )


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


def seed_admin_user() -> None:
    """Preserve the legacy admin seed row for local migration continuity."""
    email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "").strip()

    if not email or not password:
        logger.info("ADMIN_EMAIL / ADMIN_PASSWORD not set - skipping admin seed")
        return

    conn = _connect()
    try:
        existing = conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            logger.info("Admin user %s already exists", email)
            return

        user_id = str(uuid.uuid4())[:8]
        conn.execute(
            "INSERT INTO users (id, email, password, role, data) VALUES (?, ?, ?, ?, ?)",
            (user_id, email, _hash_password(password), "admin", "{}"),
        )
        conn.commit()
        logger.info("Admin user seeded: %s (id=%s)", email, user_id)
    finally:
        conn.close()
