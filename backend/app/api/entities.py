"""
Entities API — CRUD for organizations and member discovery.

GET  /api/entities                — list all entities
GET  /api/entities/{id}           — single entity with member list
POST /api/entities                — create entity
POST /api/entities/{id}/discover  — discover active members via pipeline
GET  /api/entities/{id}/members   — all Person records linked to entity
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.models import Entity, EntityCreate, EntityMember, Person, PersonSource, ResearchJob, JobStatus
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
    member_ids = {m.person_id for m in ent.members}
    return [p for p in profiles.values() if p.id in member_ids]


def _run_discovery(entity_id: str, job: ResearchJob):
    """Background task: discover members for an entity."""
    try:
        from app.pipeline.discoverer import discover_entity_members

        ent = entities.get(entity_id)
        if not ent:
            raise ValueError(f"Entity {entity_id} not found")

        job.status = JobStatus.SEARCHING
        job.started_at = datetime.utcnow()
        jobs[job.id] = job

        discovered = discover_entity_members(ent)
        logger.info("Discovered %d members for %s", len(discovered), ent.name)

        created = 0
        for member_info in discovered:
            name = member_info.get("name", "").strip()
            role = member_info.get("role", "Member")
            if not name:
                continue

            existing = _find_person_by_name_org(name, ent.name)
            if existing:
                if entity_id not in existing.entity_ids:
                    existing.entity_ids.append(entity_id)
                    profiles[existing.id] = existing
                if not any(m.person_id == existing.id for m in ent.members):
                    ent.members.append(EntityMember(person_id=existing.id, role=role, title=role))
                continue

            person_id = str(uuid.uuid4())[:8]
            person = Person(
                id=person_id,
                name=name,
                role=role,
                organization=ent.name,
                state=ent.state,
                source=PersonSource.PIPELINE,
                entity_ids=[entity_id],
            )
            profiles[person_id] = person
            ent.members.append(EntityMember(person_id=person_id, role=role, title=role))
            created += 1

        ent.updated_at = datetime.utcnow()
        entities[entity_id] = ent

        job.status = JobStatus.COMPLETE
        job.completed_at = datetime.utcnow()
        job.facts_found = created
        jobs[job.id] = job

        logger.info("Discovery complete: %d new members created for %s", created, ent.name)

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


def _find_person_by_name_org(name: str, org: str) -> Person | None:
    """Case-insensitive match by name and organization."""
    name_lower = name.lower().strip()
    org_lower = org.lower().strip()
    for p in profiles.values():
        if p.name.lower().strip() == name_lower and p.organization.lower().strip() == org_lower:
            return p
    return None


@router.post("/entities/{entity_id}/discover", response_model=ResearchJob)
async def discover_members(entity_id: str, bg: BackgroundTasks):
    ent = entities.get(entity_id)
    if not ent:
        raise HTTPException(status_code=404, detail="Entity not found")

    job_id = str(uuid.uuid4())[:8]
    job = ResearchJob(id=job_id, person_id=entity_id)
    jobs[job_id] = job

    bg.add_task(_run_discovery, entity_id, job)

    logger.info("Discovery job %s started for entity %s (%s)", job_id, entity_id, ent.name)
    return job
