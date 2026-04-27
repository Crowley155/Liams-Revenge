from __future__ import annotations

import json
import logging
import os
from datetime import datetime

from app.api._store import agent_runs, case_evaluations
from app.models import (
    AgentRun,
    CaseDocument,
    CaseEvaluation,
    CaseEvaluationResult,
    CaseRecord,
    EvaluationGap,
    EvaluationIssueArea,
    EvaluationStatus,
    EvaluationTimelineEvent,
    EvidenceStrength,
    RecommendedRecord,
)

logger = logging.getLogger(__name__)

EXTRACTION_MODEL = os.getenv("DEEPINFRA_EXTRACTION_MODEL", "nvidia/NVIDIA-Nemotron-Nano-9B-v2")
REASONING_MODEL = os.getenv("DEEPINFRA_REASONING_MODEL", "nvidia/Nemotron-3-Nano-30B-A3B")
PREMIUM_MODEL = os.getenv("DEEPINFRA_PREMIUM_MODEL", "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B")
FALLBACK_MODEL = os.getenv("DEEPINFRA_FALLBACK_MODEL", "meta-llama/Llama-3.3-70B-Instruct-Turbo")

WORKFLOW_STEPS = [
    "intake",
    "evidence_extraction",
    "policy_records_research",
    "gap_analysis",
    "final_evaluation_synthesis",
]


def _model_for_step(step: str, *, premium: bool) -> str:
    if premium and step in {"gap_analysis", "final_evaluation_synthesis"}:
        return PREMIUM_MODEL
    if step == "evidence_extraction":
        return EXTRACTION_MODEL
    return REASONING_MODEL


def _content_from_response(response) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, CaseEvaluationResult):
        return content.model_dump_json()
    if isinstance(content, dict):
        return json.dumps(content)
    return str(content)


def _run_agno_step(step: str, prompt: str, model_id: str) -> str:
    if not os.getenv("DEEPINFRA_API_KEY"):
        raise RuntimeError("DEEPINFRA_API_KEY is not configured")

    try:
        from agno.agent import Agent
        from agno.models.deepinfra import DeepInfra
    except Exception as exc:  # pragma: no cover - depends on optional runtime package
        raise RuntimeError(f"Agno DeepInfra runtime unavailable: {exc}") from exc

    agent = Agent(
        name=f"USDWatch {step.replace('_', ' ').title()}",
        model=DeepInfra(id=model_id, temperature=0.1, max_tokens=4096),
        instructions=[
            "You evaluate school-district accountability cases for parents.",
            "Separate facts from hypotheses. Never claim legal certainty.",
            "Return concise, evidence-aware analysis with concrete records to request.",
        ],
        markdown=False,
    )
    return _content_from_response(agent.run(prompt))


def _parse_result(raw: str) -> CaseEvaluationResult:
    try:
        start = raw.find("{")
        end = raw.rfind("}")
        payload = raw[start:end + 1] if start >= 0 and end >= start else raw
        return CaseEvaluationResult.model_validate_json(payload)
    except Exception as exc:
        logger.warning("Agno result was not valid CaseEvaluationResult JSON: %s", exc)
        return _fallback_result(None, [], raw_notes=raw)


def _case_context(case: CaseRecord, documents: list[CaseDocument]) -> str:
    doc_blocks = []
    for doc in documents[:8]:
        text = (doc.extracted_text or "").strip()
        doc_blocks.append(
            "\n".join([
                f"Document {doc.id} ({doc.filename}, status={doc.processing_status or doc.status})",
                f"Evidence type: {doc.evidence_type or 'unspecified'}",
                f"Parent description: {doc.user_description or 'none'}",
                f"Document date: {doc.document_date or 'unknown'}",
                f"Source person: {doc.source_person or 'unknown'}",
                text[:3500] or "[no text extracted yet]",
            ])
        )

    return "\n\n".join([
        f"Case title: {case.title}",
        f"State: {case.intake.state}",
        f"District: {case.intake.district}",
        f"School: {case.intake.school}",
        f"Issue type: {case.intake.issue_type}",
        f"Issue categories: {', '.join(case.intake.issue_categories or [case.intake.issue_type])}",
        f"Incident date: {case.intake.incident_date or 'unknown'}",
        f"Impacted party age: {case.intake.impacted_party_age or case.intake.student_age or 'unknown'}",
        f"Grade level: {case.intake.grade_level or 'unknown'}",
        f"School setting: {case.intake.school_setting or 'unknown'}",
        f"Parent/user relationship: {case.intake.relationship_to_child or 'unknown'}",
        f"IEP/504 status: {case.intake.iep_504_status or 'unknown'}",
        f"Urgency level: {case.intake.urgency_level}",
        f"Safety risk: {case.intake.safety_risk}",
        f"Retaliation concern: {case.intake.retaliation_concern}",
        f"Prior actions: {', '.join(case.intake.prior_actions) if case.intake.prior_actions else 'none listed'}",
        f"Parent narrative:\n{case.intake.narrative}",
        f"Desired outcomes:\n{case.intake.desired_outcome or ', '.join(case.intake.desired_outcomes)}",
        "Uploaded evidence:\n" + ("\n\n".join(doc_blocks) if doc_blocks else "[none uploaded]"),
    ])


