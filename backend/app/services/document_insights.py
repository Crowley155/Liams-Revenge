from __future__ import annotations

from app.time import utc_now

import json
import logging
import re
from typing import Any

from app.config import settings
from app.models import CaseDocument, CaseRecord

logger = logging.getLogger(__name__)

INSIGHT_MODEL = settings.deepinfra_extraction_model


def _usable_text(doc: CaseDocument) -> str:
    text = (doc.extracted_text or "").strip()
    if not text or text.startswith("[OCR extraction needed:") or text.startswith("[page text extraction failed:"):
        return ""
    return text


def _clean_sentence(value: str, *, limit: int = 220) -> str:
    collapsed = re.sub(r"\s+", " ", value or "").strip()
    if not collapsed:
        return ""
    match = re.search(r"(.{40,}?[.!?])\s", collapsed + " ")
    sentence = match.group(1) if match else collapsed
    if len(sentence) <= limit:
        return sentence
    return sentence[:limit].rsplit(" ", 1)[0].rstrip(" ,;:") + "."


def _keyword_score(text: str, doc: CaseDocument, case: CaseRecord | None) -> float:
    haystack = " ".join([
        text[:5000],
        doc.filename,
        doc.inferred_category,
        doc.evidence_type,
        doc.user_description,
        " ".join(doc.tags),
        case.intake.narrative if case else "",
        " ".join(case.intake.issue_categories) if case else "",
    ]).lower()
    high_signal = (
        "incident",
        "injury",
        "notice",
        "parent",
        "supervision",
        "safety",
        "bullying",
        "harassment",
        "504",
        "iep",
        "policy",
        "kdhe",
        "ocr",
        "hospital",
        "concussion",
        "email",
        "principal",
    )
    hits = sum(1 for word in high_signal if word in haystack)
    score = 0.35 + min(0.5, hits * 0.055)
    if doc.inferred_category in {"incident_safety", "medical_provider", "iep_504_services", "messages"}:
        score += 0.08
    if doc.document_date:
        score += 0.04
    return round(max(0.05, min(0.98, score)), 2)


def _local_document_insight(doc: CaseDocument, case: CaseRecord | None) -> dict[str, Any]:
    text = _usable_text(doc)
    summary = _clean_sentence(text) or f"{doc.filename} contains extracted evidence text."
    score = _keyword_score(text, doc, case)
    issue_context = ""
    if case:
        issue_context = ", ".join(case.intake.issue_categories or [case.intake.issue_type])
    category = doc.inferred_category or doc.evidence_type or "evidence"
    relevance = (
        f"May help evaluate {issue_context or 'the parent case'} because it is {category.replace('_', ' ')} "
        "with dates, actors, or statements that can support the evidence timeline."
    )
    if any(word in text.lower() for word in ("incident", "injury", "unsafe", "supervision")):
        relevance = "May help establish what was known about the incident, safety response, supervision, and follow-up timeline."
    elif any(word in text.lower() for word in ("email", "from:", "subject:", "principal", "notice")):
        relevance = "May help establish notice, communication history, and how the school or program responded."

    return {
        "summary": summary,
        "relevance": relevance,
        "relevance_score": score,
        "tags": [],
    }


def _content_from_response(response: Any) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, dict):
        return json.dumps(content)
    return str(content)


def _parse_json_object(raw: str) -> dict[str, Any]:
    start = raw.find("{")
    end = raw.rfind("}")
    payload = raw[start:end + 1] if start >= 0 and end >= start else raw
    parsed = json.loads(payload)
    if not isinstance(parsed, dict):
        raise ValueError("model response was not a JSON object")
    return parsed


