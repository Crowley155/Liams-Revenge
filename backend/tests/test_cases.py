import json
import uuid
import time
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.api._store import case_documents, cases, gmail_connections
from app.config import Settings
from app.db import _connect, init_db
from app.main import app
from app.models import CaseDocument, CaseIntake, CaseRecord, CaseStatus, GmailConnection, GmailImportRule
from app.services.gmail_importer import GmailImportError, import_matching_messages

client = TestClient(app)


def _sse_events(response) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    current_event = "message"
    current_data: list[str] = []
    text = response.read().decode("utf-8") if not hasattr(response, "_content") else response.text
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            if current_data:
                import json

                events.append((current_event, json.loads("\n".join(current_data))))
            current_event = "message"
            current_data = []
            continue
        if line.startswith("event:"):
            current_event = line.split(":", 1)[1].strip()
        if line.startswith("data:"):
            current_data.append(line.split(":", 1)[1].strip())
    if current_data:
        import json

        events.append((current_event, json.loads("\n".join(current_data))))
    return events


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


def test_owner_can_grant_viewer_by_email_and_shared_case_is_read_only():
    owner = _user()
    viewer = _user()
    viewer["email"] = "shared.viewer@example.com"
    _override_user(owner)

    created = client.post("/api/cases", json=_case_payload("Shared viewer case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    granted = client.post(
        f"/api/cases/{case_id}/shares",
        json={"email": viewer["email"], "role": "viewer"},
    )
    assert granted.status_code == 200
    grant_body = granted.json()
    assert grant_body["grant"]["email"] == viewer["email"]
    assert grant_body["grant"]["role"] == "viewer"
    assert "token" not in grant_body
    assert "accept_url" not in grant_body

    _override_user(viewer)
    visible = client.get("/api/cases")
    assert visible.status_code == 200
    assert any(item["id"] == case_id for item in visible.json())

    access = client.get(f"/api/cases/{case_id}/access")
    assert access.status_code == 200
    assert access.json()["role"] == "viewer"
    assert access.json()["permissions"]["can_view"] is True
    assert access.json()["permissions"]["can_edit"] is False

    fetched = client.get(f"/api/cases/{case_id}")
    assert fetched.status_code == 200

    update = client.patch(f"/api/cases/{case_id}", json={"desired_outcome": "Viewer should not edit."})
    assert update.status_code == 403

    upload = client.post(
        f"/api/cases/{case_id}/documents",
        files={"file": ("viewer-note.txt", b"viewer cannot upload", "text/plain")},
    )
    assert upload.status_code == 403

    read_docs = client.get(f"/api/cases/{case_id}/documents")
    assert read_docs.status_code == 200

    support = client.put(f"/api/cases/{case_id}/support-consent", json={
        "attorney_contact_opt_in": True,
        "advocacy_contact_opt_in": False,
        "media_contact_opt_in": False,
        "contact_preference": "Email",
        "sensitivity_notes": "",
        "share_summary_consent": True,
    })
    assert support.status_code == 403


def test_editor_can_edit_case_and_evidence_but_not_manage_owner_only_surfaces(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    owner = _user()
    editor = _user()
    editor["email"] = "case.editor@example.com"
    _override_user(owner)

    created = client.post("/api/cases", json=_case_payload("Shared editor case"))
    case_id = created.json()["id"]
    granted = client.post(
        f"/api/cases/{case_id}/shares",
        json={"email": editor["email"], "role": "editor"},
    )
    assert granted.status_code == 200

    _override_user(editor)
    update = client.patch(f"/api/cases/{case_id}", json={"desired_outcome": "Prepare a meeting packet."})
    assert update.status_code == 200
    assert update.json()["intake"]["desired_outcome"] == "Prepare a meeting packet."

    uploaded = client.post(
        f"/api/cases/{case_id}/documents",
        files={"file": ("editor-note.txt", b"Editor supplied evidence.", "text/plain")},
    )
    assert uploaded.status_code == 200
    doc_id = uploaded.json()["id"]

    deleted = client.delete(f"/api/documents/{doc_id}")
    assert deleted.status_code == 200

    share_list = client.get(f"/api/cases/{case_id}/shares")
    assert share_list.status_code == 403

    gmail = client.put("/api/gmail/rule", json={
        "case_id": case_id,
        "domains": ["usd232.org"],
        "email_addresses": [],
        "keywords": [],
        "include_attachments": True,
    })
    assert gmail.status_code == 403

    support = client.put(f"/api/cases/{case_id}/support-consent", json={
        "attorney_contact_opt_in": True,
        "advocacy_contact_opt_in": False,
        "media_contact_opt_in": False,
        "contact_preference": "Email",
        "sensitivity_notes": "",
        "share_summary_consent": True,
    })
    assert support.status_code == 403


def test_email_grant_is_immediate_email_scoped_and_revocable():
    owner = _user()
    collaborator_user = _user()
    collaborator_user["email"] = "collaborator.parent@example.com"
    wrong_user = _user()
    wrong_user["email"] = "wrong.person@example.com"
    _override_user(owner)

    created = client.post("/api/cases", json=_case_payload("Direct share safety case"))
    case_id = created.json()["id"]
    granted = client.post(
        f"/api/cases/{case_id}/shares",
        json={"email": collaborator_user["email"], "role": "viewer"},
    )
    assert granted.status_code == 200
    grant_id = granted.json()["grant"]["id"]

    duplicate = client.post(
        f"/api/cases/{case_id}/shares",
        json={"email": collaborator_user["email"], "role": "viewer"},
    )
    assert duplicate.status_code == 409

    _override_user(wrong_user)
    hidden_from_wrong_email = client.get(f"/api/cases/{case_id}")
    assert hidden_from_wrong_email.status_code == 404

    _override_user(collaborator_user)
    visible = client.get(f"/api/cases/{case_id}")
    assert visible.status_code == 200

    _override_user(owner)
    shares = client.get(f"/api/cases/{case_id}/shares")
    assert shares.status_code == 200
    assert "invitations" not in shares.json()
    assert shares.json()["collaborators"][0]["id"] == grant_id

    revoked = client.delete(f"/api/cases/{case_id}/shares/{grant_id}")
    assert revoked.status_code == 200

    _override_user(collaborator_user)
    hidden = client.get(f"/api/cases/{case_id}")
    assert hidden.status_code == 404


def test_legacy_invitation_table_is_backfilled_to_email_grants():
    owner = _user()
    collaborator_user = _user()
    collaborator_user["email"] = "legacy.pending@example.com"
    _override_user(owner)

    created = client.post("/api/cases", json=_case_payload("Legacy pending case"))
    assert created.status_code == 200
    case_id = created.json()["id"]
    legacy_id = f"legacy-{uuid.uuid4().hex[:8]}"
    legacy_data = {
        "id": legacy_id,
        "workspace_id": created.json()["workspace_id"],
        "case_id": case_id,
        "email": collaborator_user["email"],
        "role": "viewer",
        "status": "pending",
        "token_hash": "legacy-token-hash",
        "invited_by_user_id": owner["id"],
        "invited_by_email": owner["email"],
        "accepted_by_user_id": "",
        "grant_id": "",
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "accepted_at": None,
        "revoked_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    conn = _connect()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS case_invitations (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                case_id TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                token_hash TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL DEFAULT 'viewer',
                status TEXT NOT NULL DEFAULT 'pending',
                data TEXT NOT NULL
            );
        """)
        conn.execute(
            """
            INSERT INTO case_invitations
                (id, workspace_id, case_id, email, token_hash, role, status, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                legacy_id,
                legacy_data["workspace_id"],
                case_id,
                collaborator_user["email"],
                legacy_data["token_hash"],
                "viewer",
                "pending",
                json.dumps(legacy_data),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    init_db()
    conn = _connect()
    try:
        legacy_table = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'case_invitations'"
        ).fetchone()
    finally:
        conn.close()
    assert legacy_table is None

    _override_user(collaborator_user)
    visible = client.get(f"/api/cases/{case_id}")
    assert visible.status_code == 200

    _override_user(owner)
    shares = client.get(f"/api/cases/{case_id}/shares")
    assert shares.status_code == 200
    assert "invitations" not in shares.json()
    assert any(item["email"] == collaborator_user["email"] for item in shares.json()["collaborators"])


def test_owner_can_change_collaborator_role_and_revoke_collaborator():
    owner = _user()
    collaborator = _user()
    collaborator["email"] = "role.change@example.com"
    other_email = "pending.revoke@example.com"
    _override_user(owner)

    created = client.post("/api/cases", json=_case_payload("Role changes case"))
    case_id = created.json()["id"]
    collaborator_grant = client.post(
        f"/api/cases/{case_id}/shares",
        json={"email": collaborator["email"], "role": "viewer"},
    )
    other_grant = client.post(
        f"/api/cases/{case_id}/shares",
        json={"email": other_email, "role": "viewer"},
    )
    assert collaborator_grant.status_code == 200
    assert other_grant.status_code == 200

    _override_user(owner)
    shares = client.get(f"/api/cases/{case_id}/shares")
    assert "invitations" not in shares.json()
    grant_id = next(item["id"] for item in shares.json()["collaborators"] if item["email"] == collaborator["email"])
    other_grant_id = next(item["id"] for item in shares.json()["collaborators"] if item["email"] == other_email)

    changed = client.patch(f"/api/cases/{case_id}/shares/{grant_id}", json={"role": "editor"})
    assert changed.status_code == 200
    assert changed.json()["role"] == "editor"

    revoked = client.delete(f"/api/cases/{case_id}/shares/{other_grant_id}")
    assert revoked.status_code == 200
    after = client.get(f"/api/cases/{case_id}/shares")
    assert "invitations" not in after.json()
    assert all(item["id"] != other_grant_id for item in after.json()["collaborators"])


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


def test_case_draft_assist_generates_text_without_saving(monkeypatch):
    monkeypatch.delenv("DEEPINFRA_API_KEY", raising=False)
    user = _user()
    _override_user(user)

    payload = _case_payload("Draft assist case")
    payload["narrative"] = "My son was injured during aftercare and the program has not explained supervision."
    payload["desired_outcome"] = ""
    payload["desired_outcomes"] = []
    created = client.post("/api/cases", json=payload)
    assert created.status_code == 200
    case_id = created.json()["id"]

    assisted = client.post(f"/api/cases/{case_id}/draft-assist", json={"target": "desired_outcome"})
    assert assisted.status_code == 200
    body = assisted.json()
    assert body["target"] == "desired_outcome"
    assert "safety" in body["draft"].lower() or "supervision" in body["draft"].lower()
    assert body["model_route"].startswith("local-fallback")

    fetched = client.get(f"/api/cases/{case_id}")
    assert fetched.status_code == 200
    assert fetched.json()["intake"]["desired_outcome"] == ""
    assert fetched.json()["intake"]["desired_outcomes"] == []


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


def test_case_chat_summary_on_empty_case_does_not_become_narrative(monkeypatch):
    monkeypatch.setattr(
        "app.ai_runtime.intake._run_case_chat_agno_analysis",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("mock fallback")),
        raising=False,
    )
    user = _user()
    _override_user(user)

    draft = client.post("/api/cases/draft")
    assert draft.status_code == 200
    case_id = draft.json()["id"]

    with client.stream(
        "POST",
        f"/api/cases/{case_id}/chat/messages/stream",
        json={"content": "Can you summarize my case?"},
    ) as response:
        assert response.status_code == 200
        events = _sse_events(response)

    event_names = [name for name, _payload in events]
    assert event_names[0] == "status"
    assert "message_delta" in event_names
    assert event_names[-1] == "complete"

    latest = events[-1][1]["session"]["messages"][-1]
    assert "do not have enough case detail yet" in latest["content"]
    assert latest["structured"]["intent"] == "case_summary"
    assert latest["structured"]["case_update_proposals"] == []
    assert latest["structured"].get("question_cards", []) == []

    updated = client.get(f"/api/cases/{case_id}")
    assert updated.status_code == 200
    case_body = updated.json()
    assert case_body["family_narrative"] == ""
    assert case_body["intake"]["narrative"] == ""


def test_case_chat_summary_answers_from_existing_case_without_forced_question(monkeypatch):
    monkeypatch.setattr(
        "app.ai_runtime.intake._run_case_chat_agno_analysis",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("mock fallback")),
        raising=False,
    )
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Summary chat case"))
    assert created.status_code == 200
    case_id = created.json()["id"]
    original_narrative = created.json()["family_narrative"]
    source_doc = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id=user["workspace_id"],
        case_id=case_id,
        filename="incident-summary.pdf",
        extracted_text="This document mentions the unsafe incident and district follow-up.",
        document_summary="Incident report about the safety event.",
        processing_status="indexed",
        status="indexed",
    )
    case_documents[source_doc.id] = source_doc

    with client.stream(
        "POST",
        f"/api/cases/{case_id}/chat/messages/stream",
        json={"content": "Can you summarize my case?"},
    ) as response:
        assert response.status_code == 200
        events = _sse_events(response)

    latest = events[-1][1]["session"]["messages"][-1]
    assert all(name != "source" for name, _payload in events)
    assert all(name != "safety" for name, _payload in events)
    assert "Summary chat case" in latest["content"]
    assert "unsafe incident" in latest["content"]
    assert latest["structured"]["intent"] == "case_summary"
    assert latest["structured"]["sources"] == []
    assert latest["structured"]["safety_flags"] == []
    assert [part["type"] for part in latest["structured"]["message_parts"]] == ["text"]
    assert latest["structured"].get("question_cards", []) == []

    updated = client.get(f"/api/cases/{case_id}")
    assert updated.json()["family_narrative"] == original_narrative
    assert "Can you summarize my case?" not in updated.json()["family_narrative"]


