from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import timedelta

from fastapi import HTTPException

from app.api._store import case_invitations, case_share_grants, cases
from app.models import (
    CaseAccessSummary,
    CaseInvitation,
    CaseInvitationStatus,
    CasePermissions,
    CaseRecord,
    CaseShareGrant,
    CaseShareRole,
    CaseShareStatus,
)
from app.services.gmail_security import frontend_public_url
from app.time import normalize_utc, utc_now

INVITATION_TTL_DAYS = 14
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

OWNER_ACTIONS = {
    "view",
    "edit",
    "upload_evidence",
    "delete_evidence",
    "run_case_read",
    "manage_records",
    "manage_sharing",
    "manage_support",
    "manage_gmail",
}
EDITOR_ACTIONS = {
    "view",
    "edit",
    "upload_evidence",
    "delete_evidence",
    "run_case_read",
    "manage_records",
}
VIEWER_ACTIONS = {"view"}


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def validate_invite_email(email: str) -> str:
    normalized = normalize_email(email)
    if not normalized or not EMAIL_RE.match(normalized):
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    return normalized


def normalize_share_role(role: CaseShareRole | str) -> CaseShareRole:
    try:
        parsed = role if isinstance(role, CaseShareRole) else CaseShareRole(str(role))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Role must be editor or viewer") from exc
    if parsed == CaseShareRole.OWNER:
        raise HTTPException(status_code=400, detail="Owner role cannot be granted by invitation")
    return parsed


def hash_invitation_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_invitation_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hash_invitation_token(token)


def _active_grants_for_case(case_id: str) -> list[CaseShareGrant]:
    return [
        grant for grant in case_share_grants.values()
        if grant.case_id == case_id and grant.status == CaseShareStatus.ACTIVE
    ]


def _user_matches_grant(user: dict, grant: CaseShareGrant) -> bool:
    email = normalize_email(user.get("email", ""))
    return bool(
        (grant.user_id and grant.user_id == user.get("id"))
        or (grant.clerk_user_id and grant.clerk_user_id == user.get("clerk_user_id"))
        or (grant.email and grant.email == email)
    )


def role_for_case(user: dict, case: CaseRecord | None) -> CaseShareRole | None:
    if not case:
        return None
    if case.workspace_id == user.get("workspace_id"):
        return CaseShareRole.OWNER
    for grant in _active_grants_for_case(case.id):
        if _user_matches_grant(user, grant):
            return grant.role
    return None


def permissions_for_role(role: CaseShareRole | None) -> CasePermissions:
    actions = set()
    if role == CaseShareRole.OWNER:
        actions = OWNER_ACTIONS
    elif role == CaseShareRole.EDITOR:
        actions = EDITOR_ACTIONS
    elif role == CaseShareRole.VIEWER:
        actions = VIEWER_ACTIONS
    return CasePermissions(
        can_view="view" in actions,
        can_edit="edit" in actions,
        can_upload_evidence="upload_evidence" in actions,
        can_delete_evidence="delete_evidence" in actions,
        can_run_case_read="run_case_read" in actions,
        can_manage_records="manage_records" in actions,
        can_manage_sharing="manage_sharing" in actions,
        can_manage_support="manage_support" in actions,
        can_manage_gmail="manage_gmail" in actions,
    )


def access_summary(user: dict, case: CaseRecord | None) -> CaseAccessSummary:
    role = role_for_case(user, case)
    return CaseAccessSummary(
        case_id=case.id if case else "",
        role=role,
        permissions=permissions_for_role(role),
    )


def can_access_case(user: dict, case: CaseRecord | None, action: str = "view") -> bool:
    role = role_for_case(user, case)
    permissions = permissions_for_role(role)
    return bool(getattr(permissions, f"can_{action}", False))


def require_case_access(user: dict, case: CaseRecord | None, action: str = "view") -> CaseRecord:
    if not case or role_for_case(user, case) is None:
        raise HTTPException(status_code=404, detail="Case not found")
    if not can_access_case(user, case, action):
        raise HTTPException(status_code=403, detail="You do not have permission to do that")
    return case


def visible_cases_for_user(user: dict) -> list[CaseRecord]:
    visible_by_id = {
        case.id: case
        for case in cases.values()
        if case.workspace_id == user.get("workspace_id")
    }
    for grant in case_share_grants.values():
        if grant.status != CaseShareStatus.ACTIVE or not _user_matches_grant(user, grant):
            continue
        case = cases.get(grant.case_id)
        if case:
            visible_by_id[case.id] = case
    return list(visible_by_id.values())


def public_grant(grant: CaseShareGrant) -> dict:
    return grant.model_dump(mode="json")


def public_invitation(invitation: CaseInvitation) -> dict:
    data = invitation.model_dump(mode="json")
    data.pop("token_hash", None)
    return data


