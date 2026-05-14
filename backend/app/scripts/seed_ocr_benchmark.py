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
SEED_VERSION = "2026-05-14-v2"

DOC_SPECS = [
    {
        "id": "ocr-bench-parent-timeline",
        "filename": "parent-timeline-and-narrative.txt",
        "evidence_type": "parent_statement",
        "document_date": "2026-01-08",
        "description": "Parent timeline written in plain language before the formal 504 request.",
        "text": (
            "I am writing this down because I do not want the story to get flattened into one bad day. "
            "My son Mateo is in third grade. He is bright, funny, and usually wants to do the right thing, "
            "but his ADHD makes transitions, noise, and unstructured aftercare time hard for him. Since October, "
            "I have been getting calls that he is leaving the group, crying in the hallway, or being sent to the "
            "office instead of getting a calm reset. I have asked the school and aftercare staff to make a simple "
            "plan: one adult check-in when aftercare starts, a warning before transitions, and a quiet place to "
            "cool down before things escalate. I am worried that the school is treating this like misbehavior "
            "instead of a disability-related support need. I want a Section 504 evaluation so everyone is clear "
            "about what supports Mateo needs during the full school day and aftercare program."
        ),
    },
    {
        "id": "ocr-bench-medical-support",
        "filename": "pediatric-adhd-support-note.txt",
        "evidence_type": "student_record",
        "document_date": "2025-12-18",
        "description": "Parent-uploaded student support note documenting ADHD-related needs.",
        "text": (
            "Student record summary from pediatric visit dated December 18, 2025: Mateo has an ADHD diagnosis "
            "and benefits from predictable routines, advance transition warnings, short adult check-ins, and a "
            "quiet reset space when overstimulated. Parent reports after-school care has been the hardest part "
            "of the day because it is noisy, crowded, and less structured than class time."
        ),
    },
    {
        "id": "ocr-bench-504-request",
        "filename": "504-evaluation-request-email.txt",
        "evidence_type": "iep_504",
        "document_date": "2026-01-10",
        "description": "Parent request for Section 504 evaluation and aftercare accommodations.",
        "text": (
            "January 10, 2026 email from Maria Lopez to Principal Dunn and the 504 coordinator: I am requesting "
            "a Section 504 evaluation for my son Mateo because his ADHD is affecting access to school and the "
            "district aftercare program. I am also requesting interim accommodations while the evaluation is pending, "
            "including a transition warning before aftercare, a calm reset location, and a named adult check-in. "
            "Please confirm who is responsible for considering supports during aftercare."
        ),
    },
    {
        "id": "ocr-bench-classroom-log",
        "filename": "classroom-aftercare-incident-log.txt",
        "evidence_type": "incident_report",
        "document_date": "2026-01-16",
        "description": "School log showing recurring aftercare escalation before the complaint.",
        "text": (
            "January 16, 2026 behavior and aftercare log: Mateo became overwhelmed during the transition from "
            "homework club to gym. Staff noted he covered his ears, left the line, and cried near the cafeteria. "
            "The log says staff sent him to the office for pickup because aftercare did not have a quiet area or "
            "a written accommodation plan. Parent was called at 4:42 p.m."
        ),
    },
    {
        "id": "ocr-bench-school-delay",
        "filename": "school-delay-response.txt",
        "evidence_type": "communications",
        "document_date": "2026-01-24",
        "description": "School response delaying evaluation and accommodations discussion.",
        "text": (
            "January 24, 2026 response from Assistant Principal Reed: We are not starting a 504 evaluation at this "
            "time because Mateo's grades are passing. Aftercare is run by a separate program, so the school will not "
            "create a different supervision plan for him there. If aftercare staff cannot keep him with the group, "
            "you may need to pick him up early."
        ),
    },
    {
        "id": "ocr-bench-protected-complaint",
        "filename": "parent-disability-complaint-email.txt",
        "evidence_type": "communications",
        "document_date": "2026-01-31",
        "description": "Parent complaint documenting disability-related support concerns.",
        "text": (
            "January 31, 2026 parent email: I am complaining in writing that the district has refused to evaluate "
            "Mateo under Section 504 and has not considered disability-related accommodations for aftercare. This "
            "is not just a discipline issue. The same ADHD-related needs are showing up during a district program, "
            "and the answer cannot be that he is sent home instead of supported. Please treat this as a civil-rights "
            "and disability access complaint and tell me how to appeal the refusal to evaluate."
        ),
    },
    {
        "id": "ocr-bench-meeting-notes",
        "filename": "meeting-notes-after-complaint.txt",
        "evidence_type": "meeting_notes",
        "document_date": "2026-02-01",
        "description": "Parent notes from a school-aftercare meeting after the written complaint.",
        "text": (
            "February 1, 2026 parent notes from meeting with Assistant Principal Reed and aftercare site lead: "
            "Parent repeated the Section 504 evaluation request and asked whether aftercare staff could use the "
            "same supports recommended by Mateo's doctor. Staff said aftercare is not special education and that "
            "they would not promise a quiet space or one adult assigned to him. Parent said she was worried Mateo "
            "would be removed because she complained."
        ),
    },
    {
        "id": "ocr-bench-adverse-action",
        "filename": "aftercare-exclusion-email.txt",
        "evidence_type": "communications",
        "document_date": "2026-02-03",
        "description": "Adverse action after protected disability-related complaint.",
        "text": (
            "February 3, 2026 principal email: After your complaint last week, Mateo may not attend aftercare for "
            "the rest of this week. We need time to determine whether the program can safely serve him. We will not "
            "discuss 504 accommodations for aftercare until the district decides whether an evaluation is needed."
        ),
    },
    {
        "id": "ocr-bench-safety-control",
        "filename": "generic-playground-safety-control.txt",
        "evidence_type": "incident_report",
        "document_date": "2026-02-04",
        "description": "Control document with general safety facts but no protected basis by itself.",
        "text": (
            "February 4, 2026 generic playground safety memo: Staff reviewed playground supervision after a student "
            "fell near the climbing structure. The memo discusses ratios, radio use, and first-aid follow-up. It "
            "does not identify Mateo, does not discuss disability supports, and does not mention a 504 evaluation, "
            "civil-rights complaint, or accommodations."
        ),
    },
]


