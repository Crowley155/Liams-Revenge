from __future__ import annotations

from app.time import utc_now

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.ai_runtime.intake import analyze_intake_session
from app.api._store import case_intake_sessions, cases
from app.api.deps import get_current_user
from app.models import (
    CaseIntake,
    CaseIntakeCreateCaseRequest,
    CaseIntakeFacts,
    CaseIntakeFactsPatch,
    CaseIntakeMessage,
    CaseIntakeMessageCreate,
    CaseIntakeSession,
    CaseRecord,
    CaseStatus,
    SupportConsent,
)
from app.services.entitlements import ensure_can_create_case

router = APIRouter(tags=["case intake"])


def _visible_session(session: CaseIntakeSession, user: dict) -> bool:
    return session.workspace_id == user["workspace_id"]


def _get_session(session_id: str, user: dict) -> CaseIntakeSession:
    session = case_intake_sessions.get(session_id)
    if not session or not _visible_session(session, user):
        raise HTTPException(status_code=404, detail="Intake session not found")
    return session


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


@router.post("/intake/sessions", response_model=CaseIntakeSession)
async def create_intake_session(user: dict = Depends(get_current_user)):
    session = CaseIntakeSession(
        id=str(uuid.uuid4())[:8],
        workspace_id=user["workspace_id"],
        created_by=user["id"],
        messages=[
            CaseIntakeMessage(
                role="assistant",
                content=(
                    "Tell USDWatch what happened in your own words. I will organize the facts, "
                    "ask what matters next, and help build your first case file."
                ),
            )
        ],
        next_question="What happened, and what worries you most right now?",
    )
    case_intake_sessions[session.id] = session
    return session


@router.get("/intake/sessions/{session_id}", response_model=CaseIntakeSession)
async def get_intake_session(session_id: str, user: dict = Depends(get_current_user)):
    return _get_session(session_id, user)


@router.post("/intake/sessions/{session_id}/messages", response_model=CaseIntakeSession)
async def append_intake_message(
    session_id: str,
    body: CaseIntakeMessageCreate,
    user: dict = Depends(get_current_user),
):
    session = _get_session(session_id, user)
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    session.messages.append(CaseIntakeMessage(role="user", content=content))
    session = analyze_intake_session(session)
    case_intake_sessions[session.id] = session
    return session


@router.patch("/intake/sessions/{session_id}/facts", response_model=CaseIntakeSession)
async def update_intake_facts(
    session_id: str,
    body: CaseIntakeFactsPatch,
    user: dict = Depends(get_current_user),
):
    session = _get_session(session_id, user)
    clean_patch = {key: value for key, value in body.facts.items() if hasattr(session.facts, key)}
    current = session.facts.model_dump()
    current.update(clean_patch)
    session.facts = CaseIntakeFacts(**current)
    session.user_overrides.update(clean_patch)
    session.updated_at = utc_now()
    case_intake_sessions[session.id] = session
    return session


@router.post("/intake/sessions/{session_id}/create-case", response_model=CaseRecord)
async def create_case_from_intake(
    session_id: str,
    body: CaseIntakeCreateCaseRequest,
    user: dict = Depends(get_current_user),
):
    session = _get_session(session_id, user)
    ensure_can_create_case(user)
    support_consent = _consent_with_timestamp(body.support_consent)
    facts = session.facts
    title = facts.title or facts.district or facts.school or "School case"
    case = CaseRecord(
        id=str(uuid.uuid4())[:8],
        workspace_id=user["workspace_id"],
        title=title.strip() or "School case",
        status=CaseStatus.ACTIVE,
        intake=_facts_to_intake(facts),
        support_consent=support_consent,
        summary=(facts.narrative or "")[:280],
        created_by=user["id"],
    )
    cases[case.id] = case
    session.status = "case_created"
    session.draft_case_id = case.id
    session.updated_at = utc_now()
    case_intake_sessions[session.id] = session
    return case
