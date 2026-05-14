from __future__ import annotations

import argparse
import hashlib

from app.api._store import case_documents, case_evaluations, cases
from app.ai_runtime.evaluation import _fallback_result
from app.db import init_db
from app.models import CaseDocument, CaseEvaluation, CaseIntake, CaseRecord, CaseStatus, EvaluationStatus
from app.services.workspaces import resolve_user_workspace
from app.time import utc_now


DEFAULT_OWNER_EMAIL = "william.crowley@gmail.com"
BENCHMARK_CASE_ID = "ocr-benchmark-504-retaliation"
BENCHMARK_EVALUATION_ID = "ocr-bench-read"
SEED_KIND = "ocr_readiness_benchmark"
SEED_VERSION = "2026-05-14-v1"

DOC_SPECS = [
    {
        "id": "ocr-bench-504-request",
        "filename": "504-evaluation-request.txt",
        "evidence_type": "iep_504",
        "document_date": "2026-01-10",
        "description": "Parent request for Section 504 evaluation and accommodations.",
        "text": (
            "January 10, 2026 email to principal and 504 coordinator: I am requesting a Section 504 evaluation "
            "and accommodations for my child's ADHD. The aftercare setting has become unsafe without consistent "
            "supervision and behavior supports. Please confirm the evaluation process and interim supports."
        ),
    },
    {
        "id": "ocr-bench-school-delay",
        "filename": "school-delay-response.txt",
        "evidence_type": "communications",
        "document_date": "2026-01-24",
        "description": "School response delaying evaluation and accommodations discussion.",
        "text": (
            "January 24, 2026 response from assistant principal: We are not starting a 504 evaluation at this time. "
            "Aftercare is run separately, and we do not plan to discuss accommodations for that program."
        ),
    },
    {
        "id": "ocr-bench-protected-complaint",
        "filename": "parent-disability-complaint.txt",
        "evidence_type": "communications",
        "document_date": "2026-01-31",
        "description": "Parent complaint documenting disability-related support concerns.",
        "text": (
            "January 31, 2026 parent email: I am complaining in writing that the district has refused to evaluate "
            "my child under Section 504 and has not considered disability-related accommodations for aftercare."
        ),
    },
    {
        "id": "ocr-bench-adverse-action",
        "filename": "aftercare-exclusion-after-complaint.txt",
        "evidence_type": "communications",
        "document_date": "2026-02-03",
        "description": "Adverse action after protected disability-related complaint.",
        "text": (
            "February 3, 2026 principal email: After your complaint last week, your child may not attend aftercare "
            "for the rest of this week. We will not discuss 504 accommodations for aftercare."
        ),
    },
    {
        "id": "ocr-bench-safety-control",
        "filename": "generic-supervision-control.txt",
        "evidence_type": "incident_report",
        "document_date": "2026-02-04",
        "description": "Control document with general safety facts but no protected basis by itself.",
        "text": (
            "February 4, 2026 incident note: Staff reviewed playground supervision after a student fell. "
            "This note does not mention disability, race, sex, national origin, protected activity, or accommodations."
        ),
    },
]


def _seed_clerk_id(email: str) -> str:
    digest = hashlib.sha256(email.lower().strip().encode("utf-8")).hexdigest()[:18]
    return f"seed_ocr_{digest}"


def _benchmark_case(user: dict) -> CaseRecord:
    narrative = (
        "This synthetic benchmark tests whether USDWatch can identify an OCR-readiness theory without calling it a legal violation. "
        "The parent requested a Section 504 evaluation and aftercare accommodations for a child with ADHD on January 10, 2026. "
        "The school delayed or refused the evaluation discussion, the parent complained in writing on January 31, and the principal "
        "excluded the child from aftercare on February 3 after that complaint."
    )
    return CaseRecord(
        id=BENCHMARK_CASE_ID,
        workspace_id=user["workspace_id"],
        title="OCR Benchmark - Section 504 Retaliation",
        status=CaseStatus.ACTIVE,
        intake=CaseIntake(
            state="KS",
            district="Synthetic Test USD",
            school="Benchmark Elementary",
            issue_type="special_education",
            issue_categories=["special_education", "retaliation"],
            incident_date="2026-02-03",
            narrative=narrative,
            desired_outcome=(
                "Evaluate Section 504 eligibility, identify appropriate aftercare accommodations, and stop excluding the child "
                "because the parent raised disability-related concerns."
            ),
            desired_outcomes=[
                "Complete a Section 504 evaluation.",
                "Document aftercare accommodations and supervision supports.",
                "Address potential retaliation after the parent complaint.",
            ],
            impacted_party_age=9,
            grade_level="3rd grade",
            school_setting="public elementary school",
            relationship_to_child="parent_guardian",
            iep_504_status="504 requested",
            urgency_level="urgent",
            safety_risk=True,
            retaliation_concern=True,
            prior_actions=["Requested Section 504 evaluation", "Complained in writing"],
            urgent=True,
        ),
        family_narrative=narrative,
        advocate_state={
            "seed_kind": SEED_KIND,
            "seed_version": SEED_VERSION,
            "seeded_for": user["email"],
        },
        created_by=user["id"],
    )


