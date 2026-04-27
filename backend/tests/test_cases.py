import uuid

from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.main import app

client = TestClient(app)


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


def test_case_document_metadata_and_artifacts_are_private_to_workspace():
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
    doc = uploaded.json()
    assert doc["processing_status"] == "indexed"
    assert doc["evidence_type"] == "meeting_notes"
    assert doc["user_description"] == "This shows the school knew about the incident."

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
