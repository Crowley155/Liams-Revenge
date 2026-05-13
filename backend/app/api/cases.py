from __future__ import annotations

from app.time import normalize_utc, utc_now

import logging
import hashlib
import json
import mimetypes
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.ai_runtime.case_drafting import CaseDraftSourceMissing, draft_case_text
from app.ai_runtime.evaluation import run_case_evaluation
from app.ai_runtime.intake import analyze_case_chat_session, analyze_intake_session, classify_case_chat_intent
from app.api._store import (
    case_documents,
    case_evaluations,
    case_intake_sessions,
    case_share_grants,
    cases,
    gmail_connections,
    kora_requests,
    usage_events,
    workspaces,
)
from app.api.deps import get_current_user
from app.models import (
    CaseAccessSummary,
    CaseChatTurnRequest,
    CaseCreate,
    CaseDocument,
    CaseEvaluation,
    CaseIntake,
    CaseIntakeFacts,
    CaseIntakeMessage,
    CaseIntakeMessageCreate,
    CaseIntakeSession,
    CaseRecord,
    CaseShareRoleUpdate,
    CaseShareCreate,
    CaseShareStatus,
    CaseStatus,
    CaseUpdate,
    EvaluationStatus,
    SupportConsent,
    UsageEvent,
    Workspace,
    WorkspacePlan,
    WorkspaceType,
)
from app.services.entitlements import ensure_can_create_case, ensure_can_run_evaluation, ensure_can_upload_document
from app.services.case_access import (
    access_summary,
    can_access_case,
    grant_case_access_by_email,
    public_grant,
    require_case_access,
    revoke_share_grant,
    update_share_grant_role,
    visible_cases_for_user,
)
from app.services.case_file_builder import build_private_case_file
from app.services.document_classifier import document_matches_category, infer_document_metadata
from app.services.document_ingestion import process_document_bytes
from app.services.document_storage import save_case_document_file
from app.services.evidence_uploads import validate_evidence_upload
from app.services.file_types import normalize_file_type
from app.services.workspaces import entitlements_for_workspace

logger = logging.getLogger(__name__)
router = APIRouter(tags=["cases"])
CASE_DATA_PATH = Path(os.getenv("CASE_DATA_PATH", "/app/case-data/case-data.json"))


class CaseDraftAssistRequest(BaseModel):
    target: str = Field(default="family_narrative", pattern="^(family_narrative|desired_outcome)$")


class CaseDraftAssistResponse(BaseModel):
    target: str
    draft: str
    model_route: str
    sources: list[str] = Field(default_factory=list)


def _visible_case(case: CaseRecord, user: dict) -> bool:
    return can_access_case(user, case, "view")


def _get_case(case_id: str, user: dict) -> CaseRecord:
    case = cases.get(case_id)
    return require_case_access(user, case, "view")


def _case_docs(case: CaseRecord) -> list[CaseDocument]:
    docs = [
        doc for doc in case_documents.values()
        if doc.workspace_id == case.workspace_id and doc.case_id == case.id
    ]
    if not docs and case.status == CaseStatus.DEMO:
        docs = [
            doc for doc in case_documents.values()
            if doc.case_id == case.id
        ]
    docs.sort(key=lambda doc: normalize_utc(doc.uploaded_at), reverse=True)
    return docs


def _filter_case_docs(
    docs: list[CaseDocument],
    *,
    q: str = "",
    status: str = "",
    category: str = "",
    tag: str = "",
    sort: str = "uploaded_at",
    direction: str = "desc",
    limit: int = 200,
    offset: int = 0,
) -> list[CaseDocument]:
    if status:
        docs = [doc for doc in docs if doc.status == status or doc.processing_status == status]
    if category:
        docs = [doc for doc in docs if document_matches_category(doc, category)]
    if tag:
        docs = [doc for doc in docs if tag in doc.tags]
    if q:
        needle = q.lower()
        docs = [
            doc for doc in docs
            if needle in " ".join([
                doc.filename,
                doc.user_description,
                doc.source_person,
                doc.evidence_type,
                doc.inferred_category,
                doc.document_summary,
                doc.case_relevance,
                " ".join(doc.tags),
                doc.extracted_text[:2000],
            ]).lower()
        ]
    key_map = {
        "name": lambda doc: doc.filename.lower(),
        "size": lambda doc: doc.file_size,
        "status": lambda doc: doc.processing_status or doc.status,
        "document_date": lambda doc: doc.document_date or "",
        "uploaded_at": lambda doc: doc.uploaded_at,
    }
    docs.sort(key=key_map.get(sort, key_map["uploaded_at"]), reverse=direction != "asc")
    return docs[offset:offset + limit]


