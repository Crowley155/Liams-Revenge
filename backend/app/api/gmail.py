from __future__ import annotations

from app.time import utc_now

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api._store import cases, gmail_connections
from app.api.deps import get_current_user
from app.models import GmailConnection, GmailImportRule, GmailImportRun
from app.services.case_access import require_case_access
from app.services.clerk_oauth import (
    ClerkOAuthConsentRequired,
    ClerkOAuthError,
    clerk_oauth_configured,
    fetch_clerk_google_oauth_token,
)
from app.services.gmail_importer import (
    GMAIL_READONLY_SCOPE,
    GmailImportError,
    build_gmail_query,
    gmail_user_profile,
    import_matching_messages,
    list_matching_messages,
)

router = APIRouter(tags=["gmail"])


class GmailRuleRequest(BaseModel):
    case_id: str
    domains: list[str] = Field(default_factory=list)
    email_addresses: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    include_attachments: bool = True


class GmailConnectRequest(BaseModel):
    case_id: str


class GmailSearchRequest(BaseModel):
    case_id: str
    connection_id: str = ""
    query: str = ""
    max_results: int = Field(default=25, ge=1, le=100)


class GmailImportRequest(BaseModel):
    case_id: str
    connection_id: str = ""
    message_ids: list[str] = Field(default_factory=list)
    query: str = ""
    max_results: int = Field(default=25, ge=1, le=100)


def _get_case(case_id: str, user: dict):
    case = cases.get(case_id)
    return require_case_access(user, case, "manage_gmail")


def _connections_for(user: dict, case_id: str = "") -> list[GmailConnection]:
    if case_id:
        case = cases.get(case_id)
        if not case:
            return []
        return [
            item for item in gmail_connections.values()
            if item.case_id == case.id and item.workspace_id == case.workspace_id
        ]
    return [
        item for item in gmail_connections.values()
        if item.workspace_id == user["workspace_id"]
    ]


def _connection_for_case(case_id: str, user: dict, connection_id: str = "") -> GmailConnection:
    if connection_id:
        connection = gmail_connections.get(connection_id)
        case = cases.get(case_id)
        if not connection or not case or connection.workspace_id != case.workspace_id or connection.case_id != case_id:
            raise HTTPException(status_code=404, detail="Gmail connection not found")
        return connection
    connections = _connections_for(user, case_id)
    if not connections:
        raise HTTPException(status_code=404, detail="Gmail connection not found")
    return connections[0]


def _public_connection(connection: GmailConnection) -> dict:
    data = connection.model_dump(mode="json")
    query = build_gmail_query(connection.rule)
    data["connected"] = connection.status == "connected"
    data["token_stored"] = False
    data["query"] = query
    data["has_rule"] = bool(query)
    data["rule_counts"] = {
        "domains": len(connection.rule.domains),
        "email_addresses": len(connection.rule.email_addresses),
        "keywords": len(connection.rule.keywords),
    }
    return data


def _new_connection(case, rule: GmailImportRule) -> GmailConnection:
    return GmailConnection(
        id=str(uuid.uuid4())[:8],
        workspace_id=case.workspace_id,
        case_id=case.id,
        status="needs_consent" if clerk_oauth_configured() else "setup_required",
        scopes=[GMAIL_READONLY_SCOPE],
        rule=rule,
    )


def _mark_connection_issue(connection: GmailConnection, status: str, message: str) -> None:
    connection.status = status
    connection.error = message
    connection.updated_at = utc_now()
    gmail_connections[connection.id] = connection


def _sync_connection_from_clerk(connection: GmailConnection, user: dict, *, raise_on_missing: bool = False) -> str:
    if connection.status == "disconnected":
        if raise_on_missing:
            raise HTTPException(status_code=409, detail="Reconnect Gmail before searching or importing messages")
        return ""
    if not clerk_oauth_configured():
        _mark_connection_issue(connection, "setup_required", "Gmail import needs CLERK_SECRET_KEY on the backend.")
        if raise_on_missing:
            raise HTTPException(status_code=503, detail=connection.error)
        return ""

    try:
        token_info = fetch_clerk_google_oauth_token(
            str(user.get("clerk_user_id") or ""),
            required_scope=GMAIL_READONLY_SCOPE,
        )
        access_token = str(token_info.get("token") or "")
        if not access_token:
            raise ClerkOAuthConsentRequired("Grant read-only Gmail access from your USDWatch account before importing messages.")
        profile = gmail_user_profile(access_token)
    except ClerkOAuthConsentRequired as exc:
        _mark_connection_issue(connection, "needs_consent", str(exc))
        if raise_on_missing:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return ""
    except ClerkOAuthError as exc:
        _mark_connection_issue(connection, "error", str(exc))
        if raise_on_missing:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return ""
    except GmailImportError as exc:
        _mark_connection_issue(connection, "error", str(exc))
        if raise_on_missing:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return ""

    connection.google_email = str(profile.get("emailAddress") or connection.google_email or "")
    connection.last_history_id = str(profile.get("historyId") or connection.last_history_id or "")
    connection.clerk_external_account_id = str(token_info.get("external_account_id") or connection.clerk_external_account_id or "")
    connection.scopes = [str(scope) for scope in token_info.get("scopes") or [GMAIL_READONLY_SCOPE]]
    connection.status = "connected"
    connection.error = ""
    connection.connected_at = connection.connected_at or utc_now()
    connection.disconnected_at = None
    connection.updated_at = utc_now()
    gmail_connections[connection.id] = connection
    return access_token


