from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import re

from app.models import CaseDocument, CaseRecord

RELEVANCE_MODEL_ID = "deterministic:evidence-relevance-v1"


@dataclass(frozen=True)
class EvidenceRelevance:
    score: float
    role: str
    basis: str
    factors: list[str] = field(default_factory=list)
    legal_flags: list[str] = field(default_factory=list)
    extraction_confidence: float = 0.0
    model_id: str = RELEVANCE_MODEL_ID


def _normalized(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


def _contains_any(haystack: str, terms: tuple[str, ...]) -> bool:
    for term in terms:
        if re.fullmatch(r"[a-z0-9]+", term):
            if re.search(rf"\b{re.escape(term)}\b", haystack):
                return True
        elif term in haystack:
            return True
    return False


def _usable_text(doc: CaseDocument) -> str:
    text = (doc.extracted_text or "").strip()
    if not text or text.startswith("[OCR extraction needed:") or text.startswith("[page text extraction failed:"):
        return ""
    return text


def _date_variants(value: str | None) -> set[str]:
    if not value:
        return set()
    variants = {_normalized(value)}
    try:
        parsed = datetime.fromisoformat(value[:10])
    except ValueError:
        return variants
    month = parsed.strftime("%B").lower()
    short_month = parsed.strftime("%b").lower()
    variants.update({
        parsed.strftime("%Y-%m-%d").lower(),
        parsed.strftime("%m/%d/%Y").lower(),
        f"{parsed.month}/{parsed.day}/{parsed.year}",
        f"{month} {parsed.day}, {parsed.year}",
        f"{short_month} {parsed.day}, {parsed.year}",
    })
    return variants


def _case_terms(case: CaseRecord | None) -> set[str]:
    if not case:
        return set()
    raw_terms = [
        case.title,
        case.intake.district,
        case.intake.school,
        case.intake.issue_type,
        case.intake.grade_level,
        case.intake.school_setting,
        *case.intake.issue_categories,
    ]
    terms = {_normalized(term) for term in raw_terms if _normalized(term)}
    narrative = case.intake.narrative or ""
    for token in re.findall(r"\b[A-Z][a-z]{2,}\b", narrative):
        lowered = token.lower()
        if lowered not in {"the", "parent", "student", "school", "program"}:
            terms.add(lowered)
    return {term for term in terms if len(term) >= 3}


def _case_alignment(haystack: str, case: CaseRecord | None, doc: CaseDocument) -> tuple[bool, list[str]]:
    if not case:
        return False, []
    factors: list[str] = []
    terms = _case_terms(case)
    matched_terms = [term for term in terms if term in haystack]
    if matched_terms:
        factors.append("matches case people, school, district, or issue terms")
    date_matches = False
    if doc.document_date and case.intake.incident_date and doc.document_date[:10] == case.intake.incident_date[:10]:
        date_matches = True
    else:
        date_matches = any(variant and variant in haystack for variant in _date_variants(case.intake.incident_date))
    if date_matches:
        factors.append("matches the reported incident date")
    return bool(matched_terms and (date_matches or len(matched_terms) >= 2)), factors


def _extraction_confidence(doc: CaseDocument) -> float:
    text = _usable_text(doc)
    if not text:
        return 0.0
    length = len(text)
    if length < 120:
        return 0.55
    if length < 600:
        return 0.82
    return 0.9


def _legal_flags(haystack: str) -> list[str]:
    flag_terms: list[tuple[str, tuple[str, ...]]] = [
        ("supervision", ("supervision", "supervise", "monitor", "active supervision")),
        ("staffing", ("staff ratio", "ratio", "staffing", "teacher", "teachers", "staff level")),
        ("injury_response", ("injury", "injured", "medical", "hospital", "emergency room", "emergency", "concussion", "bruise", "first aid")),
        ("notice", ("notice", "notified", "notification", "parent", "guardian", "principal", "email", "communication")),
        ("policy_standard", ("policy", "regulation", "kdhe", "ksa", "licensing", "statute", "guideline", "standard")),
        ("age_grouping", ("older", "younger", "age", "grade", "group", "separate")),
        ("prior_incidents", ("prior", "previous", "another child", "other child", "other incident", "suspended")),
        ("investigation_records", ("incident report", "critical incident", "witness", "interview", "investigation", "amended")),
        ("disability_supports", ("iep", "504", "accommodation", "disability")),
        ("civil_rights", ("retaliation", "discrimination", "ocr", "civil rights")),
    ]
    return [flag for flag, terms in flag_terms if _contains_any(haystack, terms)]


def _bound(value: float, lower: float, upper: float) -> float:
    return round(max(lower, min(upper, value)), 2)


def score_document_relevance(
    doc: CaseDocument,
    case: CaseRecord | None = None,
    *,
    model_score: float | None = None,
) -> EvidenceRelevance:
    """Assign stable evidence relevance independent of LLM scoring drift."""
    text = _usable_text(doc)
    haystack = _normalized(
        " ".join([
            text[:8000],
            doc.filename,
            doc.evidence_type,
            doc.inferred_category,
            doc.user_description,
            doc.document_date or "",
            " ".join(doc.tags),
        ])
    )
    model_score = _bound(float(model_score or 0.0), 0.0, 1.0)
    extraction = _extraction_confidence(doc)
    flags = _legal_flags(haystack)
    aligned, alignment_factors = _case_alignment(haystack, case, doc)

    is_incident = doc.evidence_type == "incident_report" or doc.inferred_category == "incident_safety" or _contains_any(
        haystack,
        ("incident report", "critical incident", "physical altercation", "injury", "injured", "assault", "bullying"),
    )
    is_policy = doc.evidence_type == "policy" or _contains_any(
        haystack,
        ("policy", "regulation", "kdhe", "ksa", "licensing", "statute", "staff ratio", "standard"),
    )
    is_medical = doc.inferred_category == "medical_provider" or _contains_any(
        haystack,
        ("hospital", "emergency room", "doctor", "medical", "concussion", "diagnosis", "bone bruise"),
    )
    is_notice = doc.inferred_category == "messages" or _contains_any(
        haystack,
        ("email", "from:", "subject:", "notice", "notified", "principal", "parent communication"),
    )

    if is_incident and aligned:
        return EvidenceRelevance(
            score=1.0,
            role="direct_incident_evidence",
            basis="Official incident report or incident record matching the child, school, program, or incident date.",
            factors=["directly describes the reported incident", *alignment_factors],
            legal_flags=flags,
            extraction_confidence=extraction,
        )
    if is_medical and aligned:
        return EvidenceRelevance(
            score=0.96,
            role="medical_harm_evidence",
            basis="Medical or provider record connected to the reported harm and response timeline.",
            factors=["documents injury or treatment", *alignment_factors],
            legal_flags=flags,
            extraction_confidence=extraction,
        )
    if is_notice and aligned:
        return EvidenceRelevance(
            score=_bound(max(0.88, model_score), 0.88, 0.94),
            role="notice_communication",
            basis="Communication evidence that may show what the school or program knew and when it responded.",
            factors=["supports notice or response timeline", *alignment_factors],
            legal_flags=flags,
            extraction_confidence=extraction,
        )
    if is_policy:
        return EvidenceRelevance(
            score=_bound(max(0.82, model_score), 0.78, 0.92),
            role="policy_standard",
            basis="Policy, regulation, or standard-of-care material for comparing program conduct against required practice.",
            factors=["states rules or standards that may govern the program", *alignment_factors],
            legal_flags=flags,
            extraction_confidence=extraction,
        )
    if is_incident:
        return EvidenceRelevance(
            score=_bound(max(0.72, model_score), 0.68, 0.86),
            role="prior_or_related_incident",
            basis="Incident or safety record that may show notice, pattern, or similar risk, but does not directly match the current incident.",
            factors=["describes safety or injury events"],
            legal_flags=flags,
            extraction_confidence=extraction,
        )

    return EvidenceRelevance(
        score=_bound(max(0.35, model_score), 0.05, 0.74),
        role="supporting_context",
        basis="Supporting case context that may help organize the record but is not direct incident, medical, policy, or notice evidence.",
        factors=alignment_factors,
        legal_flags=flags,
        extraction_confidence=extraction,
    )
