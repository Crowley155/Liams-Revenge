"""
Enrichment API — trigger and monitor identity enrichment jobs.

POST /api/enrich/{person_id}  — kick off enrichment pipeline for a person
GET  /api/enrich/{job_id}     — check enrichment job status (uses same job endpoint)
PUT  /api/profiles/{person_id}/identity — manually update identity fields
"""
from __future__ import annotations

from app.time import utc_now

import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.models import (
    Person, ResearchJob, JobStatus,
    Address, SocialProfile, Employment, Education,
)
from app.api._store import cases, profiles, jobs
from app.api.deps import can_access_workspace, get_current_user
from app.services.case_access import require_case_access

logger = logging.getLogger(__name__)
router = APIRouter(tags=["enrichment"])


def _require_person_access(person: Person | None, user: dict, action: str = "view") -> Person:
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    case = cases.get(person.case_id)
    if case:
        require_case_access(user, case, action)
    elif not can_access_workspace(user, person.workspace_id):
        raise HTTPException(status_code=404, detail="Person not found")
    return person


class IdentityUpdate(BaseModel):
    """Manual identity field updates from the React UI."""
    city: Optional[str] = None
    county: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    address: Optional[str] = None
    addresses: Optional[list[Address]] = None
    social_profiles: Optional[list[SocialProfile]] = None
    employer_history: Optional[list[Employment]] = None
    education: Optional[list[Education]] = None
    known_associates: Optional[list[str]] = None
    identity_confidence: Optional[float] = None


def _run_enrichment(person_id: str, job: ResearchJob):
    """Background task for enrichment pipeline."""
    try:
        person = profiles.get(person_id)
        if not person:
            raise ValueError(f"Person {person_id} not found")

        from app.pipeline.enrichment import run_enrichment_pipeline
        run_enrichment_pipeline(person, job)

        job.status = JobStatus.COMPLETE
        job.completed_at = utc_now()
        jobs[job.id] = job

    except Exception as e:
        logger.exception("Enrichment failed for %s", person_id)
        job.status = JobStatus.FAILED
        job.error = str(e)
        job.completed_at = utc_now()
        jobs[job.id] = job
    finally:
        try:
            from langfuse import get_client
            get_client().flush()
        except Exception:
            pass


@router.post("/enrich/{person_id}", response_model=ResearchJob)
async def start_enrichment(person_id: str, bg: BackgroundTasks, user: dict = Depends(get_current_user)):
    """Kick off identity enrichment for a person. Returns a job to poll."""
    person = profiles.get(person_id)
    person = _require_person_access(person, user, "manage_records")

    job_id = str(uuid.uuid4())[:8]
    job = ResearchJob(id=job_id, workspace_id=person.workspace_id, case_id=person.case_id, person_id=person_id)
    jobs[job_id] = job

    bg.add_task(_run_enrichment, person_id, job)

    logger.info("Enrichment job %s started for %s (%s)", job_id, person.name, person_id)
    return job


@router.put("/profiles/{person_id}/identity", response_model=Person)
async def update_identity(person_id: str, update: IdentityUpdate, user: dict = Depends(get_current_user)):
    """Manually update identity enrichment fields for a person."""
    person = profiles.get(person_id)
    person = _require_person_access(person, user, "manage_records")

    if update.city is not None:
        person.city = update.city
    if update.county is not None:
        person.county = update.county
    if update.date_of_birth is not None:
        person.date_of_birth = update.date_of_birth
    if update.gender is not None:
        person.gender = update.gender
    if update.email is not None or update.phone is not None or update.linkedin_url is not None or update.address is not None:
        from app.models import ContactInfo
        if not person.contact:
            person.contact = ContactInfo()
        if update.email is not None:
            person.contact.email = update.email
        if update.phone is not None:
            person.contact.phone = update.phone
        if update.address is not None:
            person.contact.address = update.address
        if update.linkedin_url is not None:
            person.contact.linkedin_url = update.linkedin_url
            existing_urls = {sp.url for sp in person.social_profiles}
            if update.linkedin_url and update.linkedin_url not in existing_urls:
                from app.models import SocialProfile
                person.social_profiles.append(SocialProfile(
                    platform="linkedin", url=update.linkedin_url,
                    username=update.linkedin_url.rstrip("/").split("/")[-1],
                    confidence=1.0, source="manual", verified=True,
                ))
    if update.addresses is not None:
        person.addresses = update.addresses
    if update.social_profiles is not None:
        person.social_profiles = update.social_profiles
    if update.employer_history is not None:
        person.employer_history = update.employer_history
    if update.education is not None:
        person.education = update.education
    if update.known_associates is not None:
        person.known_associates = update.known_associates
    if update.identity_confidence is not None:
        person.identity_confidence = min(1.0, max(0.0, update.identity_confidence))

    person.updated_at = utc_now()
    profiles[person.id] = person

    logger.info("Identity updated manually for %s (%s)", person.name, person.id)
    return person


