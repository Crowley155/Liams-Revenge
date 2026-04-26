"""
KORA Request API — generate, manage, and track Kansas Open Records Act requests.

POST /api/kora/generate              — generate requests for the entire case (async)
GET  /api/kora/requests              — list all requests
GET  /api/kora/requests/{id}         — single request detail
PUT  /api/kora/requests/{id}         — edit a request
POST /api/kora/requests/{id}/mark-sent — mark as sent
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.models import KoraRequest, ResearchJob, JobStatus
from app.api._store import kora_requests, jobs
from app.api.deps import can_access_workspace, get_current_user, scoped_items

logger = logging.getLogger(__name__)
router = APIRouter(tags=["kora"])


def _run_kora_generation(job: ResearchJob):
    """Background task: run the KORA request generator pipeline."""
    try:
        from app.pipeline.kora_generator import generate_kora_requests

        job.status = JobStatus.SEARCHING
        job.started_at = datetime.utcnow()
        jobs[job.id] = job

        requests = generate_kora_requests()

        for req in requests:
            req.workspace_id = job.workspace_id
            req.case_id = job.case_id
            kora_requests[req.id] = req

        job.status = JobStatus.COMPLETE
        job.completed_at = datetime.utcnow()
        job.facts_found = len(requests)
        jobs[job.id] = job

        logger.info("KORA generation complete: %d requests", len(requests))

    except Exception as e:
        logger.exception("KORA generation failed")
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


@router.post("/kora/generate", response_model=ResearchJob)
async def generate_kora(bg: BackgroundTasks, user: dict = Depends(get_current_user)):
    """Generate KORA requests for the entire case. Runs async."""
    job_id = str(uuid.uuid4())[:8]
    job = ResearchJob(id=job_id, workspace_id=user["workspace_id"], person_id="kora-generation")
    jobs[job_id] = job

    bg.add_task(_run_kora_generation, job)

    logger.info("KORA generation job %s started", job_id)
    return job


@router.get("/kora/requests", response_model=list[KoraRequest])
async def list_kora_requests(
    entity_id: str = "",
    status: str = "",
    category: str = "",
    user: dict = Depends(get_current_user),
):
    """List KORA requests with optional filters."""
    reqs = scoped_items(list(kora_requests.values()), user)
    if entity_id:
        reqs = [r for r in reqs if entity_id in r.entity_ids]
    if status:
        reqs = [r for r in reqs if r.status == status]
    if category:
        reqs = [r for r in reqs if r.record_category == category]
    reqs.sort(key=lambda r: r.created_at, reverse=True)
    return reqs


@router.get("/kora/requests/{request_id}", response_model=KoraRequest)
async def get_kora_request(request_id: str, user: dict = Depends(get_current_user)):
    req = kora_requests.get(request_id)
    if not req or not can_access_workspace(user, req.workspace_id):
        raise HTTPException(status_code=404, detail="KORA request not found")
    return req


class KoraRequestUpdate(BaseModel):
    subject: Optional[str] = None
    records_description: Optional[str] = None
    legal_basis: Optional[str] = None
    relevance: Optional[str] = None
    status: Optional[str] = None
    response_notes: Optional[str] = None


@router.put("/kora/requests/{request_id}", response_model=KoraRequest)
async def update_kora_request(request_id: str, body: KoraRequestUpdate, user: dict = Depends(get_current_user)):
    """Edit a KORA request (subject, description, status, etc.)."""
    req = kora_requests.get(request_id)
    if not req or not can_access_workspace(user, req.workspace_id):
        raise HTTPException(status_code=404, detail="KORA request not found")

    if body.subject is not None:
        req.subject = body.subject
    if body.records_description is not None:
        req.records_description = body.records_description
    if body.legal_basis is not None:
        req.legal_basis = body.legal_basis
    if body.relevance is not None:
        req.relevance = body.relevance
    if body.status is not None:
        req.status = body.status
    if body.response_notes is not None:
        req.response_notes = body.response_notes

    if body.records_description is not None or body.subject is not None:
        from app.pipeline.kora_generator import _render_letter, _load_case_data
        from app.api._store import entities as entity_store
        entities_by_id = {e.id: e for e in entity_store.values()}
        req.letter_text = _render_letter(req, entities_by_id)

    req.updated_at = datetime.utcnow()
    kora_requests[request_id] = req
    return req


@router.post("/kora/requests/{request_id}/mark-sent", response_model=KoraRequest)
async def mark_sent(request_id: str, user: dict = Depends(get_current_user)):
    """Mark a KORA request as sent."""
    req = kora_requests.get(request_id)
    if not req or not can_access_workspace(user, req.workspace_id):
        raise HTTPException(status_code=404, detail="KORA request not found")

    req.status = "sent"
    req.sent_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()
    kora_requests[request_id] = req

    logger.info("KORA request %s marked as sent", request_id)
    return req