_ADVOCATE_QUERY_STOPWORDS = {
    "about",
    "case",
    "document",
    "documents",
    "evidence",
    "file",
    "files",
    "have",
    "record",
    "records",
    "source",
    "sources",
    "that",
    "this",
    "what",
    "with",
}


def _advocate_keyword_score(doc: CaseDocument, query: str) -> float:
    terms = [
        term
        for term in re.findall(r"[a-z0-9]{4,}", query.lower())
        if term not in _ADVOCATE_QUERY_STOPWORDS
    ]
    if not terms:
        return 0.0
    haystack = " ".join([
        doc.filename,
        doc.user_description,
        doc.source_person,
        doc.evidence_type,
        doc.inferred_category,
        doc.document_summary,
        doc.case_relevance,
        " ".join(doc.tags),
        doc.extracted_text[:4000],
    ]).lower()
    matches = sum(1 for term in terms if term in haystack)
    return matches / len(terms)


def _latest_case_evaluation(case: CaseRecord) -> CaseEvaluation | None:
    evaluations = [
        evaluation for evaluation in case_evaluations.values()
        if evaluation.workspace_id == case.workspace_id and evaluation.case_id == case.id
    ]
    evaluations.sort(key=lambda evaluation: normalize_utc(evaluation.created_at), reverse=True)
    return evaluations[0] if evaluations else None


def _consent_with_timestamp(consent: SupportConsent) -> SupportConsent:
    opted_in = consent.attorney_contact_opt_in or consent.advocacy_contact_opt_in or consent.media_contact_opt_in
    if opted_in and consent.share_summary_consent:
        if not consent.consented_at:
            consent.consented_at = utc_now()
        consent.revoked_at = None
    elif opted_in:
        consent.consented_at = None
        consent.revoked_at = None
    if not opted_in:
        consent.consented_at = None
        consent.revoked_at = utc_now()
        consent.share_summary_consent = False
    return consent


def _case_to_intake_facts(case: CaseRecord) -> CaseIntakeFacts:
    intake = case.intake
    return CaseIntakeFacts(
        title=case.title,
        state=intake.state,
        district=intake.district,
        school=intake.school,
        issue_type=intake.issue_type,
        issue_categories=intake.issue_categories,
        incident_date=intake.incident_date,
        narrative=intake.narrative,
        desired_outcome=intake.desired_outcome,
        desired_outcomes=intake.desired_outcomes,
        student_age=intake.student_age,
        impacted_party_age=intake.impacted_party_age,
        grade_level=intake.grade_level,
        school_setting=intake.school_setting,
        relationship_to_child=intake.relationship_to_child,
        iep_504_status=intake.iep_504_status,
        urgency_level=intake.urgency_level,
        safety_risk=intake.safety_risk,
        retaliation_concern=intake.retaliation_concern,
        prior_actions=intake.prior_actions,
        urgent=intake.urgent,
    )


def _facts_to_intake(facts: CaseIntakeFacts) -> CaseIntake:
    impacted_age = facts.impacted_party_age if facts.impacted_party_age is not None else facts.student_age
    desired_outcome = facts.desired_outcome or "; ".join(facts.desired_outcomes)
    issue_categories = facts.issue_categories or ([facts.issue_type] if facts.issue_type else ["other"])
    return CaseIntake(
        state=facts.state,
        district=facts.district,
        school=facts.school,
        issue_type=issue_categories[0] if issue_categories else "other",
        issue_categories=issue_categories,
        incident_date=facts.incident_date,
        narrative=facts.narrative,
        desired_outcome=desired_outcome,
        desired_outcomes=facts.desired_outcomes,
        student_age=facts.student_age,
        impacted_party_age=impacted_age,
        grade_level=facts.grade_level,
        school_setting=facts.school_setting,
        relationship_to_child=facts.relationship_to_child,
        iep_504_status=facts.iep_504_status,
        urgency_level=facts.urgency_level,
        safety_risk=facts.safety_risk,
        retaliation_concern=facts.retaliation_concern,
        prior_actions=facts.prior_actions,
        urgent=facts.urgent or facts.safety_risk or facts.urgency_level in {"urgent", "immediate"},
    )


def _latest_advocate_structured(session: CaseIntakeSession) -> dict:
    for message in reversed(session.messages):
        if message.role == "assistant" and message.structured:
            return message.structured
    return {}


