from __future__ import annotations

from app.time import normalize_utc, utc_now

from datetime import datetime, timedelta

from fastapi import HTTPException

from app.api._store import case_documents, case_evaluations, cases
from app.models import CaseStatus, EntitlementSnapshot, EvaluationStatus, Workspace
from app.services.workspaces import entitlements_for_workspace


def _workspace(user: dict) -> Workspace:
    return Workspace(**user["workspace"])


def _entitlements(user: dict) -> EntitlementSnapshot:
    return entitlements_for_workspace(_workspace(user))


def ensure_can_create_case(user: dict) -> EntitlementSnapshot:
    entitlements = _entitlements(user)
    open_cases = [
        case for case in cases.values()
        if case.workspace_id == user["workspace_id"] and case.status in (CaseStatus.DRAFT, CaseStatus.ACTIVE)
    ]
    if len(open_cases) >= entitlements.max_active_cases:
        raise HTTPException(
            status_code=403,
            detail=f"Your {entitlements.plan.value} plan includes {entitlements.max_active_cases} draft or active case.",
        )
    return entitlements


def ensure_can_upload_document(user: dict, case_id: str) -> EntitlementSnapshot:
    entitlements = _entitlements(user)
    docs = [
        doc for doc in case_documents.values()
        if doc.workspace_id == user["workspace_id"] and doc.case_id == case_id
    ]
    if len(docs) >= entitlements.max_documents_per_case:
        raise HTTPException(
            status_code=403,
            detail=f"Your {entitlements.plan.value} plan includes {entitlements.max_documents_per_case} documents per case.",
        )
    return entitlements


def ensure_can_run_evaluation(user: dict, case_id: str) -> EntitlementSnapshot:
    entitlements = _entitlements(user)
    if entitlements.evaluation_refresh_days <= 0:
        return entitlements

    cutoff = utc_now() - timedelta(days=entitlements.evaluation_refresh_days)
    recent = [
        evaluation for evaluation in case_evaluations.values()
        if evaluation.workspace_id == user["workspace_id"]
        and evaluation.case_id == case_id
        and evaluation.status in (EvaluationStatus.QUEUED, EvaluationStatus.RUNNING, EvaluationStatus.COMPLETE)
        and normalize_utc(evaluation.created_at) >= cutoff
    ]
    if recent:
        raise HTTPException(
            status_code=403,
            detail=f"Your free Case Read can be refreshed every {entitlements.evaluation_refresh_days} days.",
        )
    return entitlements
