"""
Profiles API — read, reset, and delete research profiles.

GET    /api/profiles                        — list all profiles
GET    /api/profiles/{id}                   — single profile
DELETE /api/profiles/{id}/research          — clear research data only
DELETE /api/profiles/{id}                   — full delete
"""
from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.models import Person, PersonSource
from app.api._store import profiles
from app.api.deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["profiles"])


@router.get("/profiles", response_model=list[Person])
async def list_profiles(_user: dict = Depends(get_current_user)):
    """Return all completed profiles."""
    return list(profiles.values())


@router.get("/profiles/{person_id}", response_model=Person)
async def get_profile(person_id: str, _user: dict = Depends(get_current_user)):
    """Return a single profile by ID."""
    person = profiles.get(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Profile not found")
    return person


@router.delete("/profiles/{person_id}/research", response_model=Person)
async def reset_research(person_id: str, _user: dict = Depends(get_current_user)):
    """
    Nuke ALL pipeline/enrichment-derived data. Preserves only seed and
    manually-entered fields: name, role, org, location, curated_bio,
    curated_quotes, entity_ids, contact (from evidence mining), and
    negative_anchors.
    """
    person = profiles.get(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Research fields
    person.facts = []
    person.rejected_facts = []
    person.battle_card = None

    # Enrichment fields
    person.social_profiles = []
    person.employer_history = []
    person.education = []
    person.addresses = []
    person.known_associates = []
    person.profile_intel = []
    person.date_of_birth = None
    person.gender = None
    person.identity_confidence = 0.0
    person.enrichment_sources = []
    person.enriched_at = None
    person.photo_url = None

    person.source = PersonSource.MANUAL
    person.updated_at = datetime.utcnow()
    profiles[person.id] = person

    logger.info("Full reset for %s (%s) — all research + enrichment cleared", person.name, person.id)
    return person


@router.delete("/profiles/{person_id}")
async def delete_profile(person_id: str, _user: dict = Depends(get_current_user)):
    """
    Fully delete a person from the store.
    Re-run /api/seed to recreate seeded actors.
    """
    person = profiles.get(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Profile not found")

    profiles.pop(person_id, None)
    logger.info("Profile DELETED: %s (%s)", person.name, person_id)
    return {"status": "deleted", "person_id": person_id, "name": person.name}
