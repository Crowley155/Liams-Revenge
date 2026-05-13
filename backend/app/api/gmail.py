from __future__ import annotations

from app.time import normalize_utc, utc_now

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.api._store import cases, gmail_connections, gmail_import_runs
from app.api.deps import get_current_user
from app.models import GmailConnection, GmailImportRule, GmailImportRun
from app.services.case_access import require_case_access
from app.services.gmail_importer import (
    GMAIL_READONLY_SCOPE,
    GmailImportError,
    authorization_url,
    exchange_code_for_tokens,
    gmail_redirect_for,
    import_matching_messages,
    list_matching_messages,
    revoke_connection_token,
    store_refresh_token,
)
from app.services.gmail_security import (
    has_google_oauth_config,
    new_oauth_state,
    state_matches,
    token_encryption_configured,
)

router = APIRouter(tags=["gmail beta"])


class GmailRuleRequest(BaseModel):
    case_id: str
    domains: list[str] = Field(default_factory=list)
    email_addresses: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    include_attachments: bool = True
    auto_sync: bool = False


class GmailOAuthStartRequest(BaseModel):
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
    for secret_field in ("encrypted_refresh_token", "oauth_state_hash"):
        data.pop(secret_field, None)
    data["connected"] = connection.status == "connected"
    data["token_stored"] = bool(connection.encrypted_refresh_token)
    return data


def _new_connection(case, rule: GmailImportRule) -> GmailConnection:
    return GmailConnection(
        id=str(uuid.uuid4())[:8],
        workspace_id=case.workspace_id,
        case_id=case.id,
        status="setup_required" if not has_google_oauth_config() or not token_encryption_configured() else "disconnected",
        scopes=[GMAIL_READONLY_SCOPE],
        rule=rule,
    )


@router.get("/gmail/status")
async def gmail_status(case_id: str = "", user: dict = Depends(get_current_user)):
    if case_id:
        _get_case(case_id, user)
    connections = _connections_for(user, case_id)
    configured = has_google_oauth_config()
    encryption_ready = token_encryption_configured()
    return {
        "configured": configured and encryption_ready,
        "oauth_configured": configured,
        "token_encryption_configured": encryption_ready,
        "required_scope": GMAIL_READONLY_SCOPE,
        "connections": [_public_connection(connection) for connection in connections],
        "message": (
            "Gmail OAuth is configured."
            if configured and encryption_ready
            else "Gmail import is disabled until GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI, and GMAIL_TOKEN_ENCRYPTION_KEY are configured on the backend."
        ),
    }


@router.post("/gmail/import-rules", response_model=GmailImportRun)
async def save_gmail_import_rule(body: GmailRuleRequest, user: dict = Depends(get_current_user)):
    case = _get_case(body.case_id, user)
    rule = GmailImportRule(
        domains=sorted({item.strip().lower().lstrip("@") for item in body.domains if item.strip()}),
        email_addresses=sorted({item.strip().lower() for item in body.email_addresses if item.strip()}),
        keywords=[item.strip() for item in body.keywords if item.strip()],
        include_attachments=body.include_attachments,
        auto_sync=body.auto_sync,
    )
    existing = _connections_for(user, case.id)
    if existing:
        connection = existing[0]
        connection.rule = rule
        if connection.status == "setup_required" and has_google_oauth_config() and token_encryption_configured():
            connection.status = "disconnected"
        connection.updated_at = utc_now()
    else:
        connection = _new_connection(case, rule)
    gmail_connections[connection.id] = connection
    run = GmailImportRun(
        id=str(uuid.uuid4())[:8],
        workspace_id=case.workspace_id,
        case_id=case.id,
        connection_id=connection.id,
        status="queued" if connection.status == "connected" else "needs_oauth",
        rule=rule,
        error="" if connection.status != "setup_required" else "Google OAuth credentials or token encryption are not configured.",
    )
    gmail_import_runs[run.id] = run
    return run