@router.get("/gmail/status")
async def gmail_status(case_id: str = "", user: dict = Depends(get_current_user)):
    if case_id:
        _get_case(case_id, user)
    connections = _connections_for(user, case_id)
    for connection in connections:
        if connection.status in {"needs_consent", "setup_required", "error"}:
            _sync_connection_from_clerk(connection, user)
    configured = clerk_oauth_configured()
    return {
        "configured": configured,
        "auth_provider": "clerk",
        "required_scope": GMAIL_READONLY_SCOPE,
        "connections": [_public_connection(connection) for connection in connections],
        "message": (
            "Gmail uses your Clerk-connected Google account with read-only Gmail permission."
            if configured
            else "Gmail import needs CLERK_SECRET_KEY on the backend."
        ),
    }


@router.put("/gmail/rule")
async def save_gmail_import_rule(body: GmailRuleRequest, user: dict = Depends(get_current_user)):
    case = _get_case(body.case_id, user)
    rule = GmailImportRule(
        domains=sorted({item.strip().lower().lstrip("@") for item in body.domains if item.strip()}),
        email_addresses=sorted({item.strip().lower() for item in body.email_addresses if item.strip()}),
        keywords=[item.strip() for item in body.keywords if item.strip()],
        include_attachments=body.include_attachments,
    )
    existing = _connections_for(user, case.id)
    if existing:
        connection = existing[0]
        connection.rule = rule
        if connection.status == "setup_required" and clerk_oauth_configured():
            connection.status = "needs_consent"
        connection.updated_at = utc_now()
    else:
        connection = _new_connection(case, rule)
    gmail_connections[connection.id] = connection
    return {"connection": _public_connection(connection)}


@router.delete("/gmail/rule")
async def clear_gmail_import_rule(case_id: str, user: dict = Depends(get_current_user)):
    case = _get_case(case_id, user)
    existing = _connections_for(user, case.id)
    connection = existing[0] if existing else _new_connection(case, GmailImportRule())
    connection.rule = GmailImportRule()
    if connection.status == "setup_required" and clerk_oauth_configured():
        connection.status = "needs_consent"
    connection.updated_at = utc_now()
    gmail_connections[connection.id] = connection
    return {"connection": _public_connection(connection)}


@router.post("/gmail/connect")
async def connect_gmail(body: GmailConnectRequest, user: dict = Depends(get_current_user)):
    case = _get_case(body.case_id, user)
    existing = _connections_for(user, case.id)
    connection = existing[0] if existing else _new_connection(case, GmailImportRule())
    if connection.status == "disconnected":
        connection.status = "needs_consent"
    gmail_connections[connection.id] = connection
    _sync_connection_from_clerk(connection, user, raise_on_missing=True)
    return {"connection": _public_connection(connection)}


@router.post("/gmail/search")
async def search_gmail(body: GmailSearchRequest, user: dict = Depends(get_current_user)):
    case = _get_case(body.case_id, user)
    connection = _connection_for_case(body.case_id, user, body.connection_id)
    access_token = _sync_connection_from_clerk(connection, user, raise_on_missing=True)
    try:
        return list_matching_messages(connection, access_token=access_token, max_results=body.max_results, query=body.query, case=case)
    except GmailImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gmail/import", response_model=GmailImportRun)
async def import_gmail(body: GmailImportRequest, user: dict = Depends(get_current_user)):
    case = _get_case(body.case_id, user)
    connection = _connection_for_case(body.case_id, user, body.connection_id)
    access_token = _sync_connection_from_clerk(connection, user, raise_on_missing=True)
    try:
        return import_matching_messages(
            connection,
            case,
            access_token=access_token,
            message_ids=body.message_ids,
            max_results=body.max_results,
            query=body.query,
        )
    except GmailImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gmail/sync", response_model=GmailImportRun)
async def sync_gmail(body: GmailImportRequest, user: dict = Depends(get_current_user)):
    return await import_gmail(body, user)


@router.post("/gmail/disconnect")
async def disconnect_gmail(case_id: str, user: dict = Depends(get_current_user)):
    _get_case(case_id, user)
    disconnected = 0
    for connection in _connections_for(user, case_id):
        connection.status = "disconnected"
        connection.google_email = ""
        connection.clerk_external_account_id = ""
        connection.last_history_id = ""
        connection.disconnected_at = utc_now()
        connection.updated_at = utc_now()
        gmail_connections[connection.id] = connection
        disconnected += 1
    return {
        "ok": True,
        "disconnected": disconnected,
        "revoked": 0,
        "message": "Gmail import is disconnected for this case. Revoke Google access from account settings if you want to remove the Google grant.",
    }