def _seed_clerk_id(email: str) -> str:
    digest = hashlib.sha256(email.lower().strip().encode("utf-8")).hexdigest()[:18]
    return f"seed_ocr_{digest}"


def _benchmark_case(user: dict) -> CaseRecord:
    narrative = (
        "My name is Maria Lopez, and I am trying to get help for my third-grade son, Mateo. Mateo has ADHD. "
        "He is not a bad kid, but he needs predictable transitions, short adult check-ins, and a quiet way to reset "
        "when the after-school program gets loud. Since the fall, I have been getting calls that he is crying, leaving "
        "the group, or being sent to the office during aftercare. I asked for simple supports first, then I asked in "
        "writing for a 504 evaluation on January 10, 2026 because the same disability-related needs were affecting "
        "his access to the school day and aftercare. The assistant principal responded that his grades were passing "
        "and that aftercare was separate, so they were not starting the 504 evaluation or creating an aftercare support "
        "plan. On January 31, I complained in writing that refusing to evaluate Mateo and sending him home instead of "
        "considering accommodations was a disability access problem. A few days later, on February 3, the principal "
        "emailed that Mateo was excluded from aftercare for the rest of the week after my complaint. I want the district "
        "to evaluate Mateo properly, consider accommodations that work in aftercare, explain who is responsible for the "
        "program, and stop treating my advocacy as the problem."
    )
    return CaseRecord(
        id=BENCHMARK_CASE_ID,
        workspace_id=user["workspace_id"],
        title="OCR Benchmark - Section 504 Access and Retaliation",
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
                "Complete a proper Section 504 evaluation, consider aftercare accommodations, remove the exclusion, "
                "explain who is responsible for supporting Mateo in the district aftercare program, and stop retaliating "
                "against the parent for raising disability-related concerns."
            ),
            desired_outcomes=[
                "Complete a Section 504 evaluation with parent input and relevant aftercare records.",
                "Decide whether Mateo needs transition, reset-space, and adult check-in accommodations during aftercare.",
                "Rescind or explain the aftercare exclusion and document any safety plan.",
                "Address whether the exclusion was connected to the January 31 disability complaint.",
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
            "source_basis": "synthetic_composite",
            "inspiration_note": (
                "Synthetic composite inspired by public parent-rights themes and National Parents Union advocacy priorities; "
                "it does not describe a real family or a real NPU-handled case."
            ),
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
