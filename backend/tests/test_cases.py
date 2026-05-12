import uuid
from datetime import datetime
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.api._store import case_documents, cases, gmail_connections
from app.config import Settings
from app.main import app
from app.models import GmailConnection, GmailImportRule
from app.services.gmail_importer import import_matching_messages
from app.services.gmail_security import encrypt_token

client = TestClient(app)


def _parsed_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _user(workspace_id: str | None = None, plan: str = "free") -> dict:
    wid = workspace_id or f"w-{uuid.uuid4().hex[:8]}"
    return {
        "id": f"u-{uuid.uuid4().hex[:8]}",
        "clerk_user_id": f"user_{uuid.uuid4().hex[:8]}",
        "email": f"{wid}@example.com",
        "role": "member",
        "workspace_id": wid,
        "workspace": {
            "id": wid,
            "name": f"{wid} workspace",
            "type": "personal",
            "plan": plan,
            "owner_user_id": "",
            "clerk_org_id": "",
        },
        "plan": plan,
    }


def _override_user(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user


def teardown_function():
    app.dependency_overrides.clear()


def _case_payload(title: str = "Evaluation case") -> dict:
    return {
        "title": title,
        "state": "KS",
        "district": "Test USD",
        "school": "Test Elementary",
        "issue_type": "student_safety",
        "issue_categories": ["student_safety", "records"],
        "incident_date": "2026-04-01",
        "narrative": "The parent reported an unsafe incident and inconsistent follow-up from the district.",
        "desired_outcome": "Understand evidence gaps and records to request.",
        "desired_outcomes": ["Understand what records to request", "Prepare for a school meeting"],
        "student_age": 8,
        "impacted_party_age": 8,
        "grade_level": "2nd grade",
        "school_setting": "public elementary school",
        "relationship_to_child": "parent_guardian",
        "iep_504_status": "504",
        "urgency_level": "urgent",
        "safety_risk": True,
        "retaliation_concern": True,
        "prior_actions": ["Contacted principal", "Requested records"],
        "urgent": False,
    }


def test_free_user_gets_one_active_case():
    user = _user()
    _override_user(user)

    first = client.post("/api/cases", json=_case_payload("Free case one"))
    assert first.status_code == 200

    second = client.post("/api/cases", json=_case_payload("Free case two"))
    assert second.status_code == 403


def test_free_user_draft_counts_against_case_limit():
    user = _user()
    _override_user(user)

    draft = client.post("/api/cases/draft")
    assert draft.status_code == 200
    assert draft.json()["status"] == "draft"

    second = client.post("/api/cases", json=_case_payload("Second open case"))
    assert second.status_code == 403

    reopened = client.post("/api/cases/draft")
    assert reopened.status_code == 200
    assert reopened.json()["id"] == draft.json()["id"]


def test_cases_are_workspace_scoped():
    owner = _user()
    outsider = _user()

    _override_user(owner)
    created = client.post("/api/cases", json=_case_payload("Scoped case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    _override_user(outsider)
    hidden = client.get(f"/api/cases/{case_id}")
    assert hidden.status_code == 404


def test_admin_role_does_not_bypass_workspace_case_scope():
    owner = _user()
    admin = _user()
    admin["role"] = "admin"

    _override_user(owner)
    created = client.post("/api/cases", json=_case_payload("Owner-only case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    _override_user(admin)
    hidden = client.get(f"/api/cases/{case_id}")
    assert hidden.status_code == 404
    visible = client.get("/api/cases")
    assert all(item["id"] != case_id for item in visible.json())


def test_case_evaluation_fallback_completes_without_model_key(monkeypatch):
    monkeypatch.delenv("DEEPINFRA_API_KEY", raising=False)
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Fallback case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    started = client.post(f"/api/cases/{case_id}/evaluations")
    assert started.status_code == 200
    evaluation_id = started.json()["id"]

    fetched = client.get(f"/api/cases/{case_id}/evaluations/{evaluation_id}")
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["status"] == "complete"
    assert body["result"]["recommended_records"]


def test_guided_intake_fields_and_support_consent_are_persisted():
    user = _user()
    _override_user(user)

    payload = _case_payload("Guided parent case")
    payload["support_consent"] = {
        "attorney_contact_opt_in": True,
        "advocacy_contact_opt_in": False,
        "media_contact_opt_in": False,
        "contact_preference": "Email after 5pm",
        "sensitivity_notes": "No media contact.",
        "share_summary_consent": True,
    }

    created = client.post("/api/cases", json=payload)
    assert created.status_code == 200
    body = created.json()
    assert _parsed_datetime(body["created_at"]).tzinfo is not None
    assert body["intake"]["issue_categories"] == ["student_safety", "records"]
    assert body["intake"]["impacted_party_age"] == 8
    assert body["intake"]["grade_level"] == "2nd grade"
    assert body["intake"]["relationship_to_child"] == "parent_guardian"
    assert body["intake"]["prior_actions"] == ["Contacted principal", "Requested records"]
    assert body["intake"]["urgent"] is True
    assert body["support_consent"]["attorney_contact_opt_in"] is True
    assert body["support_consent"]["media_contact_opt_in"] is False
    assert body["support_consent"]["share_summary_consent"] is True
    assert body["support_consent"]["consented_at"]


def test_case_advocate_intake_creates_case_without_required_form_fields(monkeypatch):
    monkeypatch.delenv("DEEPINFRA_API_KEY", raising=False)
    user = _user()
    _override_user(user)

    session = client.post("/api/intake/sessions")
    assert session.status_code == 200
    session_id = session.json()["id"]

    message = client.post(
        f"/api/intake/sessions/{session_id}/messages",
        json={
            "content": (
                "My son is in 2nd grade at Mize Elementary in USD 232. "
                "He was hurt during recess and I emailed the principal because I am worried about safety."
            )
        },
    )
    assert message.status_code == 200
    facts = message.json()["facts"]
    assert facts["district"] == "USD 232"
    assert facts["school"] == "Mize Elementary"
    assert "student_safety" in facts["issue_categories"]

    patched = client.patch(
        f"/api/intake/sessions/{session_id}/facts",
        json={"facts": {"district": "USD 232 De Soto", "state": "KS"}},
    )
    assert patched.status_code == 200
    assert patched.json()["facts"]["district"] == "USD 232 De Soto"

    created = client.post(
        f"/api/intake/sessions/{session_id}/create-case",
        json={"support_consent": {
            "attorney_contact_opt_in": False,
            "advocacy_contact_opt_in": False,
            "media_contact_opt_in": False,
            "contact_preference": "",
            "sensitivity_notes": "",
            "share_summary_consent": False,
        }},
    )
    assert created.status_code == 200
    body = created.json()
    assert body["intake"]["district"] == "USD 232 De Soto"
    assert body["intake"]["state"] == "KS"
    assert body["intake"]["safety_risk"] is True


def test_case_bound_advocate_updates_draft_case_and_first_case_read_activates(monkeypatch):
    monkeypatch.setattr(
        "app.ai_runtime.intake._run_agno_analysis",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("mock fallback")),
    )
    user = _user()
    _override_user(user)

    draft = client.post("/api/cases/draft")
    assert draft.status_code == 200
    case_id = draft.json()["id"]

    session = client.get(f"/api/cases/{case_id}/advocate/session")
    assert session.status_code == 200
    assert session.json()["case_id"] == case_id

    message = client.post(
        f"/api/cases/{case_id}/advocate/messages",
        json={"content": "My daughter is in 4th grade at Mize Elementary. I am worried about retaliation after I asked for records."},
    )
    assert message.status_code == 200
    body = message.json()
    assert body["case_id"] == case_id
    assert "retaliation" in body["issue_tags"]
    assert body["messages"][-1]["structured"]["question_cards"]
    assert body["messages"][-1]["structured"]["question_cards"][0]["question"]
    assert body["messages"][-1]["structured"]["agent_run_ids"]

    updated = client.get(f"/api/cases/{case_id}")
    assert updated.status_code == 200
    case_body = updated.json()
    assert case_body["status"] == "draft"
    assert case_body["family_narrative"]
    assert case_body["advocate_state"]["active_session_id"] == session.json()["id"]

    started = client.post(f"/api/cases/{case_id}/evaluations")
    assert started.status_code == 200
    activated = client.get(f"/api/cases/{case_id}")
    assert activated.status_code == 200
    assert activated.json()["status"] == "active"


def test_manual_family_narrative_override_beats_agent_patch(monkeypatch):
    monkeypatch.setattr(
        "app.ai_runtime.intake._run_agno_analysis",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("mock fallback")),
    )
    user = _user()
    _override_user(user)

    draft = client.post("/api/cases/draft")
    case_id = draft.json()["id"]
    manual = client.patch(f"/api/cases/{case_id}", json={"family_narrative": "Parent-edited narrative should stay."})
    assert manual.status_code == 200
    assert manual.json()["advocate_state"]["family_narrative_manual"] is True

    message = client.post(
        f"/api/cases/{case_id}/advocate/messages",
        json={"content": "My son was hurt at school and the district has not answered my emails."},
    )
    assert message.status_code == 200

    updated = client.get(f"/api/cases/{case_id}")
    assert updated.json()["family_narrative"] == "Parent-edited narrative should stay."
    assert updated.json()["intake"]["narrative"] == "Parent-edited narrative should stay."


def test_model_provider_guard_rejects_disallowed_models(monkeypatch):
    monkeypatch.setenv("DEEPINFRA_REASONING_MODEL", "anthropic/claude-sonnet")
    try:
        Settings().validate_ai_model_providers()
    except RuntimeError as exc:
        assert "must not use Gemini, Anthropic, or Claude" in str(exc)
    else:
        raise AssertionError("disallowed model provider was not rejected")


def test_case_document_metadata_and_artifacts_are_private_to_workspace(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    stored_chunks = {}

    def fake_store_document_chunks(chunks, document_id, entity_ids=None, person_ids=None, source="", metadata=None):
        stored_chunks["document_id"] = document_id
        stored_chunks["chunk_count"] = len(chunks)
        stored_chunks["metadata"] = metadata or {}
        return [f"point-{document_id}-0"]

    monkeypatch.setattr("app.services.qdrant_client.store_document_chunks", fake_store_document_chunks)
    owner = _user()
    outsider = _user()
    _override_user(owner)

    created = client.post("/api/cases", json=_case_payload("Evidence locker case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    uploaded = client.post(
        f"/api/cases/{case_id}/documents",
        files={"file": ("meeting-notes.txt", b"Principal confirmed there was an incident report.", "text/plain")},
        data={
            "evidence_type": "meeting_notes",
            "user_description": "This shows the school knew about the incident.",
            "document_date": "2026-04-02",
            "source_person": "Principal",
        },
    )
    assert uploaded.status_code == 200
    queued_doc = uploaded.json()
    assert queued_doc["status"] == "processing"
    assert queued_doc["processing_status"] == "uploaded"
    assert queued_doc["file_type"] == "txt"
    assert queued_doc["qdrant_point_ids"] == []
    assert queued_doc["storage_path"]

    fetched = client.get(f"/api/documents/{queued_doc['id']}")
    assert fetched.status_code == 200
    doc = fetched.json()
    assert doc["processing_status"] == "indexed"
    assert doc["qdrant_point_ids"] == [f"point-{doc['id']}-0"]
    assert stored_chunks["document_id"] == doc["id"]
    assert stored_chunks["metadata"]["case_id"] == case_id
    assert _parsed_datetime(doc["uploaded_at"]).tzinfo is not None
    assert _parsed_datetime(doc["processed_at"]).tzinfo is not None
    assert doc["evidence_type"] == "meeting_notes"
    assert doc["user_description"] == "This shows the school knew about the incident."
    assert doc["storage_path"]

    preview = client.get(f"/api/documents/{doc['id']}/preview")
    assert preview.status_code == 200
    assert preview.json()["has_original"] is True
    content = client.get(f"/api/documents/{doc['id']}/content")
    assert content.status_code == 200
    assert b"Principal confirmed" in content.content

    packet = client.get(f"/api/cases/{case_id}/artifacts/self-advocacy-packet")
    assert packet.status_code == 200
    packet_body = packet.json()
    assert packet_body["title"].startswith("Self-Advocacy Packet")
    assert packet_body["case_summary"]["document_count"] == 1
    assert packet_body["evidence_checklist"]

    records = client.get(f"/api/cases/{case_id}/artifacts/records-request-drafts")
    assert records.status_code == 200
    assert records.json()["records"]

    _override_user(outsider)
    hidden_packet = client.get(f"/api/cases/{case_id}/artifacts/self-advocacy-packet")
    assert hidden_packet.status_code == 404
    hidden_docs = client.get(f"/api/cases/{case_id}/documents")
    assert hidden_docs.status_code == 404
    hidden_preview = client.get(f"/api/documents/{doc['id']}/preview")
    assert hidden_preview.status_code == 404


def test_legacy_document_upload_requires_explicit_case_id():
    user = _user()
    _override_user(user)

    uploaded = client.post(
        "/api/documents/upload",
        files={"file": ("floating-note.txt", b"This should not attach to a fallback case.", "text/plain")},
    )
    assert uploaded.status_code == 400
    assert uploaded.json()["detail"] == "case_id is required"


def test_document_delete_cleans_qdrant_points(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    def fake_store_document_chunks(chunks, document_id, entity_ids=None, person_ids=None, source="", metadata=None):
        return [f"point-{document_id}-0", f"point-{document_id}-1"]

    deleted_points = []

    def fake_delete_points(point_ids):
        deleted_points.extend(point_ids)

    monkeypatch.setattr("app.services.qdrant_client.store_document_chunks", fake_store_document_chunks)
    monkeypatch.setattr("app.services.qdrant_client.delete_points", fake_delete_points)
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Delete evidence case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    uploaded = client.post(
        f"/api/cases/{case_id}/documents",
        files={"file": ("delete-me.txt", b"Delete this indexed evidence after cleanup.", "text/plain")},
    )
    assert uploaded.status_code == 200
    queued_doc = uploaded.json()
    assert queued_doc["processing_status"] == "uploaded"
    assert queued_doc["qdrant_point_ids"] == []

    fetched = client.get(f"/api/documents/{queued_doc['id']}")
    assert fetched.status_code == 200
    doc = fetched.json()
    assert doc["qdrant_point_ids"] == [f"point-{doc['id']}-0", f"point-{doc['id']}-1"]

    deleted = client.delete(f"/api/documents/{doc['id']}")
    assert deleted.status_code == 200
    assert deleted_points == doc["qdrant_point_ids"]
    assert doc["id"] not in case_documents


def test_gmail_import_rule_scaffolding_is_private_to_workspace(monkeypatch):
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_SECRET", raising=False)
    owner = _user()
    outsider = _user()
    _override_user(owner)

    created = client.post("/api/cases", json=_case_payload("Gmail beta case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    run = client.post("/api/gmail/import-rules", json={
        "case_id": case_id,
        "domains": ["usd232.org"],
        "email_addresses": ["principal@usd232.org"],
        "keywords": ["incident"],
        "include_attachments": True,
        "auto_sync": True,
    })
    assert run.status_code == 200
    assert run.json()["status"] == "needs_oauth"

    status = client.get(f"/api/gmail/status?case_id={case_id}")
    assert status.status_code == 200
    assert status.json()["configured"] is False
    assert status.json()["connections"][0]["rule"]["domains"] == ["usd232.org"]
    assert "encrypted_refresh_token" not in status.json()["connections"][0]
    assert "oauth_state_hash" not in status.json()["connections"][0]

    _override_user(outsider)
    hidden = client.get(f"/api/gmail/status?case_id={case_id}")
    assert hidden.status_code == 404


def test_gmail_oauth_state_flow_stores_no_public_secrets(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "client-id")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("GOOGLE_OAUTH_REDIRECT_URI", "https://api.usdwatch.com/api/gmail/oauth/callback")
    monkeypatch.setenv("GMAIL_TOKEN_ENCRYPTION_KEY", "test-gmail-token-key")
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Gmail OAuth case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    client.post("/api/gmail/import-rules", json={
        "case_id": case_id,
        "domains": ["usd232.org"],
        "email_addresses": [],
        "keywords": [],
        "include_attachments": True,
        "auto_sync": False,
    })

    started = client.post("/api/gmail/oauth/start", json={"case_id": case_id})
    assert started.status_code == 200
    auth_url = started.json()["authorization_url"]
    parsed = urlparse(auth_url)
    params = parse_qs(parsed.query)
    assert params["scope"] == ["https://www.googleapis.com/auth/gmail.readonly"]
    assert params["access_type"] == ["offline"]
    assert params["include_granted_scopes"] == ["true"]
    assert params["state"][0]

    status = client.get(f"/api/gmail/status?case_id={case_id}")
    assert status.status_code == 200
    public_connection = status.json()["connections"][0]
    assert public_connection["token_stored"] is False
    assert "encrypted_refresh_token" not in public_connection


def test_gmail_import_stores_matching_message_and_attachment(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("GMAIL_TOKEN_ENCRYPTION_KEY", "test-gmail-token-key")
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Gmail import case"))
    assert created.status_code == 200
    case = created.json()
    connection = GmailConnection(
        id=f"gmail-{uuid.uuid4().hex[:6]}",
        workspace_id=user["workspace_id"],
        case_id=case["id"],
        google_email="parent@example.com",
        status="connected",
        rule=GmailImportRule(domains=["usd232.org"], include_attachments=True),
        encrypted_refresh_token=encrypt_token("refresh-token"),
    )
    gmail_connections[connection.id] = connection

    def fake_refresh(_connection):
        return "access-token"

    def fake_get_json(path, _access_token, params=None):
        if path == "messages":
            return {"messages": [{"id": "msg-1"}], "resultSizeEstimate": 1}
        if path == "messages/msg-1":
            return {
                "id": "msg-1",
                "threadId": "thread-1",
                "internalDate": "1775000000000",
                "snippet": "Incident report attached",
                "payload": {
                    "headers": [
                        {"name": "From", "value": "principal@usd232.org"},
                        {"name": "To", "value": "parent@example.com"},
                        {"name": "Subject", "value": "Incident follow-up"},
                        {"name": "Date", "value": "Tue, 28 Apr 2026 12:00:00 -0500"},
                    ],
                    "parts": [
                        {
                            "mimeType": "text/plain",
                            "body": {"data": "VGhlIGluY2lkZW50IHJlcG9ydCBpcyBhdHRhY2hlZC4="},
                        },
                        {
                            "filename": "incident-report.txt",
                            "mimeType": "text/plain",
                            "body": {"attachmentId": "att-1"},
                        },
                    ],
                },
            }
        if path == "messages/msg-1/attachments/att-1":
            return {"data": "U3RhZmYgbm90ZXMgYWJvdXQgdGhlIGluY2lkZW50Lg=="}
        raise AssertionError(path)

    monkeypatch.setattr("app.services.gmail_importer.refresh_access_token", fake_refresh)
    monkeypatch.setattr("app.services.gmail_importer.gmail_get_json", fake_get_json)

    run = import_matching_messages(connection, cases.get(case["id"]))
    assert run.status == "complete"
    assert run.imported_messages == 1
    assert run.imported_attachments == 1

    docs = [
        doc for doc in case_documents.values()
        if doc.workspace_id == user["workspace_id"] and doc.case_id == case["id"] and doc.source == "gmail_import"
    ]
    assert len(docs) == 2
    assert any(doc.email_message_id == "msg-1" and not doc.parent_document_id for doc in docs)
    assert any(doc.email_attachment_id == "att-1" and doc.parent_document_id for doc in docs)


def test_support_review_queue_requires_admin_and_respects_revocation():
    owner = _user()
    _override_user(owner)

    payload = _case_payload("Support review case")
    payload["support_consent"] = {
        "attorney_contact_opt_in": True,
        "advocacy_contact_opt_in": False,
        "media_contact_opt_in": False,
        "contact_preference": "Email",
        "sensitivity_notes": "",
        "share_summary_consent": True,
    }
    created = client.post("/api/cases", json=payload)
    assert created.status_code == 200
    case_id = created.json()["id"]

    member_queue = client.get("/api/support-requests")
    assert member_queue.status_code == 403

    admin = _user(plan="admin")
    admin["role"] = "admin"
    _override_user(admin)
    queue = client.get("/api/support-requests")
    assert queue.status_code == 200
    assert any(item["case_id"] == case_id for item in queue.json())

    _override_user(owner)
    revoked = client.put("/api/cases/{case_id}/support-consent".format(case_id=case_id), json={
        "attorney_contact_opt_in": False,
        "advocacy_contact_opt_in": False,
        "media_contact_opt_in": False,
        "contact_preference": "",
        "sensitivity_notes": "",
        "share_summary_consent": False,
    })
    assert revoked.status_code == 200
    assert revoked.json()["support_consent"]["revoked_at"]

    _override_user(admin)
    queue_after_revoke = client.get("/api/support-requests")
    assert queue_after_revoke.status_code == 200
    assert all(item["case_id"] != case_id for item in queue_after_revoke.json())