def _fallback_result(case: CaseRecord | None, documents: list[CaseDocument], raw_notes: str = "") -> CaseEvaluationResult:
    narrative = (case.intake.narrative if case else raw_notes).lower()
    categories = set(case.intake.issue_categories or [case.intake.issue_type]) if case else set()
    has_documents = any((doc.extracted_text or "").strip() for doc in documents)
    evidence_strength = EvidenceStrength.MIXED if has_documents else EvidenceStrength.THIN

    issues = [
        EvaluationIssueArea(
            area="Procedural safeguards and written notice",
            severity="high" if "iep" in narrative or "504" in narrative else "medium",
            why_it_matters="Parents usually need dated notices, meeting records, and policy references to show what the district knew and when.",
            policy_refs=["IDEA/Section 504 process", "District board policies", "Student handbook"],
            confidence=0.68 if narrative else 0.45,
        ),
        EvaluationIssueArea(
            area="Documentation consistency",
            severity="medium",
            why_it_matters="A strong case file reconciles emails, incident notes, meeting minutes, and staff statements into one timeline.",
            policy_refs=["Records retention", "Incident reporting procedures"],
            confidence=0.62 if has_documents else 0.48,
        ),
    ]
    if "student_safety" in categories or any(word in narrative for word in ("injury", "unsafe", "assault", "bully", "harass", "restraint", "seclusion")):
        issues.insert(
            0,
            EvaluationIssueArea(
                area="Student safety and supervision",
                severity="high",
                why_it_matters="Safety facts can change urgency, record targets, and escalation paths.",
                policy_refs=["Student safety policy", "Incident response policy"],
                confidence=0.72,
            ),
        )

    timeline = []
    if case and case.intake.incident_date:
        timeline.append(EvaluationTimelineEvent(
            date=case.intake.incident_date,
            label="Reported incident",
            detail="Parent-identified date from intake. Confirm with school records and correspondence.",
            confidence=0.65,
        ))
    for doc in documents[:4]:
        timeline.append(EvaluationTimelineEvent(
            date=doc.uploaded_at.date().isoformat(),
            label=f"Evidence uploaded: {doc.filename}",
            detail=(doc.extracted_text or "Document uploaded; text extraction still pending.")[:220],
            source_doc_id=doc.id,
            confidence=0.55 if doc.extracted_text else 0.35,
        ))

    gaps = [
        EvaluationGap(
            gap="Complete communication chronology",
            why_it_matters="Email and message exports establish notice, response time, and inconsistent explanations.",
            suggested_source="Parent inbox, district email search, teacher/principal correspondence",
            priority="high",
        ),
        EvaluationGap(
            gap="Applicable written policies and training materials",
            why_it_matters="Policy language gives the evaluator a concrete standard to compare against the facts.",
            suggested_source="Board policy manual, staff handbook, training records",
            priority="medium",
        ),
    ]
    if not has_documents:
        gaps.insert(
            0,
            EvaluationGap(
                gap="Primary source evidence",
                why_it_matters="The narrative is enough for an initial triage, but records are needed before making strong claims.",
                suggested_source="Upload emails, meeting notes, IEP/504 documents, incident reports, and prior complaints.",
                priority="high",
            ),
        )

    district = case.intake.district if case else "the district"
    recommended = [
        RecommendedRecord(
            title="Incident and investigation records",
            custodian=f"{district} records custodian",
            record_type="incident_reports",
            reason="Confirm the district's official version of events and any internal follow-up.",
            request_language="All incident reports, investigation notes, witness statements, and administrator communications related to the incident described in this request.",
            priority="high",
        ),
        RecommendedRecord(
            title="Policies, procedures, and training records",
            custodian=f"{district} records custodian",
            record_type="policy",
            reason="Compare staff conduct against the policy and training materials in effect at the time.",
            request_language="Policies, procedures, training materials, and staff acknowledgements governing the issue area identified in this case.",
            priority="medium",
        ),
    ]

    return CaseEvaluationResult(
        executive_summary=(
            "This case has enough information for an initial triage. The strongest next move is to turn the parent narrative into a dated evidence timeline, "
            "then request the official records that confirm notice, response, policy duties, and any internal inconsistencies."
        ),
        likely_claims=["procedural compliance", "notice and documentation", "policy implementation"],
        issue_areas=issues,
        timeline=timeline,
        evidence_strength=evidence_strength,
        gaps=gaps,
        recommended_records=recommended,
        next_steps=[
            "Upload the most complete email/message export available.",
            "Add any meeting notes, IEP/504 documents, incident reports, or prior written notices.",
            "Send targeted records requests for the highest-priority gaps before escalating.",
            "If you want attorney, advocacy, media, or parent-group support, use support preferences so nothing is shared without consent.",
        ],
        risk_flags=[
            "This is not legal advice and should be reviewed by counsel before filing a complaint.",
            "Claims may weaken if dates, notices, or official records cannot be tied to the specific student and incident.",
        ],
        confidence=0.62 if has_documents else 0.48,
    )


