import uuid

from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.api._store import case_documents
from app.ai_runtime.ocr_readiness import OCR_SOURCE_PACK, assess_ocr_readiness
from app.main import app
from app.models import CaseDocument, CaseIntake, CaseRecord


client = TestClient(app)


def _user(workspace_id: str | None = None) -> dict:
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
            "plan": "admin",
            "owner_user_id": "",
            "clerk_org_id": "",
        },
        "plan": "admin",
    }


def _override_user(user: dict):
    app.dependency_overrides[get_current_user] = lambda: user


def teardown_function():
    app.dependency_overrides.clear()


def _case(workspace_id: str, narrative: str, **intake_overrides) -> CaseRecord:
    intake = CaseIntake(
        state="KS",
        district=intake_overrides.pop("district", "Test USD"),
        school=intake_overrides.pop("school", "Test Elementary"),
        issue_type=intake_overrides.pop("issue_type", "student_safety"),
        issue_categories=intake_overrides.pop("issue_categories", ["student_safety"]),
        incident_date=intake_overrides.pop("incident_date", "2026-02-03"),
        narrative=narrative,
        desired_outcome=intake_overrides.pop("desired_outcome", "Understand next records to gather."),
        school_setting="public elementary school",
        **intake_overrides,
    )
    return CaseRecord(
        id=f"case-{uuid.uuid4().hex[:8]}",
        workspace_id=workspace_id,
        title="OCR readiness test case",
        intake=intake,
        family_narrative=narrative,
        created_by="test",
    )


def _doc(workspace_id: str, case_id: str, text: str, *, filename: str = "evidence.txt") -> CaseDocument:
    return CaseDocument(
        id=f"doc-{uuid.uuid4().hex[:8]}",
        workspace_id=workspace_id,
        case_id=case_id,
        filename=filename,
        file_type="txt",
        evidence_type="communications",
        extracted_text=text,
        status="indexed",
        processing_status="indexed",
    )


def test_ocr_source_pack_entries_have_required_metadata():
    assert OCR_SOURCE_PACK
    for source in OCR_SOURCE_PACK:
        assert source.id
        assert source.title
        assert source.url.startswith("https://")
        assert source.summary
        assert source.retrieved_at


def test_generic_student_safety_case_is_not_ocr_ready():
    workspace_id = f"w-{uuid.uuid4().hex[:8]}"
    case = _case(
        workspace_id,
        "My child was injured during aftercare. The school has not explained supervision, staffing, or incident reporting.",
    )
    document = _doc(
        workspace_id,
        case.id,
        "Incident report says a student fell during aftercare. Staff notified the parent and reviewed supervision.",
    )

    result = assess_ocr_readiness(case, [document])

    assert result.overall_status == "no_ocr_theory_indicated"
    assert not result.potential_allegations
    assert any(gate.key == "protected_basis" and gate.status == "not_supported" for gate in result.gates)
    assert any("safety" in route.lower() or "records" in route.lower() for route in result.non_ocr_routes)


def test_crowley_safety_case_with_generic_civil_rights_language_is_not_ocr_ready():
    workspace_id = f"w-{uuid.uuid4().hex[:8]}"
    case = _case(
        workspace_id,
        (
            "My six-year-old son was attacked by a nine-year-old during the JCPRD aftercare program at Mize Elementary "
            "on April 2, 2026. I am concerned about aftercare supervision, incident reporting, district oversight, "
            "and policy reform so children are kept safe from harm."
        ),
        issue_type="student_safety",
        issue_categories=["student_safety", "records", "supervision", "kora_response"],
        incident_date="2026-04-02",
        district="USD 232",
        school="Mize Elementary",
        desired_outcome=(
            "I want the district and JCPRD to review and improve supervision policies and procedures for after-school programs."
        ),
        iep_504_status="",
        retaliation_concern=False,
    )
    docs = [
        _doc(
            workspace_id,
            case.id,
            (
                "General liability policy excludes employment practices claims based on race, national origin, sex, "
                "disability, harassment, retaliation, evaluations, demotion, and related services."
            ),
            filename="general-liability-policy.pdf",
        ),
        _doc(
            workspace_id,
            case.id,
            (
                "Staff training manual includes generic equal employment opportunity language, sexual harassment policy, "
                "ADA notice, ADHD medication storage examples, and retaliation policy links."
            ),
            filename="staff-training-manual.pdf",
        ),
        _doc(
            workspace_id,
            case.id,
            (
                "Prior incident report for another child says a parent mentioned an IEP and accommodations. "
                "This report does not involve this child or the April 2 incident."
            ),
            filename="other-student-incident.pdf",
        ),
    ]

    result = assess_ocr_readiness(case, docs)

    assert result.overall_status == "no_ocr_theory_indicated"
    assert result.confidence == "low"
    assert not result.potential_allegations
    assert any(gate.key == "protected_basis" and gate.status == "not_supported" for gate in result.gates)
    assert any(gate.key == "protected_activity" and gate.status == "not_supported" for gate in result.gates)
    assert any(gate.key == "evidence_support" and gate.status == "not_applicable" for gate in result.gates)
    assert all("504" not in item and "IEP" not in item for item in result.recommended_records)
    assert result.reviewed_evidence
    assert all(ref.role in {"insurance_contract", "staff_training", "comparator_incident"} for ref in result.reviewed_evidence)


