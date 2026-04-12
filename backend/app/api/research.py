"""
Research API — trigger and monitor research jobs.

POST /api/research  — kick off research on a person (or enrich existing)
GET  /api/research/{job_id} — check job status
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.models import PersonCreate, Person, PersonSource, ResearchJob, JobStatus
from app.api._store import jobs, profiles

logger = logging.getLogger(__name__)
router = APIRouter(tags=["research"])


def _find_person_by_name_org(name: str, org: str) -> Person | None:
    name_lower = name.lower().strip()
    org_lower = org.lower().strip()
    for p in profiles.values():
        if p.name.lower().strip() == name_lower and p.organization.lower().strip() == org_lower:
            return p
    return None


def _run_job(request: PersonCreate, job: ResearchJob, existing: Person | None):
    """Background task that runs the full pipeline and merges results."""
    try:
        from app.pipeline import run_research_pipeline
        person = run_research_pipeline(request, job)

        if existing:
            existing.facts.extend(person.facts)
            seen = set()
            deduped = []
            for f in existing.facts:
                key = f.content.strip().lower()[:100]
                if key not in seen:
                    seen.add(key)
                    deduped.append(f)
            existing.facts = deduped

            existing.battle_card = person.battle_card
            if person.contact:
                if existing.contact:
                    for field in ("email", "phone", "address", "linkedin_url", "twitter_handle", "facebook_url"):
                        new_val = getattr(person.contact, field, None)
                        if new_val and not getattr(existing.contact, field, None):
                            setattr(existing.contact, field, new_val)
                    existing.contact.other_urls = list(set(
                        existing.contact.other_urls + person.contact.other_urls
                    ))
                else:
                    existing.contact = person.contact

            existing.source = PersonSource.BOTH
            existing.updated_at = datetime.utcnow()
            profiles[existing.id] = existing
            logger.info("Enriched existing person %s (%s)", existing.name, existing.id)
        else:
            person.source = PersonSource.PIPELINE
            profiles[person.id] = person

    except Exception as e:
        logger.exception("Pipeline failed for %s", request.name)
        job.status = JobStatus.FAILED
        job.error = str(e)
        job.completed_at = datetime.utcnow()
        jobs[job.id] = job


@router.post("/research", response_model=ResearchJob)
async def start_research(request: PersonCreate, bg: BackgroundTasks):
    """Kick off a research pipeline for a person. Returns a job you can poll."""
    existing: Person | None = None

    if request.person_id:
        existing = profiles.get(request.person_id)
        if not existing:
            raise HTTPException(status_code=404, detail=f"Person {request.person_id} not found")
    else:
        existing = _find_person_by_name_org(request.name, request.organization)

    job_id = str(uuid.uuid4())[:8]
    person_id = existing.id if existing else str(uuid.uuid4())[:8]

    job = ResearchJob(id=job_id, person_id=person_id)
    jobs[job_id] = job

    bg.add_task(_run_job, request, job, existing)

    logger.info(
        "Research job %s started for %s (%s)",
        job_id, request.name,
        f"enriching {existing.id}" if existing else "new person",
    )
    return job


@router.get("/research/{job_id}", response_model=ResearchJob)
async def get_job_status(job_id: str):
    """Check the status of a research job."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
