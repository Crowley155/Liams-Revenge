from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from app.api._store import cases, entities, jobs, records_requests
from app.api.deps import get_current_user
from app.models import JobStatus, RecordsRequest, ResearchJob
from app.services.case_access import require_case_access, visible_cases_for_user
from app.services.records_generator import generate_records_requests_for_case, render_records_request_letter
from app.services.records_rulebook import list_rule_packs
from app.time import utc_now

logger = logging.getLogger(__name__)
router = APIRouter(tags=["records"])


def _case_records(case_id: str, workspace_id: str) -> list[RecordsRequest]:
    return [
        request for request in records_requests.values()
        if request.case_id == case_id and request.workspace_id == workspace_id
    ]


def _run_records_generation(job: ResearchJob) -> None:
    try:
        case = cases.get(job.case_id)
        if not case:
            raise ValueError("Case not found")

        job.status = JobStatus.SEARCHING
        job.started_at = utc_now()
        jobs[job.id] = job

        case_entities = [
            entity for entity in entities.values()
            if entity.case_id == case.id and entity.workspace_id == case.workspace_id
        ]
        existing = _case_records(case.id, case.workspace_id)
        generated = generate_records_requests_for_case(case, case_entities, existing)
        for request in generated:
            records_requests[request.id] = request

        job.status = JobStatus.COMPLETE
        job.completed_at = utc_now()
        job.facts_found = len(generated)
        jobs[job.id] = job
        logger.info("Records request generation complete for %s: %d drafts", case.id, len(generated))
    except Exception as exc:
        logger.exception("Records request generation failed")
        job.status = JobStatus.FAILED
        job.error = str(exc)
        job.completed_at = utc_now()
        jobs[job.id] = job


@router.get("/records/rule-packs")
async def rule_packs(user: dict = Depends(get_current_user)):
    return {"rule_packs": [pack.model_dump(mode="json") for pack in list_rule_packs()]}


@router.post("/records/generate", response_model=ResearchJob)
async def generate_records(
    bg: BackgroundTasks,
    case_id: str,
    user: dict = Depends(get_current_user),
):
    case = require_case_access(user, cases.get(case_id), "manage_records")
    job_id = str(uuid.uuid4())[:8]
    job = ResearchJob(id=job_id, workspace_id=case.workspace_id, case_id=case.id, person_id="records-generation")
    jobs[job.id] = job
    bg.add_task(_run_records_generation, job)
    return job


@router.get("/records/requests", response_model=list[RecordsRequest])
async def list_records_requests(
    entity_id: str = "",
    status: str = "",
    category: str = "",
    case_id: str = "",
    user: dict = Depends(get_current_user),
):
    if case_id:
        case = require_case_access(user, cases.get(case_id), "view")
        reqs = _case_records(case.id, case.workspace_id)
    else:
        visible_case_ids = {case.id for case in visible_cases_for_user(user)}
        reqs = [request for request in records_requests.values() if request.case_id in visible_case_ids]
    if entity_id:
        reqs = [request for request in reqs if entity_id in request.entity_ids]
    if status:
        reqs = [request for request in reqs if request.status == status]
    if category:
        reqs = [request for request in reqs if request.record_category == category]
    reqs.sort(key=lambda request: request.created_at, reverse=True)
    return reqs


@router.get("/records/requests/{request_id}", response_model=RecordsRequest)
async def get_records_request(request_id: str, user: dict = Depends(get_current_user)):
    request = records_requests.get(request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Records request not found")
    require_case_access(user, cases.get(request.case_id), "view")
    return request


class RecordsRequestUpdate(BaseModel):
    subject: Optional[str] = None
    records_description: Optional[str] = None
    legal_basis: Optional[str] = None
    relevance: Optional[str] = None
    status: Optional[str] = None
    response_notes: Optional[str] = None


@router.put("/records/requests/{request_id}", response_model=RecordsRequest)
async def update_records_request(request_id: str, body: RecordsRequestUpdate, user: dict = Depends(get_current_user)):
    request = records_requests.get(request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Records request not found")
    case = require_case_access(user, cases.get(request.case_id), "manage_records")

    if body.subject is not None:
        request.subject = body.subject
    if body.records_description is not None:
        request.records_description = body.records_description
    if body.legal_basis is not None:
        request.legal_basis = body.legal_basis
    if body.relevance is not None:
        request.relevance = body.relevance
    if body.status is not None:
        request.status = body.status
    if body.response_notes is not None:
        request.response_notes = body.response_notes

    if body.records_description is not None or body.subject is not None or body.legal_basis is not None:
        request.letter_text = render_records_request_letter(case, request)

    request.updated_at = utc_now()
    records_requests[request.id] = request
    return request


@router.post("/records/requests/{request_id}/mark-sent", response_model=RecordsRequest)
async def mark_sent(request_id: str, user: dict = Depends(get_current_user)):
    request = records_requests.get(request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Records request not found")
    require_case_access(user, cases.get(request.case_id), "manage_records")
    if request.status == "needs_review":
        raise HTTPException(status_code=400, detail="Confirm the jurisdiction and custodian before marking this request sent")

    request.status = "sent"
    request.sent_at = utc_now()
    request.updated_at = utc_now()
    records_requests[request.id] = request
    return request