def create_case_invitation(case: CaseRecord, user: dict, email: str, role: CaseShareRole | str) -> tuple[CaseInvitation, str, str]:
    normalized_email = validate_invite_email(email)
    parsed_role = normalize_share_role(role)
    owner_email = normalize_email(user.get("email", ""))
    if normalized_email == owner_email:
        raise HTTPException(status_code=400, detail="You already own this case")
    for grant in _active_grants_for_case(case.id):
        if grant.email == normalized_email:
            raise HTTPException(status_code=409, detail="That person already has access")

    token, token_hash = new_invitation_token()
    invitation = next(
        (
            item for item in case_invitations.values()
            if item.case_id == case.id
            and item.email == normalized_email
            and item.status == CaseInvitationStatus.PENDING
        ),
        None,
    )
    if invitation:
        invitation.role = parsed_role
        invitation.token_hash = token_hash
        invitation.expires_at = utc_now() + timedelta(days=INVITATION_TTL_DAYS)
        invitation.updated_at = utc_now()
    else:
        invitation = CaseInvitation(
            workspace_id=case.workspace_id,
            case_id=case.id,
            email=normalized_email,
            role=parsed_role,
            token_hash=token_hash,
            invited_by_user_id=user.get("id", ""),
            invited_by_email=owner_email,
            expires_at=utc_now() + timedelta(days=INVITATION_TTL_DAYS),
        )
    case_invitations[invitation.id] = invitation
    accept_url = f"{frontend_public_url()}/case-invitations/{token}"
    return invitation, token, accept_url


def accept_case_invitation(raw_token: str, user: dict) -> tuple[CaseInvitation, CaseShareGrant]:
    token_hash = hash_invitation_token(raw_token or "")
    invitation = next(
        (
            item for item in case_invitations.values()
            if item.token_hash and hmac.compare_digest(item.token_hash, token_hash)
        ),
        None,
    )
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.status == CaseInvitationStatus.ACCEPTED:
        raise HTTPException(status_code=409, detail="Invitation has already been used")
    if invitation.status == CaseInvitationStatus.REVOKED:
        raise HTTPException(status_code=410, detail="Invitation was revoked")
    if normalize_utc(invitation.expires_at) < utc_now():
        invitation.status = CaseInvitationStatus.EXPIRED
        invitation.updated_at = utc_now()
        case_invitations[invitation.id] = invitation
        raise HTTPException(status_code=410, detail="Invitation expired")
    if normalize_email(user.get("email", "")) != invitation.email:
        raise HTTPException(status_code=403, detail="Sign in with the invited email address")

    existing = next(
        (
            grant for grant in _active_grants_for_case(invitation.case_id)
            if _user_matches_grant(user, grant) or grant.email == invitation.email
        ),
        None,
    )
    if existing:
        grant = existing
        grant.role = invitation.role
        grant.user_id = user.get("id", "")
        grant.clerk_user_id = user.get("clerk_user_id", "")
        grant.email = invitation.email
        grant.updated_at = utc_now()
    else:
        grant = CaseShareGrant(
            workspace_id=invitation.workspace_id,
            case_id=invitation.case_id,
            user_id=user.get("id", ""),
            clerk_user_id=user.get("clerk_user_id", ""),
            email=invitation.email,
            role=invitation.role,
            invited_by_user_id=invitation.invited_by_user_id,
            invited_by_email=invitation.invited_by_email,
        )
    case_share_grants[grant.id] = grant
    invitation.status = CaseInvitationStatus.ACCEPTED
    invitation.accepted_at = utc_now()
    invitation.accepted_by_user_id = user.get("id", "")
    invitation.grant_id = grant.id
    invitation.updated_at = utc_now()
    case_invitations[invitation.id] = invitation
    return invitation, grant


def update_share_grant_role(case_id: str, grant_id: str, role: CaseShareRole | str) -> CaseShareGrant:
    grant = case_share_grants.get(grant_id)
    if not grant or grant.case_id != case_id or grant.status != CaseShareStatus.ACTIVE:
        raise HTTPException(status_code=404, detail="Collaborator not found")
    grant.role = normalize_share_role(role)
    grant.updated_at = utc_now()
    case_share_grants[grant.id] = grant
    return grant


def revoke_share_grant(case_id: str, grant_id: str) -> CaseShareGrant:
    grant = case_share_grants.get(grant_id)
    if not grant or grant.case_id != case_id or grant.status != CaseShareStatus.ACTIVE:
        raise HTTPException(status_code=404, detail="Collaborator not found")
    grant.status = CaseShareStatus.REVOKED
    grant.revoked_at = utc_now()
    grant.updated_at = utc_now()
    case_share_grants[grant.id] = grant
    return grant


def revoke_case_invitation(case_id: str, invitation_id: str) -> CaseInvitation:
    invitation = case_invitations.get(invitation_id)
    if not invitation or invitation.case_id != case_id:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.status == CaseInvitationStatus.PENDING:
        invitation.status = CaseInvitationStatus.REVOKED
        invitation.revoked_at = utc_now()
        invitation.updated_at = utc_now()
        case_invitations[invitation.id] = invitation
    return invitation
