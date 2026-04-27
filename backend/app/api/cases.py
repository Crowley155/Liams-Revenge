from __future__ import annotations

import logging
import json
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile

from app.ai_runtime.evaluation import run_case_evaluation
from app.api._store import case_documents, case_evaluations, cases, usage_events, workspaces
from app.api.deps import get_current_user
from app.models import (
    CaseCreate,
    CaseDocument,
    CaseEvaluation,
    CaseIntake,
    CaseRecord,
    CaseStatus,
    EvaluationStatus,
    UsageEvent,
    Workspace,
    WorkspacePlan,
    WorkspaceType,
)
from app.services.entitlements import ensure_can_create_case, ensure_can_run_evaluation, ensure_can_upload_document
from app.services.workspaces import entitlements_for_workspace

logger = logging.getLogger(__name__)
router = APIRouter(tags=["cases"])
CASE_DATA_PATH = Path(os.getenv("CASE_DATA_PATH", "/app/case-data/case-data.json"))


def _visible_case(case: CaseRecord, user: dict) -> bool:
    return case.workspace_id == user["workspace_id"]


def _get_case(case_id: str, user: dict) -> CaseRecord:
    case = cases.get(case_id)
    if not case or not _visible_case(case, user):
        raise HTTPException(status_code=404, detail="Case not found")
    return case


def _case_docs(case: CaseRecord) -> list[CaseDocument]:
    docs = [
        doc for doc in case_documents.values()
        if doc.workspace_id == case.workspace_id and doc.case_id == case.id
    ]
    docs.sort(key=lambda doc: doc.uploaded_at, reverse=True)
    return docs


def _empty_case_file(case: CaseRecord) -> dict:
    return {
        "case": case.model_dump(mode="json"),
        "meta": {"source": "case_record", "caseId": case.id},
        "actors": [],
        "entities": [],
        "evidence": [],
        "sources": [],
        "threads": [],
        "timeline": [],
        "violations": [],
        "contradictions": [],
        "evidenceGaps": [],
        "policyReforms": [],
    }


def _load_legacy_case_file(case: CaseRecord) -> dict:
    if case.id != "crowley-v-usd232" or not CASE_DATA_PATH.exists():
        return _empty_case_file(case)

    data = json.loads(CASE_DATA_PATH.read_text(encoding="utf-8"))
    data["case"] = case.model_dump(mode="json")
    data.setdefault("meta", {})
    data["meta"]["caseId"] = case.id
    data["meta"]["source"] = "protected_case_file"
    return data


def seed_demo_case() -> None:
    if not workspaces.get("demo"):
        workspaces["demo"] = Workspace(
            id="demo",
            name="USDWatch demo workspace",
            type=WorkspaceType.PERSONAL,
            plan=WorkspacePlan.ADMIN,
        )

    if cases.get("crowley-v-usd232"):
        return

    cases["crowley-v-usd232"] = CaseRecord(
        id="crowley-v-usd232",
        workspace_id="demo",
        title="Crowley v. USD 232 / JCPRD",
        status=CaseStatus.DEMO,
        intake=CaseIntake(
            state="KS",
            district="USD 232",
            school="",
            issue_type="student_safety",
            narrative="Seeded public demo case used by the original Case Command Center.",
            desired_outcome="Preserve the existing public advocacy resource while new private evaluations are scoped to user workspaces.",
        ),
        summary="Seeded admin/demo case preserved during the free evaluation rollout.",
    )


@router.get("/workspace")
async def workspace_summary(user: dict = Depends(get_current_user)):
    workspace = Workspace(**user["workspace"])
    entitlements = entitlements_for_workspace(workspace)
    user_cases = [case for case in cases.values() if case.workspace_id == workspace.id]
    return {
        "user": user,
        "workspace": workspace,
        "entitlements": entitlements,
        "case_count": len(user_cases),
    }


@router.get("/cases", response_model=list[CaseRecord])
async def list_cases(user: dict = Depends(get_current_user)):
    visible = [case for case in cases.values() if _visible_case(case, user)]
    visible.sort(key=lambda case: case.updated_at, reverse=True)
    return visible


