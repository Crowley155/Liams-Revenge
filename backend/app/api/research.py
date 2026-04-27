"""
Research API — trigger and monitor research jobs.

POST /api/research  — kick off research on a person (or enrich existing)
GET  /api/research/{job_id} — check job status
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.models import PersonCreate, Person, PersonSource, ResearchJob, JobStatus
from app.api._store import cases, jobs, profiles
from app.api.deps import can_access_workspace, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["research"])


def _find_person_by_name_org(name: str, org: str, workspace_id: str) -> Person | None:
    name_lower = name.lower().strip()
    org_lower = org.lower().strip()
    for p in profiles.values():
        if (
            p.workspace_id == workspace_id
            and p.name.lower().strip() == name_lower
            and p.organization.lower().strip() == org_lower
        ):
            return p
    return None


def _run_job(request: PersonCreate, job: ResearchJob, existing: Person | None):
    """Background task that runs the full pipeline and merges results."""
    try:
        logger.info("Background task executing for job %s (%s)", job.id, request.name)
        from app.pipeline import run_research_pipeline
        person = run_research_pipeline(request, job, existing_person=existing)

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

            if person.negative_anchors:
                existing.negative_anchors = list(set(
                    existing.negative_anchors + person.negative_anchors
                ))
            if person.rejected_facts:
                existing.rejected_facts.extend(person.rejected_facts)

            existing.source = PersonSource.BOTH
            existing.updated_at = datetime.utcnow()
            profiles[existing.id] = existing
            logger.info("Enriched existing person %s (%s)", existing.name, existing.id)
        else:
            person.source = PersonSource.PIPELINE
            person.workspace_id = job.workspace_id
            person.case_id = job.case_id
            profiles[person.id] = person

    except Exception as e:
        logger.exception("Pipeline failed for %s", request.name)
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


@router.post("/research", response_model=ResearchJob)
async def start_research(request: PersonCreate, bg: BackgroundTasks, user: dict = Depends(get_current_user)):
    """Kick off a research pipeline for a person. Returns a job you can poll."""
    existing: Person | None = None
    case = cases.get(request.case_id)
    if not case or not can_access_workspace(user, case.workspace_id):
        raise HTTPException(status_code=404, detail="Case not found")

    if request.person_id:
        existing = profiles.get(request.person_id)
        if not existing or not can_access_workspace(user, existing.workspace_id):
            raise HTTPException(status_code=404, detail=f"Person {request.person_id} not found")
    else:
        existing = _find_person_by_name_org(request.name, request.organization, user["workspace_id"])

    job_id = str(uuid.uuid4())[:8]
    person_id = existing.id if existing else str(uuid.uuid4())[:8]

    job = ResearchJob(id=job_id, workspace_id=case.workspace_id, case_id=case.id, person_id=person_id)
    jobs[job_id] = job

    bg.add_task(_run_job, request, job, existing)

    logger.info(
        "Research job %s started for %s (%s)",
        job_id, request.name,
        f"enriching {existing.id}" if existing else "new person",
    )
    return job


@router.get("/research/{job_id}", response_model=ResearchJob)
async def get_job_status(job_id: str, user: dict = Depends(get_current_user)):
    """Check the status of a research job."""
    job = jobs.get(job_id)
    if not job or not can_access_workspace(user, job.workspace_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/research/{job_id}/cancel", response_model=ResearchJob)
async def cancel_job(job_id: str, user: dict = Depends(get_current_user)):
    """Mark a running research job as failed/cancelled. The background task
    checks job.status on each phase boundary and aborts if it sees FAILED."""
    job = jobs.get(job_id)
    if not job or not can_access_workspace(user, job.workspace_id):
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in (JobStatus.COMPLETE, JobStatus.FAILED):
        raise HTTPException(status_code=400, detail=f"Job already {job.status.value}")
    job.status = JobStatus.FAILED
    job.error = "Cancelled by user"
    job.completed_at = datetime.utcnow()
    jobs[job.id] = job
    logger.info("Job %s cancelled by user", job_id)
    return job