def _apply_session_to_case(case: CaseRecord, session: CaseIntakeSession) -> CaseRecord:
    facts = session.facts
    manual_narrative = case.family_narrative if case.advocate_state.get("family_narrative_manual") else ""
    case.title = facts.title or case.title
    case.intake = _facts_to_intake(facts)
    if manual_narrative:
        case.family_narrative = manual_narrative
        case.intake.narrative = manual_narrative
        case.summary = manual_narrative[:280]
    else:
        case.summary = (facts.narrative or case.summary or "")[:280]
    structured = _latest_advocate_structured(session)
    narrative_patch = structured.get("family_narrative_patch") or facts.narrative
    if narrative_patch and not manual_narrative:
        case.family_narrative = narrative_patch
    case.advocate_state = {
        **case.advocate_state,
        "active_session_id": session.id,
        "confidence": session.confidence,
        "missing_facts": session.missing_fields,
        "issue_tags": session.issue_tags,
        "next_question": session.next_question,
        "suggested_actions": structured.get("suggested_actions", []),
        "route_suggestion": structured.get("route_suggestion", ""),
        "agent_run_ids": structured.get("agent_run_ids", []),
        "sources": structured.get("sources", []),
        "action_proposals": structured.get("action_proposals", []),
        "safety_flags": structured.get("safety_flags", []),
        "model_route": structured.get("model_route", {}),
        "trace_id": structured.get("trace_id", ""),
        "updated_by": "case_chat",
    }
    case.updated_at = utc_now()
    cases[case.id] = case
    return case


def _open_case_for_workspace(user: dict) -> CaseRecord | None:
    visible = [
        case for case in cases.values()
        if case.workspace_id == user["workspace_id"] and case.status != CaseStatus.ARCHIVED
    ]
    if not visible:
        return None
    visible.sort(key=lambda case: normalize_utc(case.updated_at), reverse=True)
    drafts = [case for case in visible if case.status == CaseStatus.DRAFT]
    return drafts[0] if drafts else visible[0]


def _create_draft_case(user: dict) -> CaseRecord:
    ensure_can_create_case(user)
    case = CaseRecord(
        id=str(uuid.uuid4())[:8],
        workspace_id=user["workspace_id"],
        title="Draft school case",
        status=CaseStatus.DRAFT,
        intake=CaseIntake(state="", issue_type="other", issue_categories=["other"]),
        summary="",
        family_narrative="",
        advocate_state={"created_by": "case_chat"},
        created_by=user["id"],
    )
    cases[case.id] = case
    return case


CASE_CHAT_OPENING_QUESTION = "What happened, and what are you most worried about right now?"


def _initial_case_chat_message() -> CaseIntakeMessage:
    return CaseIntakeMessage(
        role="assistant",
        content=(
            "Chat is ready for this case. Tell me what feels most important, and I will organize "
            "the facts, evidence gaps, and next useful step."
        ),
        structured={
            "next_question": CASE_CHAT_OPENING_QUESTION,
            "question_cards": [{
                "id": "start-story",
                "field": "family_narrative",
                "label": "Start with what happened",
                "question": CASE_CHAT_OPENING_QUESTION,
                "why": "This gives USDWatch enough context to begin organizing the case file.",
                "input_type": "free_text",
                "options": [],
                "priority": 1,
            }],
            "suggested_actions": [
                "Start with what happened in plain English.",
                "Add emails, records, screenshots, or notes to the Evidence Locker.",
            ],
            "route_suggestion": "",
        },
    )


def _case_advocate_session(case: CaseRecord, user: dict) -> CaseIntakeSession:
    sessions = [
        session for session in case_intake_sessions.values()
        if session.workspace_id == case.workspace_id
        and session.case_id == case.id
        and session.status == "active"
    ]
    sessions.sort(key=lambda session: normalize_utc(session.updated_at), reverse=True)
    if sessions:
        return sessions[0]

    session = CaseIntakeSession(
        id=str(uuid.uuid4())[:8],
        workspace_id=case.workspace_id,
        case_id=case.id,
        created_by=user["id"],
        draft_case_id=case.id,
        facts=_case_to_intake_facts(case),
        messages=[_initial_case_chat_message()],
        next_question=CASE_CHAT_OPENING_QUESTION,
    )
    case_intake_sessions[session.id] = session
    case.advocate_state = {**case.advocate_state, "active_session_id": session.id}
    case.updated_at = utc_now()
    cases[case.id] = case
    return session


def _clear_case_chat_session(case: CaseRecord, user: dict) -> CaseIntakeSession:
    session = _case_advocate_session(case, user)
    now = utc_now()
    session.messages = [_initial_case_chat_message()]
    session.facts = _case_to_intake_facts(case)
    session.confidence = {}
    session.missing_fields = []
    session.issue_tags = case.intake.issue_categories or ([case.intake.issue_type] if case.intake.issue_type else [])
    session.next_question = CASE_CHAT_OPENING_QUESTION
    session.updated_at = now
    case_intake_sessions[session.id] = session
    opening = session.messages[0].structured
    case.advocate_state = {
        **case.advocate_state,
        "active_session_id": session.id,
        "confidence": {},
        "missing_facts": [],
        "issue_tags": session.issue_tags,
        "next_question": session.next_question,
        "suggested_actions": opening.get("suggested_actions", []),
        "route_suggestion": "",
        "agent_run_ids": [],
        "sources": [],
        "action_proposals": [],
        "safety_flags": [],
        "model_route": {},
        "trace_id": "",
        "chat_cleared_at": now.isoformat(),
        "updated_by": "case_chat_clear",
    }
    case.updated_at = now
    cases[case.id] = case
    return session