def test_case_chat_summary_uses_fast_path_without_waiting_for_model(monkeypatch):
    calls = []

    def unexpected_manager(*args, **kwargs):
        calls.append(kwargs.get("model_id") or (args[1] if len(args) > 1 else "unknown"))
        raise RuntimeError("model should not be called for a simple summary")

    monkeypatch.setattr("app.ai_runtime.intake._run_case_chat_agno_analysis", unexpected_manager)
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Fast summary case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    with client.stream(
        "POST",
        f"/api/cases/{case_id}/chat/messages/stream",
        json={"content": "Can you summarize my case?"},
    ) as response:
        assert response.status_code == 200
        events = _sse_events(response)

    latest = events[-1][1]["session"]["messages"][-1]
    assert calls == []
    assert "Fast summary case" in latest["content"]
    assert latest["structured"]["intent"] == "case_summary"
    assert latest["structured"]["model_route"]["runtime"] == "local_case_file"


def test_case_chat_evidence_question_without_documents_is_answered_not_mutated(monkeypatch):
    monkeypatch.setattr(
        "app.ai_runtime.intake._run_case_chat_agno_analysis",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("mock fallback")),
        raising=False,
    )
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Evidence chat case"))
    assert created.status_code == 200
    case_id = created.json()["id"]
    original_narrative = created.json()["family_narrative"]

    with client.stream(
        "POST",
        f"/api/cases/{case_id}/chat/messages/stream",
        json={"content": "What evidence do we have about supervision?"},
    ) as response:
        assert response.status_code == 200
        events = _sse_events(response)

    latest = events[-1][1]["session"]["messages"][-1]
    assert "do not see matching evidence" in latest["content"]
    assert latest["structured"]["intent"] == "evidence_question"
    assert latest["structured"]["sources"] == []
    assert "Add the strongest document" in latest["structured"]["suggested_replies"]

    updated = client.get(f"/api/cases/{case_id}")
    assert updated.json()["family_narrative"] == original_narrative


