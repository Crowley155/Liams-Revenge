from __future__ import annotations

import logging
import json
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile

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
    SupportConsent,
    UsageEvent,
    Workspace,
    WorkspacePlan,
    WorkspaceType,
)
from app.services.entitlements import ensure_can_create_case, ensure_can_run_evaluation, ensure_can_upload_document
from app.services.case_file_builder import build_private_case_file
from app.services.workspaces import entitlements_for_workspace

logger = logging.getLogger(__name__)
router = APIRouter(tags=["cases"])
CASE_DATA_PATH = Path(os.getenv("CASE_DATA_PATH", "/app/case-data/case-data.json"))
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
SUPPORTED_EVIDENCE_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".webp", ".bmp", ".docx", ".eml", ".txt", ".md"}


def _validate_evidence_upload(filename: str, content: bytes) -> None:
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Evidence Locker files must be 15 MB or smaller for the free evaluation.")
    ext = Path(filename or "").suffix.lower()
    if ext not in SUPPORTED_EVIDENCE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported evidence file type. Upload PDF, image, Word, email, text, or markdown files.")


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


def _latest_case_evaluation(case: CaseRecord) -> CaseEvaluation | None:
    evaluations = [
        evaluation for evaluation in case_evaluations.values()
        if evaluation.workspace_id == case.workspace_id and evaluation.case_id == case.id
    ]
    evaluations.sort(key=lambda evaluation: evaluation.created_at, reverse=True)
    return evaluations[0] if evaluations else None


def _consent_with_timestamp(consent: SupportConsent) -> SupportConsent:
    opted_in = consent.attorney_contact_opt_in or consent.advocacy_contact_opt_in or consent.media_contact_opt_in
    if opted_in and consent.share_summary_consent:
        if not consent.consented_at:
            consent.consented_at = datetime.utcnow()
        consent.revoked_at = None
    elif opted_in:
        consent.consented_at = None
        consent.revoked_at = None
    if not opted_in:
        consent.consented_at = None
        consent.revoked_at = datetime.utcnow()
        consent.share_summary_consent = False
    return consent


def _case_context_summary(case: CaseRecord, docs: list[CaseDocument]) -> dict:
    intake = case.intake
    return {
        "case_id": case.id,
        "title": case.title,
        "district": intake.district,
        "school": intake.school,
        "issue_categories": intake.issue_categories or [intake.issue_type],
        "impacted_party_age": intake.impacted_party_age or intake.student_age,
        "grade_level": intake.grade_level,
        "relationship_to_child": intake.relationship_to_child,
        "iep_504_status": intake.iep_504_status,
        "urgency_level": intake.urgency_level,
        "safety_risk": intake.safety_risk or intake.urgent,
        "retaliation_concern": intake.retaliation_concern,
        "document_count": len(docs),
        "indexed_document_count": len([doc for doc in docs if doc.processing_status == "indexed" or doc.status == "indexed"]),
    }


def _evidence_checklist(case: CaseRecord, docs: list[CaseDocument]) -> list[dict]:
    uploaded_types = {doc.evidence_type for doc in docs if doc.evidence_type}
    categories = set(case.intake.issue_categories or [case.intake.issue_type])
    checklist = [
        {
            "item": "Your written story in your own words",
            "why_it_matters": "This anchors the timeline and helps separate facts from interpretation.",
            "status": "complete" if case.intake.narrative else "missing",
        },
        {
            "item": "Emails, texts, or portal messages",
            "why_it_matters": "Messages show what the school knew, when they knew it, and how they responded.",
            "status": "complete" if "communications" in uploaded_types or docs else "recommended",
        },
        {
            "item": "Official school or district records",
            "why_it_matters": "Incident reports, notices, IEP/504 documents, and meeting notes are primary evidence.",
            "status": "complete" if uploaded_types & {"incident_report", "iep_504", "meeting_notes"} else "recommended",
        },
        {
            "item": "A clear desired outcome",
            "why_it_matters": "Records requests and advocacy steps are stronger when they point toward a practical goal.",
            "status": "complete" if case.intake.desired_outcome or case.intake.desired_outcomes else "missing",
        },
    ]
    if "student_safety" in categories or case.intake.safety_risk:
        checklist.append({
            "item": "Medical, safety, or agency documentation",
            "why_it_matters": "Safety cases often turn on dated outside records, photos, reports, or mandated-reporter activity.",
            "status": "complete" if uploaded_types & {"medical", "agency_letter", "photo"} else "recommended",
        })
    if "special_education" in categories or case.intake.iep_504_status:
        checklist.append({
            "item": "IEP, 504, evaluations, notices, and meeting notes",
            "why_it_matters": "Special education advocacy depends on the written plan, notices, and dated team decisions.",
            "status": "complete" if "iep_504" in uploaded_types else "recommended",
        })
    return checklist


