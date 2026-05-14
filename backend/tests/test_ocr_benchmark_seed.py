import uuid

from app.api._store import case_documents, case_evaluations, cases
from app.models import CaseIntake, CaseRecord
from app.scripts.seed_ocr_benchmark import BENCHMARK_CASE_ID, seed_ocr_benchmark
from app.services.workspaces import resolve_user_workspace


def test_seed_ocr_benchmark_is_idempotent_and_does_not_touch_existing_case():
    owner_email = f"ocr-owner-{uuid.uuid4().hex[:8]}@example.com"
    user = resolve_user_workspace(clerk_user_id=f"user_{uuid.uuid4().hex[:8]}", email=owner_email)
    existing = CaseRecord(
        id=f"active-{uuid.uuid4().hex[:8]}",
        workspace_id=user["workspace_id"],
        title="Existing active case",
        intake=CaseIntake(narrative="Do not change this case."),
        family_narrative="Do not change this narrative.",
        created_by=user["id"],
    )
    cases[existing.id] = existing

    first = seed_ocr_benchmark(owner_email=owner_email, create_evaluation=True)
    second = seed_ocr_benchmark(owner_email=owner_email, create_evaluation=True)

    assert first["case_id"] == BENCHMARK_CASE_ID
    assert second["case_id"] == BENCHMARK_CASE_ID
    assert cases[existing.id].family_narrative == "Do not change this narrative."

    seeded = cases[BENCHMARK_CASE_ID]
    assert seeded.workspace_id == user["workspace_id"]
    assert seeded.advocate_state["seed_kind"] == "ocr_readiness_benchmark"
    assert seeded.advocate_state["source_basis"] == "synthetic_composite"
    assert seeded.title == "OCR Benchmark - Section 504 Access and Retaliation"
    assert len(seeded.family_narrative) > 900
    assert "synthetic benchmark tests" not in seeded.family_narrative.lower()
    assert "National Parents Union" in seeded.advocate_state["inspiration_note"]
    assert "504 evaluation" in seeded.family_narrative
    assert "excluded from aftercare" in seeded.family_narrative

    docs = [
        doc for doc in case_documents.values()
        if doc.workspace_id == user["workspace_id"] and doc.case_id == BENCHMARK_CASE_ID
    ]
    assert len(docs) == 9
    assert len({doc.id for doc in docs}) == 9
    filenames = {doc.filename for doc in docs}
    assert "parent-timeline-and-narrative.txt" in filenames
    assert "504-evaluation-request-email.txt" in filenames
    assert "aftercare-exclusion-email.txt" in filenames
    assert "generic-playground-safety-control.txt" in filenames
    assert any("I am writing this down because I do not want the story to get flattened" in doc.extracted_text for doc in docs)

    evaluations = [
        evaluation for evaluation in case_evaluations.values()
        if evaluation.workspace_id == user["workspace_id"] and evaluation.case_id == BENCHMARK_CASE_ID
    ]
    assert len(evaluations) == 1
    readiness = evaluations[0].result.ocr_readiness
    assert readiness.overall_status == "evidence_supported_ocr_question"
    reviewed_roles = {ref.role for ref in readiness.reviewed_evidence}
    assert {"parent_communication", "school_response", "student_record"} <= reviewed_roles