def test_case_chat_evidence_question_returns_sources_only_when_asked(monkeypatch):
    monkeypatch.setattr(
        "app.ai_runtime.intake._run_case_chat_agno_analysis",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("mock fallback")),
        raising=False,
    )
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Evidence source case"))
    assert created.status_code == 200
    case_id = created.json()["id"]
    source_doc = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id=user["workspace_id"],
        case_id=case_id,
        filename="supervision-note.txt",
        extracted_text="The supervision note says staff coverage was thin during recess.",
        document_summary="Supervision note about recess staffing.",
        processing_status="indexed",
        status="indexed",
    )
    case_documents[source_doc.id] = source_doc

    with client.stream(
        "POST",
        f"/api/cases/{case_id}/chat/messages/stream",
        json={"content": "What evidence do we have about supervision?"},
    ) as response:
        assert response.status_code == 200
        events = _sse_events(response)

    sources = [payload for name, payload in events if name == "source"]
    assert sources
    assert sources[0]["document_id"] == source_doc.id
    latest = events[-1][1]["session"]["messages"][-1]
    assert latest["structured"]["intent"] == "evidence_question"
    assert latest["structured"]["sources"][0]["document_id"] == source_doc.id
    assert [part["type"] for part in latest["structured"]["message_parts"]] == ["text"]


