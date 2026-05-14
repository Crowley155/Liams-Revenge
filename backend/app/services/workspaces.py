from __future__ import annotations

from app.time import utc_now

import json
import os
import uuid
from datetime import datetime

from app.api._store import workspaces
from app.db import _connect
from app.models import AppUser, EntitlementSnapshot, Workspace, WorkspacePlan, WorkspaceType

LEGACY_CASE_ID = "crowley-v-usd232"
LEGACY_WORKSPACE_ID = "demo"


def _admin_emails() -> set[str]:
    raw = ",".join(
        v for v in [os.getenv("USDWATCH_ADMIN_EMAILS", ""), os.getenv("ADMIN_EMAIL", "")]
        if v
    )
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def _case_owner_emails() -> set[str]:
    raw = os.getenv("USDWATCH_CASE_OWNER_EMAILS", "")
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def _row_to_user(row) -> AppUser:
    data = json.loads(row["data"] or "{}")
    data.setdefault("id", row["id"])
    data.setdefault("email", row["email"])
    data.setdefault("role", row["role"])
    data.setdefault("clerk_user_id", row["clerk_user_id"] or "")
    data.setdefault("workspace_id", row["workspace_id"] or "")
    return AppUser(**data)


def _find_user(clerk_user_id: str, email: str) -> AppUser | None:
    conn = _connect()
    try:
        row = None
        if clerk_user_id:
            row = conn.execute(
                "SELECT id, email, role, clerk_user_id, workspace_id, data FROM users WHERE clerk_user_id = ?",
                (clerk_user_id,),
            ).fetchone()
        if row is None and email:
            row = conn.execute(
                "SELECT id, email, role, clerk_user_id, workspace_id, data FROM users WHERE email = ?",
                (email,),
            ).fetchone()
        return _row_to_user(row) if row else None
    finally:
        conn.close()


def _save_user(user: AppUser) -> None:
    data = json.dumps(user.model_dump(mode="json"))
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO users (id, email, password, role, clerk_user_id, workspace_id, data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                email=excluded.email,
                role=excluded.role,
                clerk_user_id=excluded.clerk_user_id,
                workspace_id=excluded.workspace_id,
                data=excluded.data
            """,
            (user.id, user.email, "", user.role, user.clerk_user_id, user.workspace_id, data),
        )
        conn.commit()
    finally:
        conn.close()


def _claim_legacy_case_for_owner(user: AppUser, workspace: Workspace) -> None:
    if not user.email or user.email.lower() not in _case_owner_emails():
        return

    from app.api._store import (
        agent_runs,
        case_documents,
        case_evaluations,
        cases,
        entities,
        jobs,
        kora_requests,
        profiles,
        records_requests,
        usage_events,
    )

    case = cases.get(LEGACY_CASE_ID)
    if case and case.workspace_id != workspace.id:
        case.workspace_id = workspace.id
        case.created_by = case.created_by or user.id
        case.updated_at = utc_now()
        cases[case.id] = case

    for store in (
        profiles,
        entities,
        jobs,
        kora_requests,
        records_requests,
        case_documents,
        case_evaluations,
        agent_runs,
        usage_events,
    ):
        for item_id, item in list(store.items()):
            if getattr(item, "case_id", "") != LEGACY_CASE_ID:
                continue
            if getattr(item, "workspace_id", "") == workspace.id:
                continue
            item.workspace_id = workspace.id
            if hasattr(item, "updated_at"):
                item.updated_at = utc_now()
            store[item_id] = item


def _workspace_for_org(clerk_org_id: str, org_name: str = "") -> Workspace:
    found = workspaces.find_by(clerk_org_id=clerk_org_id)
    if found:
        workspace = found[0]
        if org_name and workspace.name != org_name:
            workspace.name = org_name
            workspace.updated_at = utc_now()
            workspaces[workspace.id] = workspace
        return workspace

    workspace = Workspace(
        id=str(uuid.uuid4())[:8],
        name=org_name or "Organization workspace",
        type=WorkspaceType.ORGANIZATION,
        plan=WorkspacePlan.ORGANIZATION,
        clerk_org_id=clerk_org_id,
    )
    workspaces[workspace.id] = workspace
    return workspace


def _workspace_for_personal_user(user: AppUser, email: str) -> Workspace:
    if user.workspace_id:
        existing = workspaces.get(user.workspace_id)
        if existing:
            return existing

    workspace = Workspace(
        id=str(uuid.uuid4())[:8],
        name=f"{email or 'Personal'} workspace",
        type=WorkspaceType.PERSONAL,
        plan=WorkspacePlan.FREE,
        owner_user_id=user.id,
    )
    workspaces[workspace.id] = workspace
    return workspace


def resolve_user_workspace(
    *,
    clerk_user_id: str,
    email: str = "",
    clerk_org_id: str = "",
    clerk_org_name: str = "",
) -> dict:
    """Upsert the app user and active workspace from Clerk claims."""
    normalized_email = (email or "").lower().strip()
    existing = _find_user(clerk_user_id, normalized_email)
    elevated_emails = _case_owner_emails() | _admin_emails()
    role = "admin" if normalized_email in elevated_emails else (existing.role if existing else "member")
    user = existing or AppUser(
        id=str(uuid.uuid4())[:8],
        clerk_user_id=clerk_user_id,
        email=normalized_email,
        role=role,
        workspace_id="",
    )

    user.clerk_user_id = clerk_user_id
    user.email = normalized_email or user.email
    user.role = role
    user.updated_at = utc_now()

    if clerk_org_id:
        workspace = _workspace_for_org(clerk_org_id, clerk_org_name)
        user.org_workspace_id = workspace.id
    else:
        workspace = _workspace_for_personal_user(user, normalized_email)

    user.workspace_id = workspace.id
    if user.role == "admin" and workspace.plan == WorkspacePlan.FREE:
        workspace.plan = WorkspacePlan.ADMIN
        workspaces[workspace.id] = workspace
    _claim_legacy_case_for_owner(user, workspace)
    _save_user(user)

    return {
        "id": user.id,
        "clerk_user_id": user.clerk_user_id,
        "email": user.email,
        "role": user.role,
        "workspace_id": workspace.id,
        "workspace": workspace.model_dump(mode="json"),
        "plan": workspace.plan.value,
    }


def entitlements_for_workspace(workspace: Workspace | dict) -> EntitlementSnapshot:
    plan = workspace.get("plan") if isinstance(workspace, dict) else workspace.plan
    if isinstance(plan, str):
        plan = WorkspacePlan(plan)

    if plan == WorkspacePlan.ADMIN:
        return EntitlementSnapshot(
            plan=plan,
            max_active_cases=1000,
            max_documents_per_case=1000,
            evaluation_refresh_days=0,
            premium_review=True,
            organization_workspace=True,
        )
    if plan == WorkspacePlan.ORGANIZATION:
        return EntitlementSnapshot(
            plan=plan,
            max_active_cases=50,
            max_documents_per_case=100,
            evaluation_refresh_days=0,
            premium_review=True,
            organization_workspace=True,
        )
    if plan == WorkspacePlan.PREMIUM:
        return EntitlementSnapshot(
            plan=plan,
            max_active_cases=5,
            max_documents_per_case=50,
            evaluation_refresh_days=7,
            premium_review=True,
        )
    return EntitlementSnapshot()
