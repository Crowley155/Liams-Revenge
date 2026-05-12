from __future__ import annotations

from app.time import utc_now

import base64
import hashlib
import html
import logging
import mimetypes
import re
import uuid
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlencode

import httpx

from app.api._store import case_documents, gmail_connections, gmail_import_runs
from app.models import CaseDocument, CaseRecord, GmailConnection, GmailImportRule, GmailImportRun
from app.services.document_classifier import infer_document_metadata
from app.services.document_ingestion import process_document_bytes
from app.services.document_storage import save_case_document_file
from app.services.file_types import normalize_file_type
from app.services.gmail_security import (
    decrypt_token,
    encrypt_token,
    frontend_public_url,
    gmail_client_id,
    gmail_client_secret,
    gmail_redirect_uri,
)

logger = logging.getLogger(__name__)

GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
MAX_GMAIL_IMPORT_BYTES = 50 * 1024 * 1024


class GmailImportError(RuntimeError):
    pass


def authorization_url(state: str, *, login_hint: str = "") -> str:
    params = {
        "client_id": gmail_client_id(),
        "redirect_uri": gmail_redirect_uri(),
        "response_type": "code",
        "scope": GMAIL_READONLY_SCOPE,
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": state,
    }
    if login_hint:
        params["login_hint"] = login_hint
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    payload = {
        "code": code,
        "client_id": gmail_client_id(),
        "client_secret": gmail_client_secret(),
        "redirect_uri": gmail_redirect_uri(),
        "grant_type": "authorization_code",
    }
    with httpx.Client(timeout=20) as client:
        response = client.post(GOOGLE_TOKEN_URL, data=payload)
    if response.status_code >= 400:
        raise GmailImportError(f"Google token exchange failed: {response.status_code} {response.text[:300]}")
    return response.json()