def test_case_advocate_stream_emits_case_scoped_sources_actions_and_completion(monkeypatch):
    monkeypatch.setattr(
        "app.ai_runtime.intake._run_agno_analysis",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("mock fallback")),
    )
    user = _user()
    _override_user(user)

    case = CaseRecord(
        id=f"case-{uuid.uuid4().hex[:6]}",
        workspace_id=user["workspace_id"],
        title="Advocate stream case",
        intake=CaseIntake(issue_type="student_safety", issue_categories=["student_safety", "records"]),
    )
    cases[case.id] = case
    source_doc = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id=case.workspace_id,
        case_id=case.id,
        filename="supervision-note.txt",
        extracted_text="The supervision note says staff coverage was thin during recess.",
        document_summary="Supervision note about recess staffing.",
        processing_status="indexed",
        status="indexed",
        qdrant_point_ids=["point-1"],
    )
    other_doc = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id=case.workspace_id,
        case_id="other-case",
        filename="other-case-note.txt",
        extracted_text="This should never appear in the advocate source list.",
        processing_status="indexed",
        status="indexed",
        qdrant_point_ids=["point-2"],
    )
    case_documents[source_doc.id] = source_doc
    case_documents[other_doc.id] = other_doc

    monkeypatch.setattr("app.services.qdrant_client.is_available", lambda: True)
    monkeypatch.setattr(
        "app.services.qdrant_client.search_case_documents_semantic",
        lambda query, case_id, limit=25: [
            {"document_id": source_doc.id, "case_id": case.id, "full_text": "staff coverage meaning match", "_score": 0.91},
            {"document_id": other_doc.id, "case_id": "other-case", "full_text": "cross case leak", "_score": 0.99},
        ],
    )

    with client.stream(
        "POST",
        f"/api/cases/{case.id}/advocate/messages/stream",
        json={"content": "What evidence do we have about supervision? Open the Evidence Locker."},
    ) as response:
        assert response.status_code == 200
        events = _sse_events(response)

    event_names = [name for name, _payload in events]
    assert event_names[0] == "status"
    assert "message" in event_names
    assert "source" in event_names
    assert event_names[-1] == "complete"

    sources = [payload for name, payload in events if name == "source"]
    assert sources[0]["document_id"] == source_doc.id
    assert all(source["document_id"] != other_doc.id for source in sources)

    actions = [payload for name, payload in events if name == "action"]
    assert actions == []

    complete = events[-1][1]
    structured = complete["session"]["messages"][-1]["structured"]
    assert structured["sources"][0]["document_id"] == source_doc.id
    assert structured["action_proposals"] == []
    assert structured["model_route"]["runtime"] == "local_case_file"


def test_case_chat_clear_resets_transcript_without_erasing_case_file(monkeypatch):
    monkeypatch.setattr(
        "app.ai_runtime.intake._run_agno_analysis",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("mock fallback")),
    )
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Clear chat case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    message = client.post(
        f"/api/cases/{case_id}/advocate/messages",
        json={"content": "My daughter was injured at recess and I need help organizing the records."},
    )
    assert message.status_code == 200
    assert len(message.json()["messages"]) >= 3

    cleared = client.post(f"/api/cases/{case_id}/advocate/session/clear")
    assert cleared.status_code == 200
    body = cleared.json()

    assert body["case_id"] == case_id
    assert len(body["messages"]) == 1
    assert body["messages"][0]["role"] == "assistant"
    assert "Chat" in body["messages"][0]["content"]
    assert all("daughter was injured" not in item["content"] for item in body["messages"])

    updated = client.get(f"/api/cases/{case_id}")
    assert updated.status_code == 200
    case_body = updated.json()
    assert case_body["family_narrative"]
    assert case_body["advocate_state"]["active_session_id"] == body["id"]
    assert case_body["advocate_state"]["chat_cleared_at"]


def test_case_chat_stream_falls_back_when_manager_times_out(monkeypatch):
    import app.ai_runtime.intake as intake_runtime

    class FakeSettings:
        has_deepinfra = True

    monkeypatch.setattr(intake_runtime, "settings", FakeSettings())
    monkeypatch.setattr(intake_runtime, "AGNO_RUN_TIMEOUT_SECONDS", 0.01)

    def slow_manager(*args, **kwargs):
        time.sleep(0.08)
        return intake_runtime._fallback_case_chat_result(
            args[0],
            args[2] if len(args) > 2 else kwargs.get("context"),
            "case_question",
            model_id="mock-model",
        )

    monkeypatch.setattr(intake_runtime, "_run_case_chat_agno_analysis", slow_manager)
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Timeout chat case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    with client.stream(
        "POST",
        f"/api/cases/{case_id}/advocate/messages/stream",
        json={"content": "Why does this matter for my case?"},
    ) as response:
        assert response.status_code == 200
        events = _sse_events(response)

    assert [name for name, _payload in events][-1] == "complete"
    structured = events[-1][1]["session"]["messages"][-1]["structured"]
    assert structured["model_route"]["fallback"] is True
    assert "timed out" in structured["model_route"]["error"].lower()