def test_section_504_retaliation_case_flags_ocr_readiness_with_scoped_evidence():
    workspace_id = f"w-{uuid.uuid4().hex[:8]}"
    case = _case(
        workspace_id,
        (
            "On January 10, 2026 I requested a Section 504 evaluation and accommodations for my child's ADHD. "
            "After I complained in writing about disability supports, the principal excluded my child from aftercare "
            "on February 3, 2026 and said the school would not discuss accommodations."
        ),
        issue_type="special_education",
        issue_categories=["special_education", "retaliation"],
        iep_504_status="504",
        retaliation_concern=True,
        desired_outcome="Evaluate my child for a 504 plan and stop excluding him from aftercare.",
    )
    request_doc = _doc(
        workspace_id,
        case.id,
        "January 10, 2026 email to principal: I am requesting a Section 504 evaluation and accommodations for ADHD.",
        filename="504-request.txt",
    )
    adverse_doc = _doc(
        workspace_id,
        case.id,
        "February 3, 2026 principal email: after your complaint, your child may not attend aftercare this week.",
        filename="aftercare-exclusion.txt",
    )
    safety_control_doc = _doc(
        workspace_id,
        case.id,
        "Generic safety note: this playground supervision note does not mention disability, race, sex, or national origin concerns.",
        filename="safety-control.txt",
    )
    other_case_doc = _doc(
        workspace_id,
        "different-case",
        "This unrelated document should never be cited in this case.",
        filename="wrong-case.txt",
    )

    result = assess_ocr_readiness(case, [request_doc, adverse_doc, safety_control_doc, other_case_doc])

    assert result.overall_status == "evidence_supported_ocr_question"
    theories = " ".join(item.theory for item in result.potential_allegations).lower()
    assert "504" in theories
    assert "retaliation" in theories
    assert "title vi" not in theories
    cited_ids = {
        evidence_id
        for allegation in result.potential_allegations
        for evidence_id in allegation.evidence_ids
    }
    assert request_doc.id in cited_ids
    assert adverse_doc.id in cited_ids
    assert safety_control_doc.id not in cited_ids
    assert other_case_doc.id not in cited_ids
    assert any(ref.document_id == request_doc.id and ref.route.endswith(f"/locker/{request_doc.id}") for ref in result.reviewed_evidence)
    assert any(ref.id == "ocr-504-fape-reg" for ref in result.source_refs)


def test_case_evaluation_persists_deterministic_ocr_readiness(monkeypatch):
    monkeypatch.delenv("DEEPINFRA_API_KEY", raising=False)
    user = _user()
    _override_user(user)

    created = client.post(
        "/api/cases",
        json={
            "title": "OCR API case",
            "state": "KS",
            "district": "Test USD",
            "school": "Test Elementary",
            "issue_type": "special_education",
            "issue_categories": ["special_education", "retaliation"],
            "incident_date": "2026-02-03",
            "narrative": (
                "On January 10, 2026 I requested a Section 504 evaluation for ADHD. "
                "On February 3, 2026 the school excluded my child from aftercare after I complained."
            ),
            "desired_outcome": "Evaluate the disability supports and stop excluding my child.",
            "iep_504_status": "504",
            "retaliation_concern": True,
        },
    )
    assert created.status_code == 200
    case_id = created.json()["id"]
    doc = _doc(
        user["workspace_id"],
        case_id,
        "January 10, 2026: parent requested Section 504 evaluation. February 3, 2026: after complaint, child excluded from aftercare.",
    )
    case_documents[doc.id] = doc

    started = client.post(f"/api/cases/{case_id}/evaluations")
    assert started.status_code == 200
    fetched = client.get(f"/api/cases/{case_id}/evaluations/{started.json()['id']}")
    assert fetched.status_code == 200
    body = fetched.json()

    assert body["status"] == "complete"
    assert body["result"]["ocr_readiness"]["overall_status"] == "evidence_supported_ocr_question"
    assert body["result"]["ocr_readiness"]["source_refs"]
    assert body["result"]["ocr_readiness"]["schema_version"] == "ocr_readiness_v2"