def run_case_evaluation(case: CaseRecord, documents: list[CaseDocument], evaluation: CaseEvaluation, *, premium: bool = False) -> CaseEvaluation:
    evaluation.status = EvaluationStatus.RUNNING
    evaluation.started_at = datetime.utcnow()
    evaluation.workflow_steps = WORKFLOW_STEPS.copy()
    evaluation.updated_at = datetime.utcnow()
    case_evaluations[evaluation.id] = evaluation

    context = _case_context(case, documents)
    step_notes: list[str] = []

    for step in WORKFLOW_STEPS:
        model_id = _model_for_step(step, premium=premium)
        run = AgentRun(
            workspace_id=case.workspace_id,
            case_id=case.id,
            evaluation_id=evaluation.id,
            agent_id=step,
            status="running",
            model_id=model_id,
        )
        agent_runs[run.id] = run

        try:
            if step == "final_evaluation_synthesis":
                prompt = (
                    "Return JSON matching this schema exactly: "
                    f"{CaseEvaluationResult.model_json_schema()}\n\n"
                    "Use the previous workflow notes and case context.\n\n"
                    f"Workflow notes:\n{json.dumps(step_notes, indent=2)}\n\n"
                    f"Case context:\n{context}"
                )
            else:
                prompt = f"Workflow step: {step}\n\nCase context:\n{context}\n\nReturn the highest-signal findings for this step."

            raw = _run_agno_step(step, prompt, model_id)
            step_notes.append(f"{step}: {raw[:3000]}")
            run.status = "complete"
            run.output_tokens = len(raw.split())
        except Exception as exc:
            logger.info("Using local evaluator fallback for %s: %s", step, exc)
            step_notes.append(f"{step}: local fallback completed")
            run.status = "fallback"
            run.error = str(exc)
        finally:
            run.completed_at = datetime.utcnow()
            agent_runs[run.id] = run

    try:
        final_note = step_notes[-1] if step_notes else ""
        if final_note.startswith("final_evaluation_synthesis:") and "{" in final_note:
            result = _parse_result(final_note.removeprefix("final_evaluation_synthesis:"))
        else:
            result = _fallback_result(case, documents)

        evaluation.result = result
        evaluation.status = EvaluationStatus.COMPLETE
        evaluation.completed_at = datetime.utcnow()
        evaluation.updated_at = datetime.utcnow()
        case_evaluations[evaluation.id] = evaluation
        return evaluation
    except Exception as exc:
        evaluation.status = EvaluationStatus.FAILED
        evaluation.error = str(exc)
        evaluation.completed_at = datetime.utcnow()
        evaluation.updated_at = datetime.utcnow()
        case_evaluations[evaluation.id] = evaluation
        raise