def test_case_chat_primary_timeout_does_not_start_second_hosted_model(monkeypatch):
    import app.ai_runtime.intake as intake_runtime

    class FakeSettings:
        has_deepinfra = True

    calls = []
    monkeypatch.setattr(intake_runtime, "settings", FakeSettings())
    monkeypatch.setattr(intake_runtime, "REASONING_MODEL", "primary-reasoning")
    monkeypatch.setattr(intake_runtime, "FALLBACK_MODEL", "fallback-llama")
    monkeypatch.setattr(intake_runtime, "AGNO_RUN_TIMEOUT_SECONDS", 0.01)

    def slow_manager(session, model_id="primary-reasoning", context=None):
        calls.append(model_id)
        time.sleep(0.08)
        return intake_runtime._fallback_case_chat_result(
            session,
            context,
            "case_question",
            model_id=model_id,
        )

    monkeypatch.setattr(intake_runtime, "_run_case_chat_agno_analysis", slow_manager)
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Hosted timeout case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    with client.stream(
        "POST",
        f"/api/cases/{case_id}/chat/messages/stream",
        json={"content": "Why does this matter for my case?"},
    ) as response:
        assert response.status_code == 200
        events = _sse_events(response)

    assert calls == ["primary-reasoning"]
    structured = events[-1][1]["session"]["messages"][-1]["structured"]
    assert structured["model_route"]["fallback"] is True
    assert "timed out" in structured["model_route"]["error"].lower()


def test_case_chat_primary_schema_failure_does_not_start_second_hosted_model(monkeypatch):
    import app.ai_runtime.intake as intake_runtime

    class FakeSettings:
        has_deepinfra = True

    calls = []
    monkeypatch.setattr(intake_runtime, "settings", FakeSettings())
    monkeypatch.setattr(intake_runtime, "REASONING_MODEL", "primary-reasoning")
    monkeypatch.setattr(intake_runtime, "FALLBACK_MODEL", "fallback-llama")

    def invalid_schema(session, model_id="primary-reasoning", context=None):
        calls.append(model_id)
        raise ValueError("Failed to parse cleaned JSON")

    monkeypatch.setattr(intake_runtime, "_run_case_chat_agno_analysis", invalid_schema)
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Hosted schema case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    with client.stream(
        "POST",
        f"/api/cases/{case_id}/chat/messages/stream",
        json={"content": "Why does this matter for my case?"},
    ) as response:
        assert response.status_code == 200
        events = _sse_events(response)

    assert calls == ["primary-reasoning"]
    structured = events[-1][1]["session"]["messages"][-1]["structured"]
    assert structured["model_route"]["fallback"] is True
    assert "parse" in structured["model_route"]["error"].lower()


def test_case_advocate_actions_require_case_access_and_record_decisions(monkeypatch):
    monkeypatch.setattr(
        "app.ai_runtime.intake._run_agno_analysis",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("mock fallback")),
    )
    owner = _user()
    outsider = _user()
    _override_user(owner)

    created = client.post("/api/cases", json=_case_payload("Advocate action case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    streamed = client.post(
        f"/api/cases/{case_id}/advocate/messages/stream",
        json={"content": "Please draft a records request for the incident report and staff coverage notes."},
    )
    assert streamed.status_code == 200
    events = _sse_events(streamed)
    action = next(payload for name, payload in events if name == "action")
    assert action["type"] == "draft_records_request"

    _override_user(outsider)
    hidden = client.post(f"/api/cases/{case_id}/advocate/actions/{action['id']}/approve")
    assert hidden.status_code == 404

    _override_user(owner)
    rejected = client.post(f"/api/cases/{case_id}/advocate/actions/{action['id']}/reject")
    assert rejected.status_code == 200
    assert rejected.json()["action"]["status"] == "rejected"
    assert rejected.json()["executed"] is False

    streamed_again = client.post(
        f"/api/cases/{case_id}/advocate/messages/stream",
        json={"content": "Draft another records request for supervision notes."},
    )
    action_again = next(payload for name, payload in _sse_events(streamed_again) if name == "action")
    approved = client.post(f"/api/cases/{case_id}/advocate/actions/{action_again['id']}/approve")
    assert approved.status_code == 200
    assert approved.json()["action"]["status"] == "approved"
    assert approved.json()["action"]["requires_confirmation"] is True
    assert approved.json()["route"].endswith("/records")


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


def test_case_desired_outcome_can_be_updated_without_replacing_intake():
    user = _user()
    _override_user(user)

    draft = client.post("/api/cases/draft")
    case_id = draft.json()["id"]
    original_school = draft.json()["intake"]["school"]

    updated = client.patch(
        f"/api/cases/{case_id}",
        json={
            "desired_outcome": "A written safety plan and policy changes.",
            "desired_outcomes": [
                "Separate young children from older children during outdoor play",
                "Document critical incidents accurately",
                "",
            ],
        },
    )

    assert updated.status_code == 200
    body = updated.json()
    assert body["intake"]["desired_outcome"] == "A written safety plan and policy changes."
    assert body["intake"]["desired_outcomes"] == [
        "Separate young children from older children during outdoor play",
        "Document critical incidents accurately",
    ]
    assert body["intake"]["school"] == original_school


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


def test_case_document_category_filter_normalizes_legacy_kora_types():
    user = _user()
    _override_user(user)
    case = CaseRecord(
        id=f"case-{uuid.uuid4().hex[:6]}",
        workspace_id=user["workspace_id"],
        title="Legacy KORA categories",
        intake=CaseIntake(issue_type="student_safety", issue_categories=["student_safety"]),
    )
    cases[case.id] = case
    incident = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id=case.workspace_id,
        case_id=case.id,
        filename="Critical Incident Liam Crowley 4-3-26_Redacted.pdf",
        evidence_type="critical_incident",
        inferred_category="",
        processing_status="indexed",
        status="indexed",
    )
    policy = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id=case.workspace_id,
        case_id=case.id,
        filename="KSA 65-501 School-Age-Programs-Regulation-Book-PDF.pdf",
        evidence_type="policy",
        inferred_category="",
        processing_status="indexed",
        status="indexed",
    )
    case_documents[incident.id] = incident
    case_documents[policy.id] = policy

    incident_resp = client.get(f"/api/cases/{case.id}/documents?category=incident_safety")
    assert incident_resp.status_code == 200
    assert [doc["id"] for doc in incident_resp.json()] == [incident.id]

    policy_resp = client.get(f"/api/cases/{case.id}/documents?category=policy_rules")
    assert policy_resp.status_code == 200
    assert [doc["id"] for doc in policy_resp.json()] == [policy.id]


