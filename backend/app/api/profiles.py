"""
Profiles API — read, reset, and delete research profiles.

GET    /api/profiles                        — list all profiles
GET    /api/profiles/{id}                   — single profile
DELETE /api/profiles/{id}/research          — clear research data only
DELETE /api/profiles/{id}                   — full delete
"""
from __future__ import annotations

from app.time import utc_now

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from app.models import Person, PersonSource
from app.api._store import cases, profiles
from app.api.deps import can_access_workspace, get_current_user
from app.services.case_access import require_case_access, visible_cases_for_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["profiles"])


@router.get("/profiles", response_model=list[Person])
async def list_profiles(case_id: Optional[str] = "", user: dict = Depends(get_current_user)):
    """Return all completed profiles."""
    if case_id:
        case = require_case_access(user, cases.get(case_id), "view")
        items = [item for item in profiles.values() if item.case_id == case.id and item.workspace_id == case.workspace_id]
    else:
        visible_case_ids = {case.id for case in visible_cases_for_user(user)}
        items = [item for item in profiles.values() if item.case_id in visible_case_ids or can_access_workspace(user, item.workspace_id)]
    if case_id:
        items = [item for item in items if item.case_id == case_id]
    return items


@router.get("/profiles/{person_id}", response_model=Person)
async def get_profile(person_id: str, user: dict = Depends(get_current_user)):
    """Return a single profile by ID."""
    person = profiles.get(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Profile not found")
    case = cases.get(person.case_id)
    if case:
        require_case_access(user, case, "view")
    elif not can_access_workspace(user, person.workspace_id):
        raise HTTPException(status_code=404, detail="Profile not found")
    return person


@router.delete("/profiles/{person_id}/research", response_model=Person)
async def reset_research(person_id: str, user: dict = Depends(get_current_user)):
    """
    Nuke ALL pipeline/enrichment-derived data. Preserves only seed and
    manually-entered fields: name, role, org, location, curated_bio,
    curated_quotes, entity_ids, contact (from evidence mining), and
    negative_anchors.
    """
    person = profiles.get(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Profile not found")
    case = cases.get(person.case_id)
    if case:
        require_case_access(user, case, "manage_records")
    elif not can_access_workspace(user, person.workspace_id):
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
    person.updated_at = utc_now()
    profiles[person.id] = person

    logger.info("Full reset for %s (%s) — all research + enrichment cleared", person.name, person.id)
    return person


@router.delete("/profiles/{person_id}")
async def delete_profile(person_id: str, user: dict = Depends(get_current_user)):
    """
    Fully delete a person from the store.
    Re-run /api/seed to recreate seeded actors.
    """
    person = profiles.get(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Profile not found")
    case = cases.get(person.case_id)
    if case:
        require_case_access(user, case, "manage_records")
    elif not can_access_workspace(user, person.workspace_id):
        raise HTTPException(status_code=404, detail="Profile not found")

    profiles.pop(person_id, None)
    logger.info("Profile DELETED: %s (%s)", person.name, person_id)
    return {"status": "deleted", "person_id": person_id, "name": person.name}