def _run_document_insight_model(doc: CaseDocument, case: CaseRecord | None) -> dict[str, Any]:
    if not settings.has_deepinfra:
        raise RuntimeError("DEEPINFRA_API_KEY is not configured")
    try:
        from agno.agent import Agent
        from agno.models.deepinfra import DeepInfra
    except Exception as exc:  # pragma: no cover - depends on optional runtime package
        raise RuntimeError(f"Agno DeepInfra runtime unavailable: {exc}") from exc

    case_context = "No case context was available."
    if case:
        case_context = "\n".join([
            f"Title: {case.title}",
            f"District: {case.intake.district}",
            f"School: {case.intake.school}",
            f"Issue categories: {', '.join(case.intake.issue_categories or [case.intake.issue_type])}",
            f"Parent narrative: {case.intake.narrative[:1800]}",
        ])

    prompt = (
        "Return strict JSON only with keys summary, relevance, relevance_score, tags.\n"
        "summary: 1-2 plain-English sentences about what this document appears to contain.\n"
        "relevance: why it may matter to this case, without legal certainty or overclaiming.\n"
        "relevance_score: number from 0 to 1.\n"
        "tags: short issue tags.\n\n"
        f"Case context:\n{case_context}\n\n"
        f"Document filename: {doc.filename}\n"
        f"Category: {doc.inferred_category or doc.evidence_type or 'unknown'}\n"
        f"Parent description: {doc.user_description or 'none'}\n"
        f"Document text:\n{_usable_text(doc)[:8000]}"
    )
    agent = Agent(
        name="USDWatch Document Insight",
        model=DeepInfra(id=INSIGHT_MODEL, temperature=0.1, max_tokens=900),
        instructions=[
            "You summarize parent advocacy evidence for stressed families.",
            "Separate facts from possible relevance. Never make legal conclusions.",
            "Return JSON only.",
        ],
        markdown=False,
    )
    return _parse_json_object(_content_from_response(agent.run(prompt)))


def generate_document_insight(doc: CaseDocument, case: CaseRecord | None = None, *, force: bool = False) -> CaseDocument:
    if doc.insight_status == "ready" and not force:
        return doc

    text = _usable_text(doc)
    if not text:
        doc.document_summary = ""
        doc.case_relevance = ""
        doc.relevance_score = 0.0
        doc.insight_status = "skipped"
        doc.insight_error = "No usable extracted text is available for AI document insight."
        doc.insight_generated_at = utc_now()
        doc.insight_model = ""
        return doc

    doc.insight_status = "pending"
    doc.insight_error = ""
    try:
        try:
            payload = _run_document_insight_model(doc, case)
            model_id = INSIGHT_MODEL
        except Exception as model_exc:
            logger.info("Using local document insight fallback for %s: %s", doc.id, model_exc)
            payload = _local_document_insight(doc, case)
            model_id = f"local-fallback:{INSIGHT_MODEL}"

        doc.document_summary = _clean_sentence(str(payload.get("summary") or ""), limit=260)
        doc.case_relevance = _clean_sentence(str(payload.get("relevance") or ""), limit=320)
        try:
            doc.relevance_score = round(max(0.0, min(1.0, float(payload.get("relevance_score", 0.0)))), 2)
        except (TypeError, ValueError):
            doc.relevance_score = _keyword_score(text, doc, case)
        tags = [str(tag).strip().lower().replace(" ", "_") for tag in payload.get("tags", []) if str(tag).strip()]
        if tags:
            doc.tags = sorted(set([*doc.tags, *tags[:5]]))
        if not doc.document_summary:
            doc.document_summary = _local_document_insight(doc, case)["summary"]
        if not doc.case_relevance:
            doc.case_relevance = _local_document_insight(doc, case)["relevance"]
        doc.insight_status = "ready"
        doc.insight_error = ""
        doc.insight_model = model_id
        doc.insight_generated_at = utc_now()
    except Exception as exc:
        logger.exception("Document insight generation failed for %s", doc.id)
        doc.insight_status = "failed"
        doc.insight_error = str(exc)
        doc.insight_generated_at = utc_now()
        doc.insight_model = INSIGHT_MODEL
    return doc