def test_legacy_demo_case_lists_orphaned_evidence_documents():
    user = _user(workspace_id="demo")
    _override_user(user)
    case = CaseRecord(
        id=f"crowley-v-usd232-{uuid.uuid4().hex[:6]}",
        workspace_id=user["workspace_id"],
        title="Legacy demo evidence",
        status=CaseStatus.DEMO,
        intake=CaseIntake(issue_type="student_safety", issue_categories=["student_safety"]),
    )
    cases[case.id] = case
    orphaned_doc = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id="legacy-import-workspace",
        case_id=case.id,
        filename="JA Critical Incident Report.pdf",
        evidence_type="critical_incident",
        processing_status="indexed",
        status="indexed",
    )
    case_documents[orphaned_doc.id] = orphaned_doc

    response = client.get(f"/api/cases/{case.id}/documents")

    assert response.status_code == 200
    assert [doc["id"] for doc in response.json()] == [orphaned_doc.id]


def test_case_document_search_includes_case_scoped_semantic_hits(monkeypatch):
    user = _user()
    _override_user(user)
    case = CaseRecord(
        id=f"case-{uuid.uuid4().hex[:6]}",
        workspace_id=user["workspace_id"],
        title="Semantic search case",
        intake=CaseIntake(issue_type="student_safety", issue_categories=["student_safety"]),
    )
    cases[case.id] = case
    keyword_doc = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id=case.workspace_id,
        case_id=case.id,
        filename="supervision-note.txt",
        extracted_text="Staff supervision note.",
        processing_status="indexed",
        status="indexed",
    )
    semantic_doc = CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:6]}",
        workspace_id=case.workspace_id,
        case_id=case.id,
        filename="JA report.pdf",
        extracted_text="No literal query terms here.",
        processing_status="indexed",
        status="indexed",
        qdrant_point_ids=["point-1"],
    )
    case_documents[keyword_doc.id] = keyword_doc
    case_documents[semantic_doc.id] = semantic_doc

    monkeypatch.setattr("app.services.qdrant_client.is_available", lambda: True)
    monkeypatch.setattr(
        "app.services.qdrant_client.search_case_documents_semantic",
        lambda query, case_id, limit=25: [
            {"document_id": semantic_doc.id, "case_id": case.id, "full_text": "meaning match", "_score": 0.87},
            {"document_id": "other-case-doc", "case_id": "other", "full_text": "leak", "_score": 0.99},
        ],
    )

    resp = client.get(f"/api/cases/{case.id}/documents/search?q=supervision")
    assert resp.status_code == 200
    body = resp.json()
    ids = [doc["id"] for doc in body["documents"]]
    assert semantic_doc.id in ids
    assert keyword_doc.id in ids
    assert "other-case-doc" not in ids
    assert body["semantic_available"] is True
    assert body["match_reasons"][semantic_doc.id] == ["meaning"]


def test_case_document_insight_fields_serialize():
    doc = CaseDocument(
        filename="incident-report.pdf",
        document_summary="Incident report documents the after-school injury.",
        case_relevance="Relevant to notice, supervision, and parent communication.",
        relevance_score=0.83,
        evidence_role="direct_incident_evidence",
        relevance_basis="Official incident report connected to the current incident.",
        relevance_factors=["directly describes the reported incident"],
        relevance_model="deterministic:evidence-relevance-v1",
        legal_flags=["supervision", "notice"],
        extraction_confidence=0.9,
        insight_status="ready",
        insight_error="",
        insight_model="deepinfra/test-model",
    )
    payload = doc.model_dump(mode="json")
    assert payload["document_summary"] == "Incident report documents the after-school injury."
    assert payload["case_relevance"] == "Relevant to notice, supervision, and parent communication."
    assert payload["relevance_score"] == 0.83
    assert payload["evidence_role"] == "direct_incident_evidence"
    assert payload["relevance_basis"].startswith("Official incident report")
    assert payload["legal_flags"] == ["supervision", "notice"]
    assert payload["extraction_confidence"] == 0.9
    assert payload["relevance_model"] == "deterministic:evidence-relevance-v1"
    assert payload["insight_status"] == "ready"
    assert payload["insight_model"] == "deepinfra/test-model"


