from __future__ import annotations

import json
import logging
import re
from typing import Literal

from app.config import settings
from app.models import CaseDocument, CaseRecord

logger = logging.getLogger(__name__)

DRAFT_MODEL = settings.deepinfra_reasoning_model
DraftTarget = Literal["family_narrative", "desired_outcome"]


class CaseDraftSourceMissing(ValueError):
    """Raised when draft assist would have to invent source material."""


def _clean(value: str, *, limit: int = 2400) -> str:
    collapsed = re.sub(r"[ \t]+", " ", value or "").strip()
    collapsed = re.sub(r"\n{3,}", "\n\n", collapsed)
    return collapsed[:limit].strip()


def _filled(value: str) -> bool:
    return bool(_clean(value, limit=400))


def _draft_source_message(target: DraftTarget) -> str:
    if target == "family_narrative":
        return "Add a story or evidence before using Draft."
    return "Add a story, desired outcome, or evidence before using Draft."


def case_has_draft_source(case: CaseRecord, documents: list[CaseDocument], target: DraftTarget | None = None) -> bool:
    intake = case.intake
    has_documents = bool(documents)
    has_narrative = _filled(case.family_narrative) or _filled(intake.narrative)
    has_desired_outcome = _filled(intake.desired_outcome) or any(_filled(item) for item in intake.desired_outcomes)

    if target == "family_narrative":
        return has_documents or has_narrative
    if target == "desired_outcome":
        return has_documents or has_narrative or has_desired_outcome
    return has_documents or has_narrative or has_desired_outcome


def _doc_context(documents: list[CaseDocument]) -> str:
    blocks = []
    for doc in sorted(documents, key=lambda item: item.relevance_score or 0, reverse=True)[:8]:
        blocks.append("\n".join([
            f"{doc.id}: {doc.filename}",
            f"Date: {doc.document_date or doc.email_date or 'unknown'}",
            f"From: {doc.source_person or doc.email_from or 'unknown'}",
            f"Summary: {doc.document_summary or doc.case_relevance or (doc.extracted_text or '')[:500] or 'No extracted text yet.'}",
        ]))
    return "\n\n".join(blocks) if blocks else "No uploaded evidence yet."


def _case_context(case: CaseRecord, documents: list[CaseDocument]) -> str:
    return "\n".join([
        f"Title: {case.title}",
        f"District: {case.intake.district}",
        f"School: {case.intake.school}",
        f"Incident date: {case.intake.incident_date or 'unknown'}",
        f"Issue categories: {', '.join(case.intake.issue_categories or [case.intake.issue_type])}",
        f"Family narrative: {case.family_narrative or case.intake.narrative or 'not entered'}",
        f"Desired outcome: {case.intake.desired_outcome or ', '.join(case.intake.desired_outcomes) or 'not entered'}",
        f"Evidence:\n{_doc_context(documents)}",
    ])


def _fallback_family_narrative(case: CaseRecord, documents: list[CaseDocument]) -> str:
    narrative = _clean(case.family_narrative or case.intake.narrative)
    district = case.intake.district or "the district"
    school = case.intake.school or "the school"
    if narrative:
        lead = narrative.rstrip(".")
    else:
        lead = f"My child was affected by a safety or support issue involving {school} and {district}"
    evidence_note = ""
    if documents:
        strongest = sorted(documents, key=lambda doc: doc.relevance_score or 0, reverse=True)[0]
        evidence_note = f" The strongest evidence currently in the case file appears to be {strongest.filename}."
    return _clean(
        f"{lead}. I am asking for a clear, factual review of what happened, who was responsible for supervision or follow-up, "
        f"what records exist, and what needs to change so this does not happen again.{evidence_note}"
    )


def _fallback_desired_outcome(case: CaseRecord, _documents: list[CaseDocument]) -> str:
    school = case.intake.school or "the school"
    district = case.intake.district or "the district"
    lines = [
        f"A written explanation of what {school} and {district} believe happened, including who was responsible for supervision and response.",
        "All incident, investigation, communication, policy, training, and supervision records connected to the event.",
        "A safety plan that explains how supervision, separation, parent notification, and medical-response decisions will be handled going forward.",
        "Corrections to any inaccurate or incomplete records shared with the family.",
    ]
    if case.intake.retaliation_concern:
        lines.append("Written assurance that the family and child will not face retaliation for asking questions or requesting records.")
    return "\n".join(f"- {line}" for line in lines)


def _fallback_draft(case: CaseRecord, documents: list[CaseDocument], target: DraftTarget) -> str:
    if target == "desired_outcome":
        return _fallback_desired_outcome(case, documents)
    return _fallback_family_narrative(case, documents)


def _parse_model_json(raw: str) -> str:
    start = raw.find("{")
    end = raw.rfind("}")
    payload = raw[start:end + 1] if start >= 0 and end >= start else raw
    parsed = json.loads(payload)
    return _clean(str(parsed.get("draft") or ""))


def _run_model(case: CaseRecord, documents: list[CaseDocument], target: DraftTarget) -> str:
    if not settings.has_deepinfra:
        raise RuntimeError("DEEPINFRA_API_KEY is not configured")
    try:
        from agno.agent import Agent
        from agno.models.deepinfra import DeepInfra
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f"Agno DeepInfra runtime unavailable: {exc}") from exc

    target_label = "family narrative" if target == "family_narrative" else "desired outcome"
    prompt = (
        "Return strict JSON only: {\"draft\":\"...\"}.\n"
        f"Draft a parent-facing {target_label} for this case.\n"
        "Use plain language, first person where natural, and avoid legal conclusions or guarantees.\n"
        "Do not invent facts. If the evidence is thin, keep the wording careful.\n\n"
        f"Case context:\n{_case_context(case, documents)}"
    )
    agent = Agent(
        name="USDWatch Case Draft Assist",
        model=DeepInfra(id=DRAFT_MODEL, temperature=0.2, max_tokens=1200),
        instructions=[
            "You help parents draft factual case text.",
            "Do not provide legal advice or claim certainty.",
            "Return JSON only.",
        ],
        markdown=False,
    )
    response = agent.run(prompt)
    content = getattr(response, "content", response)
    return _parse_model_json(str(content))


def draft_case_text(case: CaseRecord, documents: list[CaseDocument], target: DraftTarget) -> dict:
    if not case_has_draft_source(case, documents, target):
        raise CaseDraftSourceMissing(_draft_source_message(target))

    try:
        draft = _run_model(case, documents, target)
        if draft:
            return {"target": target, "draft": draft, "model_route": f"agno:{DRAFT_MODEL}", "sources": [doc.id for doc in documents[:8]]}
    except Exception as exc:
        logger.info("Using local case draft assist fallback for %s: %s", case.id, exc)
    return {
        "target": target,
        "draft": _fallback_draft(case, documents, target),
        "model_route": f"local-fallback:{DRAFT_MODEL}",
        "sources": [doc.id for doc in documents[:8]],
    }