@router.post("/gmail/oauth/start")
async def start_gmail_oauth(body: GmailOAuthStartRequest, user: dict = Depends(get_current_user)):
    case = _get_case(body.case_id, user)
    if not has_google_oauth_config():
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")
    if not token_encryption_configured():
        raise HTTPException(status_code=503, detail="Gmail token encryption is not configured")

    existing = _connections_for(user, case.id)
    connection = existing[0] if existing else _new_connection(case, GmailImportRule())
    state, state_hash, expires_at = new_oauth_state()
    connection.oauth_state_hash = state_hash
    connection.oauth_state_expires_at = expires_at
    connection.status = "disconnected" if connection.status == "setup_required" else connection.status
    connection.updated_at = utc_now()
    gmail_connections[connection.id] = connection
    return {
        "authorization_url": authorization_url(state, login_hint=user.get("email", "")),
        "connection": _public_connection(connection),
        "expires_at": expires_at.isoformat(),
    }


@router.get("/gmail/oauth/callback")
async def gmail_oauth_callback(
    code: str = Query(default=""),
    state: str = Query(default=""),
    error: str = Query(default=""),
):
    connection = next(
        (
            item for item in gmail_connections.values()
            if item.oauth_state_hash and state and state_matches(state, item.oauth_state_hash)
        ),
        None,
    )
    if not connection:
        raise HTTPException(status_code=400, detail="Invalid Gmail OAuth state")
    if connection.oauth_state_expires_at and normalize_utc(connection.oauth_state_expires_at) < utc_now():
        connection.status = "error"
        connection.error = "Gmail OAuth state expired. Please reconnect."
        connection.oauth_state_hash = ""
        connection.oauth_state_expires_at = None
        connection.updated_at = utc_now()
        gmail_connections[connection.id] = connection
        return RedirectResponse(gmail_redirect_for(connection, "expired"))
    if error:
        connection.status = "error"
        connection.error = error
        connection.oauth_state_hash = ""
        connection.oauth_state_expires_at = None
        connection.updated_at = utc_now()
        gmail_connections[connection.id] = connection
        return RedirectResponse(gmail_redirect_for(connection, "denied"))
    if not code:
        raise HTTPException(status_code=400, detail="Missing Gmail OAuth code")
    try:
        tokens = exchange_code_for_tokens(code)
        access_token = tokens.get("access_token", "")
        if not access_token:
            raise GmailImportError("Google did not return an access token")
        store_refresh_token(connection, tokens, access_token=access_token)
        return RedirectResponse(gmail_redirect_for(connection, "connected"))
    except Exception as exc:
        connection.status = "error"
        connection.error = str(exc)
        connection.oauth_state_hash = ""
        connection.oauth_state_expires_at = None
        connection.updated_at = utc_now()
        gmail_connections[connection.id] = connection
        return RedirectResponse(gmail_redirect_for(connection, "error"))


@router.post("/gmail/search")
async def search_gmail(body: GmailSearchRequest, user: dict = Depends(get_current_user)):
    _get_case(body.case_id, user)
    connection = _connection_for_case(body.case_id, user, body.connection_id)
    if connection.status != "connected":
        raise HTTPException(status_code=409, detail="Connect Gmail before searching messages")
    try:
        return list_matching_messages(connection, max_results=body.max_results, query=body.query)
    except GmailImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gmail/import", response_model=GmailImportRun)
async def import_gmail(body: GmailImportRequest, user: dict = Depends(get_current_user)):
    case = _get_case(body.case_id, user)
    connection = _connection_for_case(body.case_id, user, body.connection_id)
    if connection.status != "connected":
        raise HTTPException(status_code=409, detail="Connect Gmail before importing messages")
    try:
        return import_matching_messages(
            connection,
            case,
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
    revoked = 0
    for connection in _connections_for(user, case_id):
        if revoke_connection_token(connection):
            revoked += 1
        connection.status = "disconnected"
        connection.encrypted_refresh_token = ""
        connection.oauth_state_hash = ""
        connection.oauth_state_expires_at = None
        connection.disconnected_at = utc_now()
        connection.updated_at = utc_now()
        gmail_connections[connection.id] = connection
        disconnected += 1
    return {"ok": True, "disconnected": disconnected, "revoked": revoked}