def _case_context_summary(case: CaseRecord, docs: list[CaseDocument]) -> dict:
    intake = case.intake
    return {
        "case_id": case.id,
        "title": case.title,
        "status": case.status,
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


def _advocate_evidence_sources(case: CaseRecord, query: str, *, limit: int = 4) -> list[dict]:
    """Case-scoped hybrid evidence retrieval for Advocate turns."""
    scoped_docs = _case_docs(case)
    if not scoped_docs:
        return []
    query = query.strip()
    keyword_docs = _filter_case_docs(scoped_docs, q=query, limit=limit) if query else scoped_docs[:limit]
    allowed_by_id = {doc.id: doc for doc in scoped_docs}
    scores: dict[str, float] = {}

    for rank, doc in enumerate(keyword_docs):
        scores[doc.id] = max(scores.get(doc.id, 0.0), 1.0 + (1.0 / (rank + 1)))

    if query:
        for doc in scoped_docs:
            keyword_score = _advocate_keyword_score(doc, query)
            if keyword_score > 0:
                scores[doc.id] = max(scores.get(doc.id, 0.0), 1.0 + keyword_score)

    if query:
        try:
            from app.services.qdrant_client import is_available, search_case_documents_semantic

            if is_available():
                for hit in search_case_documents_semantic(query, case.id, limit=max(limit * 4, 25)):
                    doc_id = hit.get("document_id")
                    if not doc_id or doc_id not in allowed_by_id:
                        continue
                    scores[doc_id] = max(scores.get(doc_id, 0.0), 2.0 + float(hit.get("_score") or 0.0))
        except Exception as exc:
            logger.warning("Advocate evidence retrieval unavailable for case %s: %s", case.id, exc)

    ranked_docs = sorted(
        (allowed_by_id[doc_id] for doc_id in scores),
        key=lambda doc: (scores.get(doc.id, 0.0), normalize_utc(doc.uploaded_at)),
        reverse=True,
    )[:limit]
    sources = []
    for doc in ranked_docs:
        preview = (doc.document_summary or doc.case_relevance or doc.extracted_text or doc.user_description or "").strip()
        preview = re.sub(r"\s+", " ", preview)[:320] if preview else "Evidence item in the case file."
        sources.append({
            "id": f"doc:{doc.id}",
            "type": "document",
            "label": doc.filename,
            "preview": preview,
            "confidence": min(scores.get(doc.id, 0.6) / 3.0, 0.95),
            "route": f"/cases/{case.id}/locker",
            "document_id": doc.id,
            "case_id": case.id,
        })
    return sources


def _case_advocate_context(case: CaseRecord, user: dict, content: str, *, intent: str = "") -> dict:
    docs = _case_docs(case)
    records = [
        request for request in kora_requests.values()
        if request.workspace_id == case.workspace_id and request.case_id == case.id
    ]
    gmail = [
        connection for connection in gmail_connections.values()
        if connection.workspace_id == case.workspace_id and connection.case_id == case.id
    ]
    return {
        "case": _case_context_summary(case, docs),
        "route_base": f"/cases/{case.id}",
        "user": {
            "id": user.get("id", ""),
            "workspace_id": user.get("workspace_id", ""),
            "role": user.get("role", ""),
        },
        "evidence_sources": _advocate_evidence_sources(case, content) if intent == "evidence_question" else [],
        "records": {
            "draft_count": len(records),
            "pending_count": len([item for item in records if item.status not in {"sent", "complete"}]),
        },
        "gmail": {
            "connections": len(gmail),
            "connected": any(connection.status == "connected" for connection in gmail),
        },
    }


def _chat_status_label(intent: str) -> str:
    if intent == "evidence_question":
        return "Searching evidence"
    if intent == "records_question":
        return "Checking records"
    if intent in {"case_summary", "case_question", "gap_question", "timeline_question"}:
        return "Checking the case file"
    if intent == "intake_answer":
        return "Updating the case file"
    return "Thinking"


def _update_case_chat_state(case: CaseRecord, session: CaseIntakeSession) -> CaseRecord:
    structured = _latest_advocate_structured(session)
    case.advocate_state = {
        **case.advocate_state,
        "active_session_id": session.id,
        "chat_intent": structured.get("intent", ""),
        "suggested_replies": structured.get("suggested_replies", []),
        "sources": structured.get("sources", []),
        "action_proposals": structured.get("action_proposals", []),
        "safety_flags": structured.get("safety_flags", []),
        "model_route": structured.get("model_route", {}),
        "trace_id": structured.get("trace_id", ""),
        "updated_by": "case_chat",
    }
    case.updated_at = utc_now()
    cases[case.id] = case
    return case


def _append_case_chat_turn(case: CaseRecord, user: dict, content: str, *, intent_hint: str = "") -> CaseIntakeSession:
    session = _case_advocate_session(case, user)
    session.messages.append(CaseIntakeMessage(role="user", content=content))
    intent = classify_case_chat_intent(content, intent_hint)
    context = {**_case_advocate_context(case, user, content, intent=intent), "intent": intent, "intent_hint": intent_hint}
    session = analyze_case_chat_session(session, context=context)
    session.case_id = case.id
    session.draft_case_id = case.id
    case_intake_sessions[session.id] = session
    if intent == "intake_answer":
        _apply_session_to_case(case, session)
    else:
        _update_case_chat_state(case, session)
    return session


def _append_advocate_turn(case: CaseRecord, user: dict, content: str) -> CaseIntakeSession:
    return _append_case_chat_turn(case, user, content)


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"


def _find_advocate_action(session: CaseIntakeSession, action_id: str) -> tuple[CaseIntakeMessage, int, dict]:
    for message in reversed(session.messages):
        actions = message.structured.get("action_proposals", []) if message.structured else []
        for index, action in enumerate(actions):
            if action.get("id") == action_id:
                return message, index, action
    raise HTTPException(status_code=404, detail="Chat action not found")


def _resolve_advocate_action(case: CaseRecord, user: dict, action_id: str, status: str) -> dict:
    session = _case_advocate_session(case, user)
    message, index, action = _find_advocate_action(session, action_id)
    if action.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Chat action is no longer pending")

    action = {**action, "status": status, "resolved_at": utc_now().isoformat()}
    executed = False
    if status == "approved" and action.get("type") == "update_family_narrative":
        narrative = str(action.get("payload", {}).get("narrative") or "").strip()
        if narrative:
            case.family_narrative = narrative
            case.intake.narrative = narrative
            case.summary = narrative[:280]
            case.advocate_state = {**case.advocate_state, "family_narrative_manual": True}
            case.updated_at = utc_now()
            cases[case.id] = case
            executed = True

    actions = list(message.structured.get("action_proposals", []))
    actions[index] = action
    message.structured = {**message.structured, "action_proposals": actions}
    session.updated_at = utc_now()
    case_intake_sessions[session.id] = session
    route = action.get("payload", {}).get("route", "")
    return {
        "action": action,
        "executed": executed,
        "route": route,
        "session": session.model_dump(mode="json"),
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

    return []


def _process_case_document_background(doc: CaseDocument, content: bytes) -> None:
    """Background task for case evidence ingestion."""
    try:
        current_doc = case_documents.get(doc.id, doc)
        current_doc.status = "processing"
        current_doc.processing_status = "processing"
        current_doc.error = None
        current_doc.failure_reason = None
        case_documents[current_doc.id] = current_doc
        process_document_bytes(current_doc, content)
    except Exception as exc:
        logger.exception("Case document processing failed for %s", doc.id)
        failed_doc = case_documents.get(doc.id, doc)
        failed_doc.status = "failed"
        failed_doc.processing_status = "failed"
        failed_doc.error = str(exc)
        failed_doc.failure_reason = str(exc)
        failed_doc.processed_at = utc_now()
        case_documents[failed_doc.id] = failed_doc


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
        "parent_story": case.family_narrative or case.intake.narrative,
        "desired_outcomes": desired,
        "what_usdwatch_sees": result.executive_summary if result else "Run a Case Read to generate a fuller case read.",
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
            "Run the first Case Read.",
            "Use the recommended records list to fill evidence gaps.",
        ],
        "support_preferences": case.support_consent.model_dump(mode="json"),
        "generated_at": utc_now().isoformat(),
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
            desired_outcome="Preserve the existing public advocacy resource while new private case workspaces are scoped to user workspaces.",
        ),
        summary="Seeded admin/demo case preserved during the free draft workspace rollout.",
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
    visible = visible_cases_for_user(user)
    visible.sort(key=lambda case: normalize_utc(case.updated_at), reverse=True)
    return visible