@router.post("/clay-callback/{person_id}")
async def clay_callback(person_id: str, request: Request, user: dict = Depends(get_current_user)):
    """
    Receives enriched data from Clay's outbound HTTP API column.
    Clay POSTs the full enriched row here after its enrichment pipeline completes.
    """
    from app.pipeline.enrichment.clay_worker import parse_clay_response

    person = profiles.get(person_id)
    try:
        person = _require_person_access(person, user, "manage_records")
    except HTTPException:
        logger.warning("Clay callback for unknown person_id: %s", person_id)
        raise

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    logger.info("Clay callback received for %s (%s) — %d keys", person.name, person_id, len(body))

    parsed = parse_clay_response(body)

    # Merge social profiles (dedupe by platform+url)
    existing_urls = {sp.url for sp in person.social_profiles}
    for sp in parsed.get("social_profiles", []):
        if sp.url not in existing_urls:
            person.social_profiles.append(sp)
            existing_urls.add(sp.url)

    # Merge addresses (dedupe by city+state)
    existing_addrs = {(a.city.lower(), a.state.lower()) for a in person.addresses}
    for addr in parsed.get("addresses", []):
        key = (addr.city.lower(), addr.state.lower())
        if key not in existing_addrs:
            person.addresses.append(addr)
            existing_addrs.add(key)

    # Merge employer history (dedupe by org+title)
    existing_jobs = {(e.organization.lower(), e.title.lower()) for e in person.employer_history}
    for emp in parsed.get("employer_history", []):
        key = (emp.organization.lower(), emp.title.lower())
        if key not in existing_jobs:
            person.employer_history.append(emp)
            existing_jobs.add(key)

    # Merge education (dedupe by institution)
    existing_edu = {e.institution.lower() for e in person.education}
    for edu in parsed.get("education", []):
        if edu.institution.lower() not in existing_edu:
            person.education.append(edu)
            existing_edu.add(edu.institution.lower())

    # Scalar fields — only overwrite if we don't have a value yet
    if parsed.get("date_of_birth") and not person.date_of_birth:
        person.date_of_birth = parsed["date_of_birth"]
    if parsed.get("gender") and not person.gender:
        person.gender = parsed["gender"]
    if parsed.get("email"):
        from app.models import ContactInfo
        if not person.contact:
            person.contact = ContactInfo()
        if not person.contact.email:
            person.contact.email = parsed["email"]
    if parsed.get("photo_url") and not person.photo_url:
        person.photo_url = parsed["photo_url"]

    if "clay" not in person.enrichment_sources:
        person.enrichment_sources.append("clay")
    person.enriched_at = utc_now()
    person.updated_at = utc_now()

    # Bump confidence if Clay returned meaningful data
    clay_signals = (
        len(parsed.get("social_profiles", []))
        + len(parsed.get("employer_history", []))
        + len(parsed.get("education", []))
    )
    if clay_signals > 0 and person.identity_confidence < 0.7:
        person.identity_confidence = min(0.7, person.identity_confidence + 0.15)

    profiles[person.id] = person

    # Store Clay enrichment data in Qdrant for future cross-person queries
    try:
        from app.services.qdrant_client import store_enrichment_doc

        text_parts = []
        for sp in parsed.get("social_profiles", []):
            text_parts.append(f"{sp.platform}: {sp.url}")
        for emp in parsed.get("employer_history", []):
            text_parts.append(f"Employment: {emp.title} at {emp.organization}")
        for edu in parsed.get("education", []):
            text_parts.append(f"Education: {edu.degree} at {edu.institution}")
        for addr in parsed.get("addresses", []):
            text_parts.append(f"Location: {addr.city}, {addr.state}")
        if parsed.get("date_of_birth"):
            text_parts.append(f"DOB: {parsed['date_of_birth']}")
        if parsed.get("email"):
            text_parts.append(f"Email: {parsed['email']}")

        if text_parts:
            enrichment_text = f"{person.name} ({person.organization}). " + " | ".join(text_parts)
            store_enrichment_doc(
                person_id=person_id,
                source="clay",
                text=enrichment_text,
                metadata={
                    "type": "enrichment_callback",
                    "date": utc_now().isoformat(),
                },
            )
    except Exception as e:
        logger.warning("Failed to store Clay callback in Qdrant (non-fatal): %s", e)

    logger.info(
        "Clay callback merged for %s: +%d socials, +%d jobs, +%d edu, confidence=%.2f",
        person.name,
        len(parsed.get("social_profiles", [])),
        len(parsed.get("employer_history", [])),
        len(parsed.get("education", [])),
        person.identity_confidence,
    )

    return {"status": "ok", "person_id": person_id}


