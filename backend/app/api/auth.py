"""
Auth API — login endpoint.

POST /api/auth/login  — email + password → JWT access token
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.db import _connect
from app.api.deps import JWT_SECRET, JWT_ALGORITHM

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "24"))


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    if not JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT_SECRET not configured",
        )

    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, email, password, role FROM users WHERE email = ?",
            (body.email.lower().strip(),),
        ).fetchone()
    finally:
        conn.close()

    if not row or not _verify_password(body.password, row["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = _create_access_token({
        "sub": row["id"],
        "email": row["email"],
        "role": row["role"],
    })

    logger.info("Login successful for %s (role=%s)", row["email"], row["role"])
    return TokenResponse(access_token=token)


# ---------------------------------------------------------------------------
# Admin seeding — called once at startup from main.py
# ---------------------------------------------------------------------------

def seed_admin_user() -> None:
    """Create the admin user from env vars if it doesn't already exist."""
    email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "").strip()

    if not email or not password:
        logger.info("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed")
        return

    conn = _connect()
    try:
        existing = conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            logger.info("Admin user %s already exists", email)
            return

        import uuid
        user_id = str(uuid.uuid4())[:8]
        hashed = _hash_password(password)
        conn.execute(
            "INSERT INTO users (id, email, password, role) VALUES (?, ?, ?, ?)",
            (user_id, email, hashed, "admin"),
        )
        conn.commit()
        logger.info("Admin user seeded: %s (id=%s)", email, user_id)
    finally:
        conn.close()