@router.post("/cases/draft", response_model=CaseRecord)
async def open_or_create_draft_case(user: dict = Depends(get_current_user)):
    existing = _open_case_for_workspace(user)
    if existing:
        return existing
    return _create_draft_case(user)


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
        family_narrative=body.narrative,
        created_by=user["id"],
    )
    cases[case.id] = case
    return case


@router.get("/cases/{case_id}", response_model=CaseRecord)
async def get_case(case_id: str, user: dict = Depends(get_current_user)):
    return _get_case(case_id, user)


@router.get("/cases/{case_id}/access", response_model=CaseAccessSummary)
async def get_case_access(case_id: str, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    return access_summary(user, case)


@router.get("/cases/{case_id}/shares")
async def list_case_shares(case_id: str, user: dict = Depends(get_current_user)):
    case = require_case_access(user, cases.get(case_id), "manage_sharing")
    collaborators = [
        public_grant(grant)
        for grant in case_share_grants.values()
        if grant.case_id == case.id and grant.status == CaseShareStatus.ACTIVE
    ]
    collaborators.sort(key=lambda item: item.get("email", ""))
    return {"case_id": case.id, "collaborators": collaborators}


@router.post("/cases/{case_id}/shares")
async def grant_case_share(
    case_id: str,
    body: CaseShareCreate,
    user: dict = Depends(get_current_user),
):
    case = require_case_access(user, cases.get(case_id), "manage_sharing")
    grant = grant_case_access_by_email(case, user, body.email, body.role)
    return {"grant": public_grant(grant)}


@router.patch("/cases/{case_id}/shares/{grant_id}")
async def update_case_share_role(
    case_id: str,
    grant_id: str,
    body: CaseShareRoleUpdate,
    user: dict = Depends(get_current_user),
):
    require_case_access(user, cases.get(case_id), "manage_sharing")
    grant = update_share_grant_role(case_id, grant_id, body.role)
    return public_grant(grant)


@router.delete("/cases/{case_id}/shares/{grant_id}")
async def revoke_case_share(
    case_id: str,
    grant_id: str,
    user: dict = Depends(get_current_user),
):
    require_case_access(user, cases.get(case_id), "manage_sharing")
    grant = revoke_share_grant(case_id, grant_id)
    return public_grant(grant)


@router.patch("/cases/{case_id}", response_model=CaseRecord)
async def update_case(case_id: str, body: CaseUpdate, user: dict = Depends(get_current_user)):
    case = require_case_access(user, cases.get(case_id), "edit")
    if body.title is not None:
        case.title = body.title.strip() or case.title
    if body.summary is not None:
        case.summary = body.summary[:280]
    if body.family_narrative is not None:
        case.family_narrative = body.family_narrative
        case.intake.narrative = body.family_narrative
        case.summary = body.family_narrative[:280]
        case.advocate_state = {**case.advocate_state, "family_narrative_manual": True}
    if body.desired_outcome is not None:
        case.intake.desired_outcome = body.desired_outcome.strip()
    if body.desired_outcomes is not None:
        case.intake.desired_outcomes = [item.strip() for item in body.desired_outcomes if item.strip()]
    if body.intake is not None:
        case.intake = body.intake
    if body.advocate_state is not None:
        case.advocate_state = {**case.advocate_state, **body.advocate_state}
    case.updated_at = utc_now()
    cases[case.id] = case
    return case


@router.post("/cases/{case_id}/draft-assist", response_model=CaseDraftAssistResponse)
async def case_draft_assist(
    case_id: str,
    body: CaseDraftAssistRequest,
    user: dict = Depends(get_current_user),
):
    case = require_case_access(user, cases.get(case_id), "edit")
    try:
        result = draft_case_text(case, _case_docs(case), body.target)  # type: ignore[arg-type]
    except CaseDraftSourceMissing as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CaseDraftAssistResponse(**result)


@router.post("/cases/{case_id}/activate", response_model=CaseRecord)
async def activate_case(case_id: str, user: dict = Depends(get_current_user)):
    case = require_case_access(user, cases.get(case_id), "edit")
    if case.status == CaseStatus.DRAFT:
        case.status = CaseStatus.ACTIVE
        case.updated_at = utc_now()
        cases[case.id] = case
    return case


@router.get("/cases/{case_id}/advocate/session", response_model=CaseIntakeSession)
async def get_case_advocate_session(case_id: str, user: dict = Depends(get_current_user)):
    case = require_case_access(user, cases.get(case_id), "edit")
    return _case_advocate_session(case, user)


@router.get("/cases/{case_id}/chat/session", response_model=CaseIntakeSession)
async def get_case_chat_session(case_id: str, user: dict = Depends(get_current_user)):
    return await get_case_advocate_session(case_id, user)


@router.post("/cases/{case_id}/advocate/session/clear", response_model=CaseIntakeSession)
async def clear_case_advocate_session(case_id: str, user: dict = Depends(get_current_user)):
    case = require_case_access(user, cases.get(case_id), "edit")
    return _clear_case_chat_session(case, user)


@router.post("/cases/{case_id}/chat/session/clear", response_model=CaseIntakeSession)
async def clear_case_chat_session(case_id: str, user: dict = Depends(get_current_user)):
    return await clear_case_advocate_session(case_id, user)


@router.post("/cases/{case_id}/advocate/messages", response_model=CaseIntakeSession)
async def append_case_advocate_message(
    case_id: str,
    body: CaseIntakeMessageCreate,
    user: dict = Depends(get_current_user),
):
    case = require_case_access(user, cases.get(case_id), "edit")
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    return _append_advocate_turn(case, user, content)


@router.post("/cases/{case_id}/chat/messages", response_model=CaseIntakeSession)
async def append_case_chat_message(
    case_id: str,
    body: CaseChatTurnRequest,
    user: dict = Depends(get_current_user),
):
    case = require_case_access(user, cases.get(case_id), "edit")
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    return _append_case_chat_turn(case, user, content, intent_hint=body.intent_hint)


def _case_chat_stream(case: CaseRecord, user: dict, content: str, *, intent_hint: str = ""):
    intent = classify_case_chat_intent(content, intent_hint)
    yield _sse("status", {"status": "working", "label": _chat_status_label(intent), "intent": intent})
    try:
        session = _append_case_chat_turn(case, user, content, intent_hint=intent_hint)
        structured = _latest_advocate_structured(session)
        latest_message = session.messages[-1] if session.messages else None
        content_text = latest_message.content if latest_message else ""
        message_payload = {
            "delta": content_text,
            "content": content_text,
            "message_parts": structured.get("message_parts", []),
            "suggested_replies": structured.get("suggested_replies", []),
            "case_update_proposals": structured.get("case_update_proposals", []),
            "trace_id": structured.get("trace_id", ""),
            "model_route": structured.get("model_route", {}),
            "intent": structured.get("intent", intent),
        }
        yield _sse("message_delta", message_payload)
        yield _sse("message", message_payload)
        for source in structured.get("sources", []):
            yield _sse("source", source)
        for action in structured.get("action_proposals", []):
            yield _sse("action", action)
        for flag in structured.get("safety_flags", []):
            yield _sse("safety", flag)
        yield _sse("complete", {"session": session.model_dump(mode="json")})
    except Exception as exc:
        logger.exception("Case chat stream failed for case %s", case.id)
        yield _sse("error", {"detail": str(exc) or "Case chat failed"})


@router.post("/cases/{case_id}/chat/messages/stream")
async def append_case_chat_message_stream(
    case_id: str,
    body: CaseChatTurnRequest,
    user: dict = Depends(get_current_user),
):
    case = require_case_access(user, cases.get(case_id), "edit")
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    return StreamingResponse(
        _case_chat_stream(case, user, content, intent_hint=body.intent_hint),
        media_type="text/event-stream",
    )


@router.post("/cases/{case_id}/advocate/messages/stream")
async def append_case_advocate_message_stream(
    case_id: str,
    body: CaseIntakeMessageCreate,
    user: dict = Depends(get_current_user),
):
    case = require_case_access(user, cases.get(case_id), "edit")
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    return StreamingResponse(_case_chat_stream(case, user, content), media_type="text/event-stream")


@router.post("/cases/{case_id}/advocate/actions/{action_id}/approve")
async def approve_case_advocate_action(
    case_id: str,
    action_id: str,
    user: dict = Depends(get_current_user),
):
    case = require_case_access(user, cases.get(case_id), "edit")
    return _resolve_advocate_action(case, user, action_id, "approved")


@router.post("/cases/{case_id}/chat/actions/{action_id}/approve")
async def approve_case_chat_action(
    case_id: str,
    action_id: str,
    user: dict = Depends(get_current_user),
):
    return await approve_case_advocate_action(case_id, action_id, user)


@router.post("/cases/{case_id}/advocate/actions/{action_id}/reject")
async def reject_case_advocate_action(
    case_id: str,
    action_id: str,
    user: dict = Depends(get_current_user),
):
    case = require_case_access(user, cases.get(case_id), "edit")
    return _resolve_advocate_action(case, user, action_id, "rejected")


@router.post("/cases/{case_id}/chat/actions/{action_id}/reject")
async def reject_case_chat_action(
    case_id: str,
    action_id: str,
    user: dict = Depends(get_current_user),
):
    return await reject_case_advocate_action(case_id, action_id, user)


@router.get("/cases/{case_id}/file")
async def get_case_file(case_id: str, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    return _load_legacy_case_file(case)


@router.get("/cases/{case_id}/documents", response_model=list[CaseDocument])
async def list_case_documents(
    case_id: str,
    q: str = "",
    status: str = "",
    category: str = "",
    tag: str = "",
    sort: str = Query(default="uploaded_at"),
    direction: str = Query(default="desc"),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user),
):
    case = require_case_access(user, cases.get(case_id), "view")
    return _filter_case_docs(
        _case_docs(case),
        q=q,
        status=status,
        category=category,
        tag=tag,
        sort=sort,
        direction=direction,
        limit=limit,
        offset=offset,
    )


@router.get("/cases/{case_id}/documents/search")
async def search_case_documents(
    case_id: str,
    q: str = Query(default="", min_length=1),
    status: str = "",
    category: str = "",
    tag: str = "",
    limit: int = Query(default=75, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    """Hybrid evidence search: keyword matches plus case-scoped vector matches."""
    case = require_case_access(user, cases.get(case_id), "view")
    query = q.strip()
    scoped_docs = _filter_case_docs(
        _case_docs(case),
        status=status,
        category=category,
        tag=tag,
        limit=500,
    )
    if not query:
        return {
            "documents": scoped_docs[:limit],
            "mode": "filters",
            "semantic_available": False,
            "semantic_hits": 0,
        }

    keyword_docs = _filter_case_docs(scoped_docs, q=query, limit=limit)
    allowed_by_id = {doc.id: doc for doc in scoped_docs}
    scores: dict[str, float] = {}
    score_reasons: dict[str, set[str]] = {}

    for rank, doc in enumerate(keyword_docs):
        scores[doc.id] = max(scores.get(doc.id, 0.0), 1.0 + (1.0 / (rank + 1)))
        score_reasons.setdefault(doc.id, set()).add("keyword")

    semantic_available = False
    semantic_hits = 0
    try:
        from app.services.qdrant_client import is_available, search_case_documents_semantic

        semantic_available = is_available()
        for hit in search_case_documents_semantic(query, case.id, limit=max(limit * 4, 50)):
            doc_id = hit.get("document_id")
            if not doc_id or doc_id not in allowed_by_id:
                continue
            semantic_hits += 1
            semantic_score = float(hit.get("_score") or 0.0)
            scores[doc_id] = max(scores.get(doc_id, 0.0), 2.0 + semantic_score)
            score_reasons.setdefault(doc_id, set()).add("meaning")
    except Exception as exc:
        logger.warning("Evidence semantic search unavailable for case %s: %s", case.id, exc)

    ranked_docs = sorted(
        (allowed_by_id[doc_id] for doc_id in scores),
        key=lambda doc: (scores.get(doc.id, 0.0), normalize_utc(doc.uploaded_at)),
        reverse=True,
    )
    return {
        "documents": ranked_docs[:limit],
        "mode": "hybrid",
        "semantic_available": semantic_available,
        "semantic_hits": semantic_hits,
        "match_reasons": {doc_id: sorted(reasons) for doc_id, reasons in score_reasons.items()},
    }


@router.post("/cases/{case_id}/documents", response_model=CaseDocument)
async def upload_case_document(
    case_id: str,
    bg: BackgroundTasks,
    file: UploadFile = File(...),
    evidence_type: str = Form(default=""),
    user_description: str = Form(default=""),
    document_date: str | None = Form(default=None),
    source_person: str = Form(default=""),
    user: dict = Depends(get_current_user),
):
    case = require_case_access(user, cases.get(case_id), "upload_evidence")
    ensure_can_upload_document(user, case.id)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    validate_evidence_upload(file.filename or "", content)

    mime_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    doc = CaseDocument(
        id=str(uuid.uuid4())[:8],
        workspace_id=case.workspace_id,
        case_id=case.id,
        filename=file.filename or "unknown",
        file_type=normalize_file_type(file.filename or "", mime_type),
        file_size=len(content),
        mime_type=mime_type,
        content_sha256=hashlib.sha256(content).hexdigest(),
        evidence_type=evidence_type,
        user_description=user_description,
        document_date=document_date,
        source_person=source_person,
        source="case_evaluation_upload",
        status="processing",
        processing_status="uploaded",
    )
    category, confidence, tags, inferred_type = infer_document_metadata(doc.filename, evidence_type=doc.evidence_type)
    doc.inferred_category = category
    doc.category_confidence = confidence
    doc.tags = tags
    if not doc.evidence_type:
        doc.evidence_type = inferred_type
    doc.storage_path = save_case_document_file(doc.workspace_id, doc.case_id, doc.id, doc.filename, content)
    case_documents[doc.id] = doc
    bg.add_task(_process_case_document_background, doc, content)
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
    case = require_case_access(user, cases.get(case_id), "run_case_read")
    entitlements = ensure_can_run_evaluation(user, case.id)
    if case.status == CaseStatus.DRAFT:
        case.status = CaseStatus.ACTIVE
        case.updated_at = utc_now()
        cases[case.id] = case

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
    case = require_case_access(user, cases.get(case_id), "manage_support")
    case.support_consent = _consent_with_timestamp(body)
    case.updated_at = utc_now()
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
    queue.sort(key=lambda item: normalize_utc(item["updated_at"]), reverse=True)
    return queue