def test_document_insights_are_generated_after_indexing(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    def fake_store_document_chunks(chunks, document_id, entity_ids=None, person_ids=None, source="", metadata=None):
        return [f"point-{document_id}-0"]

    monkeypatch.setattr("app.services.qdrant_client.store_document_chunks", fake_store_document_chunks)
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Insight case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    uploaded = client.post(
        f"/api/cases/{case_id}/documents",
        files={
            "file": (
                "incident-report.txt",
                b"The principal confirmed an incident report and parent notice after the playground injury.",
                "text/plain",
            )
        },
    )
    assert uploaded.status_code == 200

    fetched = client.get(f"/api/documents/{uploaded.json()['id']}")
    assert fetched.status_code == 200
    doc = fetched.json()
    assert doc["processing_status"] == "indexed"
    assert doc["insight_status"] == "ready"
    assert "incident" in doc["document_summary"].lower()
    assert doc["case_relevance"]
    assert 0 <= doc["relevance_score"] <= 1


def test_document_insight_skips_no_text_documents():
    from app.services.document_insights import generate_document_insight

    doc = CaseDocument(filename="photo.jpg", extracted_text="", processing_status="needs_review")
    result = generate_document_insight(doc, case=None)
    assert result.insight_status == "skipped"
    assert result.document_summary == ""
    assert result.extraction_confidence == 0.0
    assert "text" in result.insight_error.lower()


def _liam_incident_case() -> CaseRecord:
    return CaseRecord(
        workspace_id="liam-workspace",
        title="Liam JCPRD playground injury",
        intake=CaseIntake(
            district="USD 232",
            school="Mize Elementary",
            issue_type="student_safety",
            issue_categories=["student_safety", "supervision", "records"],
            incident_date="2026-04-02",
            narrative=(
                "Liam Crowley was injured during the JCPRD program at Mize Elementary after "
                "a physical altercation. The parent is concerned about supervision, prior notice, "
                "and the program's incident response."
            ),
            student_age=8,
            safety_risk=True,
        ),
    )


def test_literal_incident_report_uses_deterministic_direct_evidence_score(monkeypatch):
    from app.services.document_insights import generate_document_insight

    monkeypatch.setattr(
        "app.services.document_insights._run_document_insight_model",
        lambda _doc, _case: {
            "summary": "The document describes an incident involving Liam and another child.",
            "relevance": "The document is relevant to supervision concerns.",
            "relevance_score": 0.8,
            "tags": ["supervision"],
        },
    )
    doc = CaseDocument(
        workspace_id="liam-workspace",
        filename="JA Critical Incident 4.15.25_Redacted.pdf",
        evidence_type="incident_report",
        inferred_category="incident_safety",
        document_date="2026-04-02",
        extracted_text=(
            "Critical Incident Report. Student Liam Crowley was injured at Mize Elementary "
            "during the JCPRD after-school program on April 2, 2026. The report describes a "
            "physical altercation, staff supervision, parent notice, and medical follow-up."
        ),
        insight_status="pending",
    )

    result = generate_document_insight(doc, _liam_incident_case(), force=True)

    assert result.relevance_score == 1.0
    assert result.evidence_role == "direct_incident_evidence"
    assert result.relevance_model == "deterministic:evidence-relevance-v1"
    assert "official incident report" in result.relevance_basis.lower()
    assert "supervision" in result.legal_flags
    assert "injury_response" in result.legal_flags
    assert result.extraction_confidence >= 0.8


def test_policy_and_prior_incident_are_relevant_but_not_direct_current_incident(monkeypatch):
    from app.services.document_insights import generate_document_insight

    monkeypatch.setattr(
        "app.services.document_insights._run_document_insight_model",
        lambda _doc, _case: {
            "summary": "The document contains policy text and safety requirements.",
            "relevance": "It may help evaluate the program's standard of care.",
            "relevance_score": 0.93,
            "tags": ["policy"],
        },
    )
    doc = CaseDocument(
        workspace_id="liam-workspace",
        filename="KSA 65-501 School-Age-Programs-Regulation-Book-PDF.pdf",
        evidence_type="policy",
        inferred_category="school_records",
        extracted_text=(
            "Kansas child care licensing law and KDHE school-age program regulations. "
            "The document describes supervision, staff ratio, and program requirements."
        ),
        insight_status="pending",
    )

    result = generate_document_insight(doc, _liam_incident_case(), force=True)

    assert result.relevance_score < 1.0
    assert result.evidence_role == "policy_standard"
    assert "standard" in result.relevance_basis.lower()
    assert "supervision" in result.legal_flags


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
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    owner = _user()
    outsider = _user()
    _override_user(owner)

    created = client.post("/api/cases", json=_case_payload("Gmail beta case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    run = client.put("/api/gmail/rule", json={
        "case_id": case_id,
        "domains": ["usd232.org"],
        "email_addresses": ["principal@usd232.org"],
        "keywords": ["incident"],
        "include_attachments": True,
    })
    assert run.status_code == 200
    assert run.json()["connection"]["status"] == "setup_required"

    status = client.get(f"/api/gmail/status?case_id={case_id}")
    assert status.status_code == 200
    assert status.json()["configured"] is False
    assert status.json()["auth_provider"] == "clerk"
    assert status.json()["connections"][0]["rule"]["domains"] == ["usd232.org"]
    assert status.json()["connections"][0]["query"] == "(from:usd232.org OR to:usd232.org OR from:principal@usd232.org OR to:principal@usd232.org) incident"
    assert status.json()["connections"][0]["token_stored"] is False

    _override_user(outsider)
    hidden = client.get(f"/api/gmail/status?case_id={case_id}")
    assert hidden.status_code == 404


def test_gmail_backend_oauth_routes_are_removed(monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_clerk")
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Clerk-only Gmail case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    assert client.post("/api/gmail/oauth/start", json={"case_id": case_id}).status_code == 404
    assert client.get("/api/gmail/oauth/callback?code=abc&state=def").status_code == 404


def test_gmail_status_uses_clerk_google_token_when_scope_granted(monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_clerk")
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Clerk Gmail case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    saved = client.put("/api/gmail/rule", json={
        "case_id": case_id,
        "domains": ["usd232.org"],
        "email_addresses": [],
        "keywords": [],
        "include_attachments": True,
    })
    assert saved.status_code == 200
    assert saved.json()["connection"]["status"] == "needs_consent"

    def fake_token(clerk_user_id: str, required_scope: str = ""):
        assert clerk_user_id == user["clerk_user_id"]
        assert required_scope == "https://www.googleapis.com/auth/gmail.readonly"
        return {
            "token": "clerk-google-token",
            "scopes": ["openid", "email", "profile", required_scope],
        }

    def fake_profile(access_token: str):
        assert access_token == "clerk-google-token"
        return {"emailAddress": "parent@gmail.com", "historyId": "12345"}

    monkeypatch.setattr("app.api.gmail.fetch_clerk_google_oauth_token", fake_token)
    monkeypatch.setattr("app.api.gmail.gmail_user_profile", fake_profile)

    status = client.get(f"/api/gmail/status?case_id={case_id}")
    assert status.status_code == 200
    body = status.json()
    assert body["configured"] is True
    assert body["auth_provider"] == "clerk"
    assert body["connections"][0]["status"] == "connected"
    assert body["connections"][0]["google_email"] == "parent@gmail.com"
    assert body["connections"][0]["token_stored"] is False


def test_gmail_connect_returns_parent_safe_google_api_error(monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_clerk")
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Clerk Gmail disabled API case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    saved = client.put("/api/gmail/rule", json={
        "case_id": case_id,
        "domains": ["usd232.org"],
        "email_addresses": [],
        "keywords": [],
        "include_attachments": True,
    })
    assert saved.status_code == 200

    def fake_token(_clerk_user_id: str, required_scope: str = ""):
        return {
            "token": "clerk-google-token",
            "scopes": ["openid", "email", "profile", required_scope],
        }

    def fake_profile(_access_token: str):
        raise GmailImportError(
            "Gmail access is approved, but Gmail API is not enabled for Google Cloud project 649676222654. "
            "Enable Gmail API in Google Cloud, then check Gmail access again."
        )

    monkeypatch.setattr("app.api.gmail.fetch_clerk_google_oauth_token", fake_token)
    monkeypatch.setattr("app.api.gmail.gmail_user_profile", fake_profile)

    result = client.post("/api/gmail/connect", json={"case_id": case_id})

    assert result.status_code == 400
    detail = result.json()["detail"]
    assert detail == (
        "Gmail access is approved, but Gmail API is not enabled for Google Cloud project 649676222654. "
        "Enable Gmail API in Google Cloud, then check Gmail access again."
    )
    assert "{" not in detail
    assert "console.developers.google.com" not in detail


def test_gmail_search_uses_clerk_token_only(monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_clerk")
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Clerk Gmail search case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    saved = client.put("/api/gmail/rule", json={
        "case_id": case_id,
        "domains": ["usd232.org"],
        "email_addresses": [],
        "keywords": ["incident"],
        "include_attachments": True,
    })
    assert saved.status_code == 200
    connection_id = saved.json()["connection"]["id"]

    def fake_token(_clerk_user_id: str, required_scope: str = ""):
        return {
            "token": "clerk-google-token",
            "scopes": ["openid", "email", "profile", required_scope],
        }

    def fake_profile(_access_token: str):
        return {"emailAddress": "parent@gmail.com", "historyId": "12345"}

    def fake_get_json(path, access_token, params=None):
        assert access_token == "clerk-google-token"
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
                        {"name": "To", "value": "parent@gmail.com"},
                        {"name": "Subject", "value": "Incident follow-up"},
                        {"name": "Date", "value": "Tue, 28 Apr 2026 12:00:00 -0500"},
                    ],
                },
            }
        raise AssertionError(path)

    monkeypatch.setattr("app.api.gmail.fetch_clerk_google_oauth_token", fake_token)
    monkeypatch.setattr("app.api.gmail.gmail_user_profile", fake_profile)
    monkeypatch.setattr("app.services.gmail_importer.gmail_get_json", fake_get_json)

    result = client.post("/api/gmail/search", json={
        "case_id": case_id,
        "connection_id": connection_id,
        "max_results": 25,
    })
    assert result.status_code == 200
    body = result.json()
    assert body["query"] == "(from:usd232.org OR to:usd232.org) incident"
    assert body["messages"][0]["subject"] == "Incident follow-up"


def test_gmail_rule_can_be_cleared_without_disconnect(monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_clerk")
    user = _user()
    _override_user(user)

    created = client.post("/api/cases", json=_case_payload("Clear Gmail rule case"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    saved = client.put("/api/gmail/rule", json={
        "case_id": case_id,
        "domains": ["usd232.org", "jcocogov.org"],
        "email_addresses": ["principal@usd232.org"],
        "keywords": ["incident"],
        "include_attachments": True,
    })
    assert saved.status_code == 200
    assert saved.json()["connection"]["query"] == (
        "(from:jcocogov.org OR to:jcocogov.org OR from:usd232.org OR to:usd232.org "
        "OR from:principal@usd232.org OR to:principal@usd232.org) incident"
    )

    cleared = client.delete(f"/api/gmail/rule?case_id={case_id}")

    assert cleared.status_code == 200
    body = cleared.json()
    assert body["connection"]["status"] == "needs_consent"
    assert body["connection"]["rule"]["domains"] == []
    assert body["connection"]["rule"]["email_addresses"] == []
    assert body["connection"]["rule"]["keywords"] == []
    assert body["connection"]["has_rule"] is False


def test_gmail_import_stores_matching_message_and_attachment(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
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
    )
    gmail_connections[connection.id] = connection

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

    monkeypatch.setattr("app.services.gmail_importer.gmail_get_json", fake_get_json)

    run = import_matching_messages(connection, cases.get(case["id"]), access_token="access-token")
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