class SocialProfileAction(BaseModel):
    """Body for confirm/dismiss social profile endpoints."""
    url: str


@router.post("/profiles/{person_id}/social-profiles/confirm", response_model=Person)
async def confirm_social_profile(person_id: str, body: SocialProfileAction, bg: BackgroundTasks, user: dict = Depends(get_current_user)):
    """
    Confirm a discovered social profile. Sets status to 'confirmed', then
    scrapes + LLM-extracts data from that profile and merges into the person.
    """
    person = profiles.get(person_id)
    person = _require_person_access(person, user, "manage_records")

    sp = next((s for s in person.social_profiles if s.url == body.url), None)
    if not sp:
        raise HTTPException(status_code=404, detail="Social profile not found on this person")

    sp.status = "confirmed"
    sp.verified = True
    person.updated_at = utc_now()
    profiles[person.id] = person

    bg.add_task(_scrape_confirmed_profile, person_id, body.url)

    logger.info("Social profile CONFIRMED for %s: %s", person.name, body.url)
    return person


def _scrape_confirmed_profile(person_id: str, profile_url: str):
    """Background task: scrape a single confirmed profile and merge results."""
    try:
        person = profiles.get(person_id)
        if not person:
            return

        sp = next((s for s in person.social_profiles if s.url == profile_url), None)
        if not sp:
            return

        from app.pipeline.enrichment.social_scraper import scrape_single_profile
        result = scrape_single_profile(person, sp)

        existing_orgs = {e.organization.lower() for e in person.employer_history}
        for emp in result.get("employer_history", []):
            if emp.organization.lower() not in existing_orgs:
                person.employer_history.append(emp)
                existing_orgs.add(emp.organization.lower())

        existing_inst = {e.institution.lower() for e in person.education}
        for edu in result.get("education", []):
            if edu.institution.lower() not in existing_inst:
                person.education.append(edu)
                existing_inst.add(edu.institution.lower())

        existing_addrs = {(a.city.lower(), a.state.lower()) for a in person.addresses}
        for addr in result.get("addresses", []):
            key = (addr.city.lower(), addr.state.lower())
            if key not in existing_addrs:
                person.addresses.append(addr)
                existing_addrs.add(key)

        if result.get("bio_snippet") and not person.curated_bio:
            person.curated_bio = result["bio_snippet"]

        existing_intel = {item.text.strip().lower() for item in person.profile_intel}
        for item in result.get("profile_intel", []):
            txt = item.text if hasattr(item, "text") else str(item)
            if txt.strip().lower() not in existing_intel:
                from app.models import ProfileIntelItem
                person.profile_intel.append(
                    ProfileIntelItem(text=txt.strip(), source_url=profile_url)
                )
                existing_intel.add(txt.strip().lower())

        person.updated_at = utc_now()
        profiles[person.id] = person

        logger.info(
            "Scrape complete for confirmed profile %s on %s: +%d jobs, +%d edu, +%d intel",
            profile_url, person.name,
            len(result.get("employer_history", [])),
            len(result.get("education", [])),
            len(result.get("profile_intel", [])),
        )
    except Exception as e:
        logger.exception("Failed to scrape confirmed profile %s: %s", profile_url, e)


@router.post("/profiles/{person_id}/social-profiles/dismiss", response_model=Person)
async def dismiss_social_profile(person_id: str, body: SocialProfileAction, user: dict = Depends(get_current_user)):
    """
    Dismiss a social profile. Removes the profile and cascade-deletes any
    data (employment, education, addresses, intel) sourced from its URL.
    """
    person = profiles.get(person_id)
    person = _require_person_access(person, user, "manage_records")

    sp = next((s for s in person.social_profiles if s.url == body.url), None)
    if not sp:
        raise HTTPException(status_code=404, detail="Social profile not found on this person")

    person.social_profiles = [s for s in person.social_profiles if s.url != body.url]

    person.employer_history = [
        e for e in person.employer_history if e.source_url != body.url
    ]
    person.education = [
        e for e in person.education if e.source_url != body.url
    ]
    person.addresses = [
        a for a in person.addresses if a.source_url != body.url
    ]
    person.profile_intel = [
        item for item in person.profile_intel if item.source_url != body.url
    ]

    person.updated_at = utc_now()
    profiles[person.id] = person

    logger.info("Social profile DISMISSED for %s: %s (cascade delete done)", person.name, body.url)
    return person
