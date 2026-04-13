"""
Entities API — CRUD for organizations and member discovery.

GET  /api/entities                — list all entities
GET  /api/entities/{id}           — single entity with member list
POST /api/entities                — create entity
POST /api/entities/{id}/discover  — discover members via pipeline (prompt-guided)
GET  /api/entities/{id}/members   — accepted Person records linked to entity
POST /api/entities/{id}/members/accept  — accept a pending member
POST /api/entities/{id}/members/reject  — reject a pending member
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.models import (
    Entity, EntityCreate, EntityMember, Person, PersonSource,
    ResearchJob, JobStatus, SocialProfile, Fact, ProfileIntelItem,
)
from app.api._store import entities, profiles, jobs

logger = logging.getLogger(__name__)
router = APIRouter(tags=["entities"])


@router.get("/entities", response_model=list[Entity])
async def list_entities():
    return list(entities.values())


@router.get("/entities/{entity_id}", response_model=Entity)
async def get_entity(entity_id: str):
    ent = entities.get(entity_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")
    return ent


@router.post("/entities", response_model=Entity)
async def create_entity(req: EntityCreate):
    ent = Entity(
        id=str(uuid.uuid4())[:8],
        name=req.name,
        type=req.type,
        state=req.state,
        website=req.website,
        description=req.description,
    )
    entities[ent.id] = ent
    logger.info("Created entity %s: %s", ent.id, ent.name)
    return ent


@router.get("/entities/{entity_id}/members", response_model=list[Person])
async def get_entity_members(entity_id: str):
    ent = entities.get(entity_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")
    accepted_ids = {m.person_id for m in ent.members if m.status == "accepted" and m.person_id}
    return [p for p in profiles.values() if p.id in accepted_ids]


def _run_discovery(entity_id: str, job: ResearchJob, prompt: str = ""):
    """Background task: discover members for an entity. Stores as pending."""
    try:
        from app.pipeline.discoverer import discover_entity_members

        ent = entities.get(entity_id)
        if not ent:
            raise ValueError(f"Entity {entity_id} not found")

        job.status = JobStatus.SEARCHING
        job.started_at = datetime.utcnow()
        jobs[job.id] = job

        discovered = discover_entity_members(ent, prompt=prompt)
        logger.info("Discovered %d candidates for %s", len(discovered), ent.name)

        active_names = set()
        rejected_by_name: dict[str, int] = {}
        for i, m in enumerate(ent.members):
            norm = _normalize_name(m.discovered_name or "")
            if m.status == "rejected":
                if norm:
                    rejected_by_name[norm] = i
            else:
                if norm:
                    active_names.add(norm)
                if m.person_id:
                    p = profiles.get(m.person_id)
                    if p:
                        active_names.add(_normalize_name(p.name))

        added = 0
        for member_info in discovered:
            name = member_info.get("name", "").strip()
            role = member_info.get("role") or "Member"
            preview = member_info.get("preview_data")
            if not name:
                continue

            norm = _normalize_name(name)
            if norm in active_names:
                logger.info("  Skipping %s — already known on entity", name)
                continue

            if norm in rejected_by_name:
                idx = rejected_by_name.pop(norm)
                ent.members[idx].status = "pending"
                ent.members[idx].role = role
                ent.members[idx].title = role
                ent.members[idx].preview_data = preview
                active_names.add(norm)
                added += 1
                logger.info("  Re-presenting %s — previously rejected, updated with fresh data", name)
                continue

            active_names.add(norm)

            existing_person = _find_person_by_name_org(name, ent.name)
            if existing_person:
                if entity_id not in existing_person.entity_ids:
                    existing_person.entity_ids.append(entity_id)
                    profiles[existing_person.id] = existing_person
                ent.members.append(EntityMember(
                    person_id=existing_person.id,
                    role=role, title=role,
                    status="accepted",
                    discovered_name=name,
                    preview_data=preview,
                ))
                logger.info("  Auto-accepted %s — matched existing person %s", name, existing_person.id)
            else:
                ent.members.append(EntityMember(
                    person_id="",
                    role=role, title=role,
                    status="pending",
                    discovered_name=name,
                    preview_data=preview,
                ))
                added += 1
                logger.info("  Pending: %s (%s)", name, role)

        ent.updated_at = datetime.utcnow()
        entities[entity_id] = ent

        job.status = JobStatus.COMPLETE
        job.completed_at = datetime.utcnow()
        job.facts_found = added
        jobs[job.id] = job

        logger.info("Discovery complete: %d pending candidates for %s", added, ent.name)

    except Exception as e:
        logger.exception("Discovery failed for entity %s", entity_id)
        job.status = JobStatus.FAILED
        job.error = str(e)
        job.completed_at = datetime.utcnow()
        jobs[job.id] = job
    finally:
        try:
            from langfuse import get_client
            get_client().flush()
        except Exception:
            pass


_NAME_PREFIXES = re.compile(
    r"^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?|rev\.?|hon\.?|judge|sen\.?|rep\.?)\s+",
    re.IGNORECASE,
)
_NAME_SUFFIXES = re.compile(
    r",?\s+(jr\.?|sr\.?|ii|iii|iv|esq\.?|ph\.?d\.?|m\.?d\.?|ed\.?d\.?)$",
    re.IGNORECASE,
)


def _normalize_name(name: str) -> str:
    """Normalize a name for dedup: lowercase, strip prefixes/suffixes/middle initials."""
    n = name.lower().strip()
    n = _NAME_PREFIXES.sub("", n)
    n = _NAME_SUFFIXES.sub("", n)
    parts = n.split()
    parts = [p for p in parts if len(p) > 1 or p == parts[0] or p == parts[-1]]
    return " ".join(parts).strip()


def _find_person_by_name_org(name: str, org: str) -> Person | None:
    """Match by normalized name + organization. Falls back to name-only if unambiguous."""
    norm_name = _normalize_name(name)
    org_lower = org.lower().strip()

    for p in profiles.values():
        if _normalize_name(p.name) == norm_name and p.organization.lower().strip() == org_lower:
            return p

    name_only_matches = [
        p for p in profiles.values()
        if _normalize_name(p.name) == norm_name
    ]
    if len(name_only_matches) == 1:
        return name_only_matches[0]

    return None


class DiscoverRequest(BaseModel):
    prompt: str


class MemberAction(BaseModel):
    discovered_name: str


@router.post("/entities/{entity_id}/discover", response_model=ResearchJob)
async def discover_members(entity_id: str, body: DiscoverRequest, bg: BackgroundTasks):
    ent = entities.get(entity_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")

    if not body.prompt.strip():
        raise HTTPException(status_code=400, detail="Discovery prompt is required")

    job_id = str(uuid.uuid4())[:8]
    job = ResearchJob(id=job_id, person_id=entity_id)
    jobs[job_id] = job

    bg.add_task(_run_discovery, entity_id, job, body.prompt.strip())

    logger.info("Discovery job %s started for entity %s (%s) — prompt: %s", job_id, entity_id, ent.name, body.prompt)
    return job


@router.post("/entities/{entity_id}/members/accept", response_model=Entity)
async def accept_member(entity_id: str, body: MemberAction):
    """Accept a pending discovered member — creates or links a Person record."""
    ent = entities.get(entity_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")

    member = next(
        (m for m in ent.members
         if m.status == "pending" and m.discovered_name.lower().strip() == body.discovered_name.lower().strip()),
        None,
    )
    if not member:
        raise HTTPException(status_code=404, detail="Pending member not found")

    existing = _find_person_by_name_org(member.discovered_name, ent.name)
    if existing:
        person = existing
        if entity_id not in person.entity_ids:
            person.entity_ids.append(entity_id)
        _merge_preview_data(person, member.preview_data)
        profiles[person.id] = person
    else:
        person = Person(
            id=str(uuid.uuid4())[:8],
            name=member.discovered_name,
            role=member.role,
            organization=ent.name,
            state=ent.state,
            source=PersonSource.PIPELINE,
            entity_ids=[entity_id],
        )
        _merge_preview_data(person, member.preview_data)
        profiles[person.id] = person

    member.person_id = person.id
    member.status = "accepted"

    ent.updated_at = datetime.utcnow()
    entities[entity_id] = ent

    logger.info("Member ACCEPTED for %s: %s -> person %s", ent.name, member.discovered_name, person.id)
    return ent


def _merge_preview_data(person: Person, preview: dict | None) -> None:
    """Carry forward discovery preview_data onto a Person record.
    For existing persons, only fills in fields that are currently empty."""
    if not preview:
        return

    # Social profiles — add any we don't already have by URL
    existing_urls = {sp.url for sp in person.social_profiles}
    for sp in preview.get("social_profiles", []):
        url = sp.get("url", "")
        if url and url not in existing_urls:
            existing_urls.add(url)
            person.social_profiles.append(SocialProfile(
                platform=sp.get("platform", ""),
                url=url,
                username=sp.get("username", ""),
                confidence=sp.get("confidence", 0.0),
                source=sp.get("source", "discovery"),
                status="pending",
            ))

    # Knowledge graph thumbnail → photo
    kg = preview.get("knowledge_graph", {})
    if not person.photo_url and kg.get("thumbnail"):
        person.photo_url = kg["thumbnail"]

    # Bio snippet → curated_bio (only if empty)
    if not person.curated_bio and preview.get("bio_snippet"):
        person.curated_bio = preview["bio_snippet"]

    # Search results → profile_intel (only if empty)
    if not person.profile_intel:
        for sr in preview.get("search_results", [])[:5]:
            snippet = sr.get("snippet", "").strip()
            if snippet:
                person.profile_intel.append(
                    ProfileIntelItem(text=snippet, source_url=sr.get("url", ""))
                )

    # Source URLs → enrichment_sources
    existing_sources = set(person.enrichment_sources)
    for url in preview.get("source_urls", []):
        if url not in existing_sources:
            existing_sources.add(url)
            person.enrichment_sources.append(url)

    person.updated_at = datetime.utcnow()


@router.post("/entities/{entity_id}/members/reject", response_model=Entity)
async def reject_member(entity_id: str, body: MemberAction):
    """Reject a pending discovered member — keeps the record to prevent re-suggestion."""
    ent = entities.get(entity_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")

    member = next(
        (m for m in ent.members
         if m.status == "pending" and m.discovered_name.lower().strip() == body.discovered_name.lower().strip()),
        None,
    )
    if not member:
        raise HTTPException(status_code=404, detail="Pending member not found")

    member.status = "rejected"

    ent.updated_at = datetime.utcnow()
    entities[entity_id] = ent

    logger.info("Member REJECTED for %s: %s", ent.name, member.discovered_name)
    return ent