@router.post("/cases", response_model=CaseRecord)
async def create_case(body: CaseCreate, user: dict = Depends(get_current_user)):
    ensure_can_create_case(user)
    case = CaseRecord(
        id=str(uuid.uuid4())[:8],
        workspace_id=user["workspace_id"],
        title=body.title.strip() or "Untitled case",
        intake=CaseIntake(
            state=body.state,
            district=body.district,
            school=body.school,
            issue_type=body.issue_type,
            incident_date=body.incident_date,
            narrative=body.narrative,
            desired_outcome=body.desired_outcome,
            student_age=body.student_age,
            urgent=body.urgent,
        ),
        summary=body.narrative[:280],
        created_by=user["id"],
    )
    cases[case.id] = case
    return case


@router.get("/cases/{case_id}", response_model=CaseRecord)
async def get_case(case_id: str, user: dict = Depends(get_current_user)):
    return _get_case(case_id, user)


@router.get("/cases/{case_id}/file")
async def get_case_file(case_id: str, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    return _load_legacy_case_file(case)


@router.get("/cases/{case_id}/documents", response_model=list[CaseDocument])
async def list_case_documents(case_id: str, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    return _case_docs(case)


@router.post("/cases/{case_id}/documents", response_model=CaseDocument)
async def upload_case_document(
    case_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    case = _get_case(case_id, user)
    ensure_can_upload_document(user, case.id)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    doc = CaseDocument(
        id=str(uuid.uuid4())[:8],
        workspace_id=case.workspace_id,
        case_id=case.id,
        filename=file.filename or "unknown",
        file_size=len(content),
        source="case_evaluation_upload",
    )

    try:
        from app.services.document_parser import parse_file
        from app.services.text_chunker import chunk_text

        extracted, file_type = parse_file(doc.filename, content)
        doc.file_type = file_type
        doc.extracted_text = extracted
        doc.chunk_count = len(chunk_text(extracted, doc.id)) if extracted else 0
        doc.status = "indexed" if extracted and not extracted.startswith("[") else "failed"
        doc.error = None if doc.status == "indexed" else "No text could be extracted"
        doc.processed_at = datetime.utcnow()
    except Exception as exc:
        logger.warning("Case document parse failed for %s: %s", doc.filename, exc)
        doc.status = "failed"
        doc.error = str(exc)
        doc.processed_at = datetime.utcnow()

    case_documents[doc.id] = doc
    return doc


def _run_evaluation_background(case: CaseRecord, evaluation: CaseEvaluation):
    docs = _case_docs(case)
    workspace = workspaces.get(case.workspace_id)
    premium = bool(workspace and workspace.plan in (WorkspacePlan.ADMIN, WorkspacePlan.ORGANIZATION, WorkspacePlan.PREMIUM))
    run_case_evaluation(case, docs, evaluation, premium=premium)


@router.post("/cases/{case_id}/evaluations", response_model=CaseEvaluation)
async def start_evaluation(
    case_id: str,
    bg: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    case = _get_case(case_id, user)
    entitlements = ensure_can_run_evaluation(user, case.id)

    evaluation = CaseEvaluation(
        id=str(uuid.uuid4())[:8],
        workspace_id=case.workspace_id,
        case_id=case.id,
        status=EvaluationStatus.QUEUED,
        model_tier="premium" if entitlements.premium_review else "free",
    )
    case_evaluations[evaluation.id] = evaluation
    usage_events[str(uuid.uuid4())[:8]] = UsageEvent(
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="evaluation_run",
    )
    bg.add_task(_run_evaluation_background, case, evaluation)
    return evaluation


@router.get("/cases/{case_id}/evaluations/latest", response_model=CaseEvaluation | None)
async def latest_evaluation(case_id: str, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    evaluations = [
        evaluation for evaluation in case_evaluations.values()
        if evaluation.workspace_id == case.workspace_id and evaluation.case_id == case.id
    ]
    evaluations.sort(key=lambda evaluation: evaluation.created_at, reverse=True)
    return evaluations[0] if evaluations else None


@router.get("/cases/{case_id}/evaluations/{evaluation_id}", response_model=CaseEvaluation)
async def get_evaluation(case_id: str, evaluation_id: str, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    evaluation = case_evaluations.get(evaluation_id)
    if not evaluation or evaluation.workspace_id != case.workspace_id or evaluation.case_id != case.id:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return evaluation