def _records_request_drafts(case: CaseRecord, evaluation: CaseEvaluation | None) -> list[dict]:
    if evaluation and evaluation.result and evaluation.result.recommended_records:
        return [
            {
                "title": record.title,
                "custodian": record.custodian,
                "record_type": record.record_type,
                "priority": record.priority,
                "reason": record.reason,
                "request_language": record.request_language,
            }
            for record in evaluation.result.recommended_records
        ]

    district = case.intake.district or "the district"
    return [
        {
            "title": "Complete communication and incident record",
            "custodian": f"{district} records custodian",
            "record_type": "communications",
            "priority": "high",
            "reason": "Establish the official timeline, notice, and response.",
            "request_language": "Please provide all emails, messages, notes, incident reports, meeting notes, and internal communications related to the events described in this request.",
        },
        {
            "title": "Applicable policies and procedures",
            "custodian": f"{district} records custodian",
            "record_type": "policy",
            "priority": "medium",
            "reason": "Compare what happened against the written standards in effect at the time.",
            "request_language": "Please provide policies, procedures, handbooks, training materials, and staff guidance applicable to the issue described in this request.",
        },
    ]


def _self_advocacy_packet(case: CaseRecord) -> dict:
    docs = _case_docs(case)
    evaluation = _latest_case_evaluation(case)
    result = evaluation.result if evaluation else None
    checklist = _evidence_checklist(case, docs)
    records = _records_request_drafts(case, evaluation)
    desired = case.intake.desired_outcomes or ([case.intake.desired_outcome] if case.intake.desired_outcome else [])

    return {
        "title": f"Self-Advocacy Packet - {case.title}",
        "disclaimer": "USDWatch is informational and does not provide legal advice or create an attorney-client relationship.",
        "case_summary": _case_context_summary(case, docs),
        "parent_story": case.intake.narrative,
        "desired_outcomes": desired,
        "what_usdwatch_sees": result.executive_summary if result else "Run an evaluation to generate a fuller case read.",
        "evidence_strength": result.evidence_strength if result else "unknown",
        "timeline": [event.model_dump(mode="json") for event in (result.timeline if result else [])],
        "evidence_checklist": checklist,
        "records_request_drafts": records,
        "questions_to_ask_school": [
            "Who is the single point of contact responsible for responding to this concern?",
            "What written policy or procedure did the school apply?",
            "What records exist that document the decision, incident, or response?",
            "What is the timeline for the next written update?",
        ],
        "possible_escalation_paths": [
            "Request records before escalating so the next step is grounded in documents.",
            "Ask for a written meeting agenda and written follow-up after any meeting.",
            "Consider qualified legal, advocacy, or agency support before filing a formal complaint.",
        ],
        "next_steps": result.next_steps if result else [
            "Upload the strongest records you already have.",
            "Run the free evaluation.",
            "Use the recommended records list to fill evidence gaps.",
        ],
        "support_preferences": case.support_consent.model_dump(mode="json"),
        "generated_at": datetime.utcnow().isoformat(),
    }


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
    docs = _case_docs(case)
    if docs:
        return build_private_case_file(case, docs)

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
    support_consent = _consent_with_timestamp(body.support_consent)
    desired_outcome = body.desired_outcome or "; ".join(body.desired_outcomes)
    impacted_age = body.impacted_party_age if body.impacted_party_age is not None else body.student_age
    case = CaseRecord(
        id=str(uuid.uuid4())[:8],
        workspace_id=user["workspace_id"],
        title=body.title.strip() or "Untitled case",
        intake=CaseIntake(
            state=body.state,
            district=body.district,
            school=body.school,
            issue_type=body.issue_type,
            issue_categories=body.issue_categories,
            incident_date=body.incident_date,
            narrative=body.narrative,
            desired_outcome=desired_outcome,
            desired_outcomes=body.desired_outcomes,
            student_age=body.student_age,
            impacted_party_age=impacted_age,
            grade_level=body.grade_level,
            school_setting=body.school_setting,
            relationship_to_child=body.relationship_to_child,
            iep_504_status=body.iep_504_status,
            urgency_level=body.urgency_level,
            safety_risk=body.safety_risk,
            retaliation_concern=body.retaliation_concern,
            prior_actions=body.prior_actions,
            urgent=body.urgent or body.safety_risk or body.urgency_level in {"urgent", "immediate"},
        ),
        support_consent=support_consent,
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
    evidence_type: str = Form(default=""),
    user_description: str = Form(default=""),
    document_date: str | None = Form(default=None),
    source_person: str = Form(default=""),
    user: dict = Depends(get_current_user),
):
    case = _get_case(case_id, user)
    ensure_can_upload_document(user, case.id)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    _validate_evidence_upload(file.filename or "", content)

    doc = CaseDocument(
        id=str(uuid.uuid4())[:8],
        workspace_id=case.workspace_id,
        case_id=case.id,
        filename=file.filename or "unknown",
        file_size=len(content),
        evidence_type=evidence_type,
        user_description=user_description,
        document_date=document_date,
        source_person=source_person,
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
        doc.processing_status = "indexed" if doc.status == "indexed" else "failed"
        doc.error = None if doc.status == "indexed" else "No text could be extracted"
        doc.failure_reason = doc.error
        doc.processed_at = datetime.utcnow()
    except Exception as exc:
        logger.warning("Case document parse failed for %s: %s", doc.filename, exc)
        doc.status = "failed"
        doc.processing_status = "failed"
        doc.error = str(exc)
        doc.failure_reason = str(exc)
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
    return _latest_case_evaluation(case)


@router.get("/cases/{case_id}/evaluations/{evaluation_id}", response_model=CaseEvaluation)
async def get_evaluation(case_id: str, evaluation_id: str, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    evaluation = case_evaluations.get(evaluation_id)
    if not evaluation or evaluation.workspace_id != case.workspace_id or evaluation.case_id != case.id:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return evaluation


@router.put("/cases/{case_id}/support-consent", response_model=CaseRecord)
async def update_support_consent(case_id: str, body: SupportConsent, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    case.support_consent = _consent_with_timestamp(body)
    case.updated_at = datetime.utcnow()
    cases[case.id] = case
    return case


@router.get("/cases/{case_id}/artifacts/self-advocacy-packet")
async def self_advocacy_packet(case_id: str, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    return _self_advocacy_packet(case)


@router.get("/cases/{case_id}/artifacts/evidence-checklist")
async def evidence_checklist(case_id: str, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    return {"case_id": case.id, "items": _evidence_checklist(case, _case_docs(case))}


@router.get("/cases/{case_id}/artifacts/records-request-drafts")
async def records_request_drafts(case_id: str, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    return {"case_id": case.id, "records": _records_request_drafts(case, _latest_case_evaluation(case))}


@router.get("/cases/{case_id}/export")
async def export_case(case_id: str, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    evaluations = [
        evaluation for evaluation in case_evaluations.values()
        if evaluation.workspace_id == case.workspace_id and evaluation.case_id == case.id
    ]
    return {
        "case": case.model_dump(mode="json"),
        "documents": [doc.model_dump(mode="json") for doc in _case_docs(case)],
        "evaluations": [evaluation.model_dump(mode="json") for evaluation in evaluations],
        "packet": _self_advocacy_packet(case),
    }


@router.get("/support-requests")
async def support_review_queue(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    queue = []
    for case in cases.values():
        consent = case.support_consent
        opted_in = consent.attorney_contact_opt_in or consent.advocacy_contact_opt_in or consent.media_contact_opt_in
        if not opted_in or consent.revoked_at or not consent.share_summary_consent:
            continue
        queue.append({
            "case_id": case.id,
            "title": case.title,
            "workspace_id": case.workspace_id,
            "district": case.intake.district,
            "school": case.intake.school,
            "issue_categories": case.intake.issue_categories or [case.intake.issue_type],
            "urgency_level": case.intake.urgency_level,
            "support_consent": consent.model_dump(mode="json"),
            "updated_at": case.updated_at,
        })
    queue.sort(key=lambda item: item["updated_at"], reverse=True)
    return queue
