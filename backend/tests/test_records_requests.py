import uuid

from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.main import app

client = TestClient(app)


def _user(workspace_id: str | None = None, plan: str = "admin") -> dict:
    wid = workspace_id or f"records-w-{uuid.uuid4().hex[:8]}"
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


def _case_payload(*, title: str, state: str = "KS", issue_type: str = "student_safety", iep_504_status: str = "") -> dict:
    return {
        "title": title,
        "state": state,
        "district": "Pilot Public Schools",
        "school": "Pilot Elementary",
        "issue_type": issue_type,
        "issue_categories": ["student_safety", "records"],
        "incident_date": "2026-04-02",
        "narrative": "My child was hurt at school and I need the official records showing what happened, who responded, and what policies applied.",
        "desired_outcome": "Get the records needed to understand what happened and what should change.",
        "student_age": 8,
        "school_setting": "public elementary school",
        "relationship_to_child": "parent_guardian",
        "iep_504_status": iep_504_status,
    }


def test_records_rule_packs_are_versioned_primary_source_packs():
    user = _user()
    _override_user(user)

    response = client.get("/api/records/rule-packs")

    assert response.status_code == 200
    packs = response.json()["rule_packs"]
    states = {pack["jurisdiction"] for pack in packs}
    assert {"KS", "MO", "CA", "TX", "FL", "NY"}.issubset(states)
    for pack in packs:
        assert pack["rule_pack_id"]
        assert pack["version"]
        assert pack["sources"]
        for source in pack["sources"]:
            assert source["rule_id"]
            assert source["title"]
            assert source["url"].startswith("https://")
            assert source["retrieved_at"]


def test_missouri_records_generation_uses_sunshine_law_not_kora():
    user = _user()
    _override_user(user)
    created = client.post("/api/cases", json=_case_payload(title="Missouri safety records case", state="MO"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    generated = client.post(f"/api/records/generate?case_id={case_id}")
    assert generated.status_code == 200

    listed = client.get(f"/api/records/requests?case_id={case_id}")
    assert listed.status_code == 200
    requests = listed.json()
    assert requests
    assert any(item["request_law_code"] == "MO_SUNSHINE" for item in requests)
    all_text = "\n".join(
        f"{item['legal_basis']}\n{item['letter_text']}\n{item['records_description']}"
        for item in requests
    )
    assert "Missouri Sunshine Law" in all_text
    assert "KORA" not in all_text
    assert "K.S.A." not in all_text


def test_special_education_records_generation_adds_federal_education_requests():
    user = _user()
    _override_user(user)
    created = client.post(
        "/api/cases",
        json=_case_payload(
            title="Texas special education records case",
            state="TX",
            issue_type="special_education",
            iep_504_status="IEP",
        ),
    )
    assert created.status_code == 200
    case_id = created.json()["id"]

    generated = client.post(f"/api/records/generate?case_id={case_id}")
    assert generated.status_code == 200

    records = client.get(f"/api/records/requests?case_id={case_id}").json()
    law_codes = {item["request_law_code"] for item in records}
    assert "TX_PUBLIC_INFORMATION" in law_codes
    assert "FERPA_EDUCATION_RECORDS" in law_codes
    assert "IDEA_SPECIAL_EDUCATION_RECORDS" in law_codes
    assert all("This is not legal advice" in item["cautions"] for item in records)


def test_unsupported_state_records_request_requires_jurisdiction_review():
    user = _user()
    _override_user(user)
    created = client.post("/api/cases", json=_case_payload(title="Unsupported state records case", state="ZZ"))
    assert created.status_code == 200
    case_id = created.json()["id"]

    generated = client.post(f"/api/records/generate?case_id={case_id}")
    assert generated.status_code == 200

    records = client.get(f"/api/records/requests?case_id={case_id}").json()
    public_request = next(item for item in records if item["request_type"] == "state_public_records")
    assert public_request["status"] == "needs_review"
    assert public_request["jurisdiction_confirmed"] is False
    assert public_request["request_law_code"] == "STATE_PUBLIC_RECORDS_UNSUPPORTED"
    assert "confirm the state public-records law" in public_request["legal_basis"].lower()
    assert "KORA" not in public_request["letter_text"]


def test_legacy_kora_product_endpoint_is_not_exposed():
    user = _user()
    _override_user(user)

    response = client.post("/api/kora/generate?case_id=missing")

    assert response.status_code == 404
