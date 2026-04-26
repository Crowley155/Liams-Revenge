from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user

router = APIRouter(prefix="/agent-os", tags=["agent-os"])


@router.get("/status")
async def agent_os_status(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "enabled": os.getenv("ENABLE_AGENT_OS", "false").lower() == "true",
        "protected": True,
        "runtime": "agno",
    }
