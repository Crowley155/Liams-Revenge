"""
Profiles API — read completed research profiles.

GET /api/profiles         — list all researched profiles
GET /api/profiles/{id}    — get a single profile with battle card
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models import Person
from app.api._store import profiles

router = APIRouter(tags=["profiles"])


@router.get("/profiles", response_model=list[Person])
async def list_profiles():
    """Return all completed profiles."""
    return list(profiles.values())


@router.get("/profiles/{person_id}", response_model=Person)
async def get_profile(person_id: str):
    """Return a single profile by ID."""
    person = profiles.get(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Profile not found")
    return person