def _seed_evaluation(case: CaseRecord, docs: list[CaseDocument]) -> CaseEvaluation:
    existing = case_evaluations.get(BENCHMARK_EVALUATION_ID)
    now = utc_now()
    evaluation = CaseEvaluation(
        id=BENCHMARK_EVALUATION_ID,
        workspace_id=case.workspace_id,
        case_id=case.id,
        status=EvaluationStatus.COMPLETE,
        model_tier="deterministic-seed",
        workflow_steps=["seeded_benchmark", "ocr_readiness_screening"],
        result=_fallback_result(case, docs),
        started_at=existing.started_at if existing and existing.started_at else now,
        completed_at=now,
        created_at=existing.created_at if existing else now,
        updated_at=now,
    )
    case_evaluations[evaluation.id] = evaluation
    return evaluation


def seed_ocr_benchmark(owner_email: str = DEFAULT_OWNER_EMAIL, *, create_evaluation: bool = False) -> dict:
    email = owner_email.lower().strip()
    user = resolve_user_workspace(clerk_user_id=_seed_clerk_id(email), email=email)
    now = utc_now()

    existing = cases.get(BENCHMARK_CASE_ID)
    if existing and existing.advocate_state.get("seed_kind") not in {"", SEED_KIND}:
        raise RuntimeError(f"Case id {BENCHMARK_CASE_ID} exists but is not an OCR benchmark seed")

    case = _benchmark_case(user)
    if existing:
        case.created_at = existing.created_at
    case.updated_at = now
    cases[case.id] = case

    expected_doc_ids = {spec["id"] for spec in DOC_SPECS}
    for doc in list(case_documents.values()):
        if (
            doc.case_id == BENCHMARK_CASE_ID
            and doc.source == "ocr_benchmark_seed"
            and doc.id not in expected_doc_ids
        ):
            case_documents.pop(doc.id, None)

    seeded_docs = []
    for spec in DOC_SPECS:
        existing_doc = case_documents.get(spec["id"])
        doc = CaseDocument(
            id=spec["id"],
            workspace_id=user["workspace_id"],
            case_id=BENCHMARK_CASE_ID,
            filename=spec["filename"],
            file_type="txt",
            file_size=len(spec["text"].encode("utf-8")),
            mime_type="text/plain",
            evidence_type=spec["evidence_type"],
            user_description=spec["description"],
            document_date=spec["document_date"],
            source="ocr_benchmark_seed",
            extracted_text=spec["text"],
            document_summary=spec["description"],
            status="indexed",
            processing_status="indexed",
            insight_status="ready",
            uploaded_at=existing_doc.uploaded_at if existing_doc else now,
            processed_at=now,
        )
        case_documents[doc.id] = doc
        seeded_docs.append(doc)

    evaluation = _seed_evaluation(case, seeded_docs) if create_evaluation else None

    return {
        "owner_email": email,
        "workspace_id": user["workspace_id"],
        "case_id": BENCHMARK_CASE_ID,
        "document_count": len(DOC_SPECS),
        "evaluation_id": evaluation.id if evaluation else "",
        "seed_version": SEED_VERSION,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the OCR readiness benchmark case.")
    parser.add_argument("--owner-email", default=DEFAULT_OWNER_EMAIL)
    parser.add_argument("--with-evaluation", action="store_true")
    args = parser.parse_args()
    init_db()
    result = seed_ocr_benchmark(owner_email=args.owner_email, create_evaluation=args.with_evaluation)
    print(result)


if __name__ == "__main__":
    main()
