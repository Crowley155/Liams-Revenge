import io
import uuid
import zipfile

from fastapi.testclient import TestClient

from app.api._store import case_documents, cases
from app.api.deps import get_current_user
from app.main import app

client = TestClient(app)


def _zip_bytes(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return buf.getvalue()


def _post_import(zip_content: bytes, token: str, **data):
    form = {
        "owner_email": data.pop("owner_email", "william.crowley@gmail.com"),
        "case_id": data.pop("case_id", "crowley-v-usd232"),
        "dry_run": str(data.pop("dry_run", True)).lower(),
        "ocr_scope": data.pop("ocr_scope", "high_signal"),
        **data,
    }
    return client.post(
        "/api/maintenance/kora-import",
        data=form,
        files={"file": ("kora.zip", zip_content, "application/zip")},
        headers={"X-USDWATCH-MAINTENANCE-TOKEN": token},
    )


def _user(workspace_id: str, email: str = "william.crowley@gmail.com") -> dict:
    return {
        "id": f"u-{uuid.uuid4().hex[:8]}",
        "clerk_user_id": f"user_{uuid.uuid4().hex[:8]}",
        "email": email,
        "role": "admin",
        "workspace_id": workspace_id,
        "workspace": {
            "id": workspace_id,
            "name": f"{email} workspace",
            "type": "personal",
            "plan": "admin",
            "owner_user_id": "",
            "clerk_org_id": "",
        },
        "plan": "admin",
    }


def teardown_function():
    app.dependency_overrides.clear()


def test_kora_import_requires_maintenance_token(monkeypatch):
    monkeypatch.setenv("USDWATCH_MAINTENANCE_TOKEN", "secret-token")
    payload = _zip_bytes({"4 Inter agency communication/Communication/test.pdf": b"%PDF-1.4\n"})

    missing = client.post(
        "/api/maintenance/kora-import",
        data={"dry_run": "true"},
        files={"file": ("kora.zip", payload, "application/zip")},
    )
    assert missing.status_code == 403

    wrong = _post_import(payload, "wrong-token")
    assert wrong.status_code == 403


def test_kora_dry_run_returns_manifest_counts_without_writing(monkeypatch):
    monkeypatch.setenv("USDWATCH_MAINTENANCE_TOKEN", "secret-token")
    case_id = f"case-{uuid.uuid4().hex[:8]}"
    duplicate = b"%PDF-1.4\nsame"
    payload = _zip_bytes({
        "4 Inter agency communication/Communication/JA FW Incident Report Liam Crowley 1_Redacted.pdf": b"%PDF-1.4\none",
        "5 KDHE Critical Incident Filings/Critical Incident Liam Crowley 4-3-26_Redacted.pdf": duplicate,
        "7 Prior Incident Reports/Critical Incident Liam Crowley 4-3-26_Redacted copy.pdf": duplicate,
    })

    res = _post_import(payload, "secret-token", case_id=case_id, dry_run=True)
    assert res.status_code == 200
    body = res.json()
    assert body["dry_run"] is True
    assert body["total_files"] == 3
    assert body["unique_files"] == 2
    assert body["duplicate_groups"] == 1
    assert body["evidence_types"]["critical_incident"] == 2
    assert body["evidence_types"]["incident_report"] == 1
    assert body["low_text_count"] == 3
    assert body["high_signal_ocr_count"] >= 1
    assert cases.get(case_id) is None


def test_kora_import_attaches_private_case_and_builds_case_file(monkeypatch, tmp_path):
    token = "secret-token"
    owner_email = f"william.crowley+{uuid.uuid4().hex[:8]}@example.com"
    case_id = f"crowley-{uuid.uuid4().hex[:8]}"
    monkeypatch.setenv("USDWATCH_MAINTENANCE_TOKEN", token)
    monkeypatch.setenv("USDWATCH_CASE_OWNER_EMAILS", owner_email)
    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    large_pdf = b"%PDF-1.4\n" + (b"x" * (16 * 1024 * 1024))
    payload = _zip_bytes({
        "4 Inter agency communication/Communication/JA FW Incident Report Liam Crowley 1_Redacted.pdf": b"%PDF-1.4\nincident",
        "4 Inter agency communication/Communication/JA JCPRD Updated Critical Incident form-Mize Elementary 4_3_2026 (#0052177-020).pdf": b"%PDF-1.4\nupdated",
        "4 Inter agency communication/Communication/JA FW_ Refund for Liam Crowley.pdf": b"%PDF-1.4\nrefund",
        "8 JCPRD Mize OST Staff Logs/4.2.26 Staff Placement-Program Schedule.pdf": large_pdf,
    })

    imported = _post_import(
        payload,
        token,
        owner_email=owner_email,
        case_id=case_id,
        dry_run=False,
        ocr_scope="none",
    )
    assert imported.status_code == 200
    body = imported.json()
    assert body["workspace_id"]
    assert body["imported_documents"] == 4
    assert body["needs_review_documents"] == 4

    case = cases.get(case_id)
    assert case is not None
    assert case.workspace_id == body["workspace_id"]
    assert case.intake.school == "Mize Elementary"
    assert "student_safety" in case.intake.issue_categories

    large_docs = [
        doc for doc in case_documents.values()
        if doc.case_id == case_id and doc.file_size > 15 * 1024 * 1024
    ]
    assert large_docs
    assert large_docs[0].processing_status == "needs_review"
    assert large_docs[0].storage_path

    app.dependency_overrides[get_current_user] = lambda: _user(body["workspace_id"], owner_email)
    case_file = client.get(f"/api/cases/{case_id}/file")
    assert case_file.status_code == 200
    case_body = case_file.json()
    assert case_body["meta"]["source"] == "private_case_documents"
    assert len(case_body["evidence"]) == 4
    assert case_body["timeline"]
    assert case_body["evidenceGaps"]
    assert any(item["id"] == "kora-critical-incident-updates" for item in case_body["contradictions"])
    assert any(item["id"] == "kora-refund-drop-timing" for item in case_body["contradictions"])
    assert any(item["id"] == "kora-staffing-training-vs-incident" for item in case_body["contradictions"])

    app.dependency_overrides[get_current_user] = lambda: _user(f"outsider-{uuid.uuid4().hex[:8]}")
    hidden = client.get(f"/api/cases/{case_id}/file")
    assert hidden.status_code == 404
