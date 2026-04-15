"""
Entities API — CRUD for organizations, member discovery, and entity research.

GET    /api/entities                          — list all entities
GET    /api/entities/graph                    — all entities + relationships for graph viz
GET    /api/entities/{id}                     — single entity with member list
POST   /api/entities                          — create entity
PATCH  /api/entities/{id}                     — partial update
POST   /api/entities/{id}/research            — kick off entity research pipeline
POST   /api/entities/{id}/discover            — discover members via pipeline (prompt-guided)
GET    /api/entities/{id}/members             — accepted Person records linked to entity
POST   /api/entities/{id}/members/accept      — accept a pending member
POST   /api/entities/{id}/members/reject      — reject a pending member
GET    /api/entities/{id}/facts               — list entity facts (filterable by category)
DELETE /api/entities/{id}/facts/{fact_id}      — remove a fact
POST   /api/entities/{id}/facts/{fact_id}/verify — mark a fact as verified
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel

from app.models import (
    Entity, EntityAlias, EntityCreate, EntityFact, EntityMember,
    EntityRelationship, EntityUpdate, Person, PersonSource,
    ResearchJob, JobStatus, SocialProfile, Fact, ProfileIntelItem,
)
from app.api._store import entities, profiles, jobs
from app.api.deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["entities"])


@router.get("/entities", response_model=list[Entity])
async def list_entities():
    return list(entities.values())


@router.get("/entities/graph")
async def get_entity_graph(_user: dict = Depends(get_current_user)):
    """Return all entities with their relationships for graph visualization."""
    all_ents = list(entities.values())
    nodes = []
    edges = []
    for ent in all_ents:
        nodes.append({
            "id": ent.id,
            "name": ent.name,
            "type": ent.type,
            "state": ent.state,
            "member_count": len([m for m in ent.members if m.status == "accepted"]),
            "fact_count": len(ent.facts),
            "website": ent.website,
        })
        for rel in ent.relationships:
            edges.append({
                "source": ent.id,
                "target": rel.target_entity_id,
                "relationship_type": rel.relationship_type,
                "description": rel.description,
                "verified": rel.verified,
            })
    return {"nodes": nodes, "edges": edges}


@router.get("/entities/{entity_id}", response_model=Entity)
async def get_entity(entity_id: str, _user: dict = Depends(get_current_user)):
    ent = entities.get(entity_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")
    return ent


@router.post("/entities", response_model=Entity)
async def create_entity(req: EntityCreate, _user: dict = Depends(get_current_user)):
    ent = Entity(
        id=str(uuid.uuid4())[:8],
        name=req.name,
        type=req.type,
        state=req.state,
        website=req.website,
        description=req.description,
        aliases=req.aliases,
        meeting_url=req.meeting_url,
    )
    entities[ent.id] = ent
    logger.info("Created entity %s: %s (aliases: %s)", ent.id, ent.name, [a.name for a in ent.aliases])
    return ent


@router.patch("/entities/{entity_id}", response_model=Entity)
async def update_entity(entity_id: str, req: EntityUpdate, _user: dict = Depends(get_current_user)):
    ent = entities.get(entity_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(ent, field, value)

    ent.updated_at = datetime.utcnow()
    entities[entity_id] = ent
    logger.info("Updated entity %s: %s (fields: %s)", entity_id, ent.name, list(update_data.keys()))
    return ent


@router.get("/entities/{entity_id}/facts", response_model=list[EntityFact])
async def list_entity_facts(
    entity_id: str,
    category: Optional[str] = Query(None),
    _user: dict = Depends(get_current_user),
):
    ent = entities.get(entity_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")
    facts = ent.facts
    if category:
        facts = [f for f in facts if f.category == category]
    return facts


@router.delete("/entities/{entity_id}/facts/{fact_id}")
async def delete_entity_fact(entity_id: str, fact_id: str, _user: dict = Depends(get_current_user)):
    ent = entities.get(entity_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")
    original_len = len(ent.facts)
    ent.facts = [f for f in ent.facts if f.id != fact_id]
    if len(ent.facts) == original_len:
        raise HTTPException(status_code=404, detail="Fact not found")
    ent.updated_at = datetime.utcnow()
    entities[entity_id] = ent
    return {"status": "deleted", "fact_id": fact_id}


@router.post("/entities/{entity_id}/facts/{fact_id}/verify", response_model=EntityFact)
async def verify_entity_fact(entity_id: str, fact_id: str, _user: dict = Depends(get_current_user)):
    ent = entities.get(entity_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")
    fact = next((f for f in ent.facts if f.id == fact_id), None)
    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")
    fact.verified = True
    ent.updated_at = datetime.utcnow()
    entities[entity_id] = ent
    return fact


@router.post("/entities/{entity_id}/research", response_model=ResearchJob)
async def research_entity(entity_id: str, bg: BackgroundTasks, _user: dict = Depends(get_current_user)):
    """Kick off the entity research pipeline (website crawl, news, social, oversight, records)."""
    ent = entities.get(entity_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")

    job_id = str(uuid.uuid4())[:8]
    job = ResearchJob(id=job_id, person_id=entity_id)
    jobs[job_id] = job

    bg.add_task(_run_entity_research, entity_id, job)

    logger.info("Entity research job %s started for %s (%s)", job_id, entity_id, ent.name)
    return job


def _run_entity_research(entity_id: str, job: ResearchJob):
    """Background task: run the full entity research pipeline."""
    try:
        from app.pipeline.entity_researcher import run_entity_research_pipeline

        ent = entities.get(entity_id)
        if not ent:
            raise ValueError(f"Entity {entity_id} not found")

        job.status = JobStatus.SEARCHING
        job.started_at = datetime.utcnow()
        jobs[job.id] = job

        updated_entity = run_entity_research_pipeline(ent, job)

        updated_entity.last_researched = datetime.utcnow()
        updated_entity.updated_at = datetime.utcnow()
        entities[entity_id] = updated_entity

        job.status = JobStatus.COMPLETE
        job.completed_at = datetime.utcnow()
        job.facts_found = len(updated_entity.facts)
        jobs[job.id] = job

        logger.info(
            "Entity research complete for %s: %d facts, %d relationships",
            ent.name, len(updated_entity.facts), len(updated_entity.relationships),
        )
    except Exception as e:
        logger.exception("Entity research failed for %s", entity_id)
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


@router.get("/entities/{entity_id}/members", response_model=list[Person])
async def get_entity_members(entity_id: str, _user: dict = Depends(get_current_user)):
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
async def discover_members(entity_id: str, body: DiscoverRequest, bg: BackgroundTasks, _user: dict = Depends(get_current_user)):
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
async def accept_member(entity_id: str, body: MemberAction, _user: dict = Depends(get_current_user)):
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
async def reject_member(entity_id: str, body: MemberAction, _user: dict = Depends(get_current_user)):
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