def refresh_access_token(connection: GmailConnection) -> str:
    refresh_token = decrypt_token(connection.encrypted_refresh_token)
    if not refresh_token:
        raise GmailImportError("Gmail is not connected")
    payload = {
        "client_id": gmail_client_id(),
        "client_secret": gmail_client_secret(),
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    with httpx.Client(timeout=20) as client:
        response = client.post(GOOGLE_TOKEN_URL, data=payload)
    if response.status_code >= 400:
        connection.status = "error"
        connection.error = f"Google token refresh failed: {response.status_code}"
        connection.updated_at = utc_now()
        gmail_connections[connection.id] = connection
        raise GmailImportError(connection.error)
    body = response.json()
    connection.token_last_refreshed_at = utc_now()
    connection.updated_at = utc_now()
    gmail_connections[connection.id] = connection
    return body["access_token"]


def revoke_connection_token(connection: GmailConnection) -> bool:
    refresh_token = decrypt_token(connection.encrypted_refresh_token) if connection.encrypted_refresh_token else ""
    if not refresh_token:
        return False
    try:
        with httpx.Client(timeout=15) as client:
            response = client.post(GOOGLE_REVOKE_URL, params={"token": refresh_token})
        return response.status_code < 400
    except Exception as exc:
        logger.warning("Gmail token revoke failed for connection %s: %s", connection.id, exc)
        return False


def gmail_get_json(path: str, access_token: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{GMAIL_API_BASE}/{path.lstrip('/')}"
    with httpx.Client(timeout=30) as client:
        response = client.get(url, params=params or {}, headers={"Authorization": f"Bearer {access_token}"})
    if response.status_code >= 400:
        raise GmailImportError(f"Gmail API request failed: {response.status_code} {response.text[:300]}")
    return response.json()


def gmail_user_profile(access_token: str) -> dict[str, Any]:
    return gmail_get_json("profile", access_token)


def store_refresh_token(connection: GmailConnection, tokens: dict[str, Any], *, access_token: str) -> GmailConnection:
    refresh_token = tokens.get("refresh_token")
    if not refresh_token and not connection.encrypted_refresh_token:
        raise GmailImportError("Google did not return a refresh token. Reconnect with consent to enable imports.")
    if refresh_token:
        connection.encrypted_refresh_token = encrypt_token(refresh_token)
    granted_scope = tokens.get("scope", GMAIL_READONLY_SCOPE)
    connection.scopes = [scope for scope in granted_scope.split() if scope]
    profile = gmail_user_profile(access_token)
    connection.google_email = profile.get("emailAddress", connection.google_email)
    connection.last_history_id = str(profile.get("historyId") or connection.last_history_id or "")
    connection.status = "connected"
    connection.error = ""
    connection.oauth_state_hash = ""
    connection.oauth_state_expires_at = None
    connection.connected_at = utc_now()
    connection.disconnected_at = None
    connection.updated_at = utc_now()
    gmail_connections[connection.id] = connection
    return connection


def gmail_redirect_for(connection: GmailConnection, status: str = "connected") -> str:
    return f"{frontend_public_url()}/cases/{connection.case_id}/locker?gmail={status}"


def build_gmail_query(rule: GmailImportRule, *, newer_than_days: int | None = None) -> str:
    identity_terms: list[str] = []
    for domain in rule.domains:
        clean = domain.strip().lower().lstrip("@")
        if clean:
            identity_terms.extend([f"from:{clean}", f"to:{clean}"])
    for address in rule.email_addresses:
        clean = address.strip().lower()
        if clean:
            identity_terms.extend([f"from:{clean}", f"to:{clean}"])

    chunks: list[str] = []
    if identity_terms:
        chunks.append("(" + " OR ".join(identity_terms) + ")")
    for keyword in rule.keywords:
        clean = keyword.strip()
        if clean:
            chunks.append(f'"{clean}"' if " " in clean else clean)
    if newer_than_days:
        chunks.append(f"newer_than:{newer_than_days}d")
    return " ".join(chunks).strip()


def list_matching_messages(connection: GmailConnection, *, max_results: int = 25, query: str = "") -> dict[str, Any]:
    access_token = refresh_access_token(connection)
    q = query.strip() or build_gmail_query(connection.rule)
    if not q:
        raise GmailImportError("Add at least one domain, email address, or keyword before searching Gmail.")
    max_results = max(1, min(max_results, 100))
    response = gmail_get_json("messages", access_token, params={
        "q": q,
        "maxResults": max_results,
        "includeSpamTrash": "false",
    })
    messages = response.get("messages", [])
    summaries = []
    for item in messages:
        msg = gmail_get_json(f"messages/{item['id']}", access_token, params={
            "format": "metadata",
            "metadataHeaders": ["From", "To", "Cc", "Subject", "Date"],
        })
        summaries.append(_message_summary(msg))
    return {"query": q, "messages": summaries, "result_size_estimate": response.get("resultSizeEstimate", len(summaries))}


def import_matching_messages(
    connection: GmailConnection,
    case: CaseRecord,
    *,
    message_ids: list[str] | None = None,
    max_results: int = 25,
    query: str = "",
) -> GmailImportRun:
    access_token = refresh_access_token(connection)
    q = query.strip() or build_gmail_query(connection.rule, newer_than_days=30 if connection.last_sync_at else None)
    run = GmailImportRun(
        id=str(uuid.uuid4())[:8],
        workspace_id=case.workspace_id,
        case_id=case.id,
        connection_id=connection.id,
        status="running",
        rule=connection.rule,
        query=q,
        message_ids=message_ids or [],
        started_at=utc_now(),
    )
    gmail_import_runs[run.id] = run

    try:
        if message_ids:
            ids = message_ids[:100]
        else:
            if not q:
                raise GmailImportError("Add at least one domain, email address, or keyword before importing Gmail.")
            listed = gmail_get_json("messages", access_token, params={
                "q": q,
                "maxResults": max(1, min(max_results, 100)),
                "includeSpamTrash": "false",
            })
            ids = [item["id"] for item in listed.get("messages", [])]
        run.matched_messages = len(ids)

        for message_id in ids:
            if _existing_email_doc(case, connection, message_id, ""):
                run.skipped_messages += 1
                continue
            msg = gmail_get_json(f"messages/{message_id}", access_token, params={"format": "full"})
            body_doc, attachment_count = _import_message(case, connection, run, msg, access_token)
            if body_doc:
                run.imported_messages += 1
                run.imported_document_ids.append(body_doc.id)
            run.imported_attachments += attachment_count

        connection.last_sync_at = utc_now()
        connection.updated_at = utc_now()
        gmail_connections[connection.id] = connection
        run.status = "complete"
        run.completed_at = utc_now()
        gmail_import_runs[run.id] = run
        return run
    except Exception as exc:
        run.status = "failed"
        run.error = str(exc)
        run.completed_at = utc_now()
        gmail_import_runs[run.id] = run
        raise


def _message_summary(msg: dict[str, Any]) -> dict[str, Any]:
    headers = _headers(msg)
    return {
        "id": msg.get("id", ""),
        "thread_id": msg.get("threadId", ""),
        "history_id": msg.get("historyId", ""),
        "subject": headers.get("subject", "(no subject)"),
        "from": headers.get("from", ""),
        "to": headers.get("to", ""),
        "cc": headers.get("cc", ""),
        "date": headers.get("date", ""),
        "internal_date": _internal_date(msg),
        "snippet": html.unescape(msg.get("snippet", "")),
        "has_attachments": any(part.get("filename") for part in _walk_parts(msg.get("payload", {}))),
    }


def _headers(msg: dict[str, Any]) -> dict[str, str]:
    values: dict[str, str] = {}
    for header in (msg.get("payload") or {}).get("headers", []):
        name = str(header.get("name", "")).lower()
        if name:
            values[name] = str(header.get("value", ""))
    return values


def _internal_date(msg: dict[str, Any]) -> str:
    raw = msg.get("internalDate")
    if not raw:
        return ""
    try:
        return datetime.utcfromtimestamp(int(raw) / 1000).isoformat()
    except Exception:
        return ""


def _email_date(headers: dict[str, str], msg: dict[str, Any]) -> str | None:
    raw = headers.get("date")
    if raw:
        try:
            return parsedate_to_datetime(raw).isoformat()
        except Exception:
            return raw
    return _internal_date(msg) or None


def _walk_parts(part: dict[str, Any]) -> list[dict[str, Any]]:
    parts = [part] if part else []
    for child in part.get("parts", []) if part else []:
        parts.extend(_walk_parts(child))
    return parts


def _decode_part_data(data: str) -> bytes:
    if not data:
        return b""
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


def _body_text(msg: dict[str, Any]) -> str:
    plain: list[str] = []
    html_parts: list[str] = []
    for part in _walk_parts(msg.get("payload", {})):
        body = part.get("body", {})
        data = body.get("data")
        if not data:
            continue
        decoded = _decode_part_data(data).decode("utf-8", errors="replace")
        mime = part.get("mimeType", "")
        if mime == "text/plain":
            plain.append(decoded)
        elif mime == "text/html":
            html_parts.append(_strip_html(decoded))
    return "\n\n".join(plain or html_parts).strip()


def _strip_html(value: str) -> str:
    try:
        from bs4 import BeautifulSoup
        return BeautifulSoup(value, "html.parser").get_text("\n", strip=True)
    except Exception:
        return re.sub(r"<[^>]+>", " ", value)


def _safe_subject(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", " ", value or "email").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:80] or "email"


def _hash_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _existing_email_doc(
    case: CaseRecord,
    connection: GmailConnection,
    message_id: str,
    attachment_id: str,
) -> CaseDocument | None:
    for doc in case_documents.values():
        if (
            doc.workspace_id == case.workspace_id
            and doc.case_id == case.id
            and doc.email_source_connection_id == connection.id
            and doc.email_message_id == message_id
            and doc.email_attachment_id == attachment_id
        ):
            return doc
    return None


def _import_message(
    case: CaseRecord,
    connection: GmailConnection,
    run: GmailImportRun,
    msg: dict[str, Any],
    access_token: str,
) -> tuple[CaseDocument | None, int]:
    headers = _headers(msg)
    subject = headers.get("subject", "(no subject)")
    message_id = msg.get("id", "")
    thread_id = msg.get("threadId", "")
    body = _body_text(msg) or html.unescape(msg.get("snippet", ""))
    email_date = _email_date(headers, msg)
    to_values = [item.strip() for item in re.split(r",|;", headers.get("to", "")) if item.strip()]

    text = "\n".join([
        f"From: {headers.get('from', '')}",
        f"To: {headers.get('to', '')}",
        f"Cc: {headers.get('cc', '')}",
        f"Date: {headers.get('date', '')}",
        f"Subject: {subject}",
        "",
        body,
    ]).encode("utf-8")
    body_doc = CaseDocument(
        id=str(uuid.uuid4())[:8],
        workspace_id=case.workspace_id,
        case_id=case.id,
        filename=f"gmail-{_safe_subject(subject)}.txt",
        file_type="txt",
        file_size=len(text),
        mime_type="text/plain",
        evidence_type="communications",
        inferred_category="messages",
        category_confidence=0.9,
        tags=["email", "gmail", "messages"],
        document_date=email_date,
        source_person=headers.get("from", ""),
        source="gmail_import",
        email_message_id=message_id,
        email_thread_id=thread_id,
        email_subject=subject,
        email_from=headers.get("from", ""),
        email_to=to_values,
        email_date=email_date,
        email_source_connection_id=connection.id,
        email_import_run_id=run.id,
        content_sha256=_hash_bytes(text),
    )
    body_doc.storage_path = save_case_document_file(body_doc.workspace_id, body_doc.case_id, body_doc.id, body_doc.filename, text)
    process_document_bytes(body_doc, text)

    attachment_count = 0
    attachment_ids: list[str] = []
    if connection.rule.include_attachments:
        for part in _walk_parts(msg.get("payload", {})):
            filename = part.get("filename") or ""
            attachment_id = (part.get("body") or {}).get("attachmentId", "")
            if not filename or not attachment_id:
                continue
            if _existing_email_doc(case, connection, message_id, attachment_id):
                continue
            attachment = gmail_get_json(f"messages/{message_id}/attachments/{attachment_id}", access_token)
            content = _decode_part_data(attachment.get("data", ""))
            if not content or len(content) > MAX_GMAIL_IMPORT_BYTES:
                continue
            category, confidence, tags, evidence_type = infer_document_metadata(filename)
            mime_type = part.get("mimeType") or mimetypes.guess_type(filename)[0] or ""
            doc = CaseDocument(
                id=str(uuid.uuid4())[:8],
                workspace_id=case.workspace_id,
                case_id=case.id,
                filename=filename,
                file_type=normalize_file_type(filename, mime_type),
                file_size=len(content),
                mime_type=mime_type,
                evidence_type=evidence_type,
                inferred_category=category,
                category_confidence=confidence,
                tags=sorted(set([*tags, "gmail_attachment"])),
                document_date=email_date,
                source_person=headers.get("from", ""),
                source="gmail_import",
                email_message_id=message_id,
                email_thread_id=thread_id,
                email_subject=subject,
                email_from=headers.get("from", ""),
                email_to=to_values,
                email_date=email_date,
                email_attachment_id=attachment_id,
                email_source_connection_id=connection.id,
                email_import_run_id=run.id,
                parent_document_id=body_doc.id,
                content_sha256=_hash_bytes(content),
            )
            doc.storage_path = save_case_document_file(doc.workspace_id, doc.case_id, doc.id, doc.filename, content)
            process_document_bytes(doc, content)
            attachment_ids.append(doc.id)
            attachment_count += 1
    body_doc.attachment_ids = attachment_ids
    case_documents[body_doc.id] = body_doc
    return body_doc, attachment_count
