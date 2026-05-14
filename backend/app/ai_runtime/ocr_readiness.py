from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.models import (
    CaseDocument,
    CaseRecord,
    OcrEvidenceRef,
    OcrGate,
    OcrPotentialAllegation,
    OcrReadinessResult,
    OcrSourceRef,
)
from app.time import utc_now


SCHEMA_VERSION = "ocr_readiness_v2"
SOURCE_RETRIEVED_AT = "2026-05-14"

OCR_SOURCE_PACK = [
    OcrSourceRef(
        id="ocr-cpm",
        title="OCR Case Processing Manual",
        url="https://www.ed.gov/laws-and-policy/civil-rights-laws/file-complaint/ocr-case-processing-manual-cpm",
        summary="OCR's process framework for jurisdiction, timeliness, allegations, and resolution paths.",
        retrieved_at=SOURCE_RETRIEVED_AT,
    ),
    OcrSourceRef(
        id="ocr-complaint-process",
        title="How OCR Handles Complaints",
        url="https://www.ed.gov/laws-and-policy/civil-rights-laws/file-complaint/how-the-office-for-civil-rights-handles-complaints",
        summary="OCR's parent-facing explanation of complaint review and handling.",
        retrieved_at=SOURCE_RETRIEVED_AT,
    ),
    OcrSourceRef(
        id="ocr-504-fape-reg",
        title="34 CFR Part 104 - Nondiscrimination on the Basis of Handicap",
        url="https://www.ecfr.gov/current/title-34/subtitle-B/chapter-I/part-104",
        summary="Section 504 education rules, including FAPE, evaluation, placement, safeguards, and nonacademic services.",
        retrieved_at=SOURCE_RETRIEVED_AT,
    ),
    OcrSourceRef(
        id="ocr-504-fape-faq",
        title="OCR Section 504 FAPE FAQ",
        url="https://www.ed.gov/laws-and-policy/civil-rights-laws/disability-discrimination/frequently-asked-questions-section-504-free-appropriate-public-education-fape",
        summary="OCR guidance on free appropriate public education under Section 504.",
        retrieved_at=SOURCE_RETRIEVED_AT,
    ),
    OcrSourceRef(
        id="ada-title-ii",
        title="28 CFR Part 35 - Nondiscrimination on the Basis of Disability in State and Local Government Services",
        url="https://www.ecfr.gov/current/title-28/chapter-I/part-35",
        summary="ADA Title II rules for public entities, including public school access and anti-retaliation concepts.",
        retrieved_at=SOURCE_RETRIEVED_AT,
    ),
    OcrSourceRef(
        id="title-vi",
        title="34 CFR Part 100 - Nondiscrimination Under Programs Receiving Federal Assistance",
        url="https://www.ecfr.gov/current/title-34/subtitle-B/chapter-I/part-100",
        summary="Title VI rules for race, color, and national-origin discrimination in federally assisted programs.",
        retrieved_at=SOURCE_RETRIEVED_AT,
    ),
    OcrSourceRef(
        id="title-ix",
        title="34 CFR Part 106 - Nondiscrimination on the Basis of Sex in Education Programs",
        url="https://www.ecfr.gov/current/title-34/subtitle-B/chapter-I/part-106",
        summary="Title IX rules for sex discrimination in education programs; version-sensitive and reviewed as of the source date.",
        retrieved_at=SOURCE_RETRIEVED_AT,
    ),
    OcrSourceRef(
        id="ocr-retaliation",
        title="OCR Disability Discrimination Retaliation Guidance",
        url="https://www.ed.gov/laws-and-policy/civil-rights-laws/disability-discrimination/disability-discrimination-key-issues/disability-discrimination-retaliation",
        summary="OCR guidance describing retaliation concerns after protected civil-rights activity.",
        retrieved_at=SOURCE_RETRIEVED_AT,
    ),
]

SOURCE_BY_ID = {source.id: source for source in OCR_SOURCE_PACK}

DOCUMENT_ROLES = {
    "primary_event",
    "parent_communication",
    "school_response",
    "student_record",
    "policy_context",
    "staff_training",
    "insurance_contract",
    "generic_legal_notice",
    "comparator_incident",
    "unrelated",
}
SUPPORTING_ROLES = {"primary_event", "parent_communication", "school_response", "student_record"}
CONTEXT_ONLY_ROLES = DOCUMENT_ROLES - SUPPORTING_ROLES

DISABILITY_IDENTITY_TERMS = (
    "504",
    "section 504",
    "iep",
    "individualized education",
    "disability",
    "disabled",
    "adhd",
    "autism",
    "dyslexia",
    "fape",
    "accommodation",
    "accommodations",
    "special education",
)
DISABILITY_REQUEST_TERMS = (
    "requested a 504",
    "requesting a 504",
    "requested section 504",
    "requesting section 504",
    "section 504 evaluation",
    "504 evaluation",
    "requested accommodations",
    "requesting accommodations",
    "asked for accommodations",
    "asked for an evaluation",
    "requested an evaluation",
    "evaluate my child",
    "evaluate the disability supports",
)
PROTECTED_ACTIVITY_TERMS = (
    "complained",
    "complaint",
    "civil rights",
    "ocr",
    "grievance",
    "requested a 504",
    "504 evaluation",
    "requested accommodations",
    "asked for accommodations",
    "asked for an evaluation",
    "requested an evaluation",
)
CIVIL_RIGHTS_ACTIVITY_PATTERNS = (
    r"\b(?:complain(?:ed|t|ing)?|grievance|reported|raised)\b[^.\n]{0,160}\b"
    r"(?:504|section 504|iep|disability|disabled|accommodation|accommodations|adhd|autism|dyslexia|fape|"
    r"race|racial|national origin|sex discrimination|sexual harassment|title vi|title ix|civil rights|ocr)\b",
    r"\b(?:504|section 504|iep|disability|disabled|accommodation|accommodations|adhd|autism|dyslexia|fape|"
    r"race|racial|national origin|sex discrimination|sexual harassment|title vi|title ix|civil rights|ocr)\b"
    r"[^.\n]{0,160}\b(?:complain(?:ed|t|ing)?|grievance|reported|raised|request(?:ed|ing)?)\b",
    r"\b(?:filed|made|submitted|raised)\b[^.\n]{0,120}\b"
    r"(?:ocr|civil rights|title vi|title ix|section 504|discrimination|retaliation)\b",
)
ADVERSE_ACTION_TERMS = (
    "excluded",
    "removed",
    "denied",
    "refused",
    "threatened",
    "retaliat",
    "punish",
    "suspended",
    "changed placement",
    "would not attend",
    "may not attend",
    "would not discuss",
    "stop excluding",
)
HARM_TERMS = (
    "attacked",
    "injured",
    "unsafe",
    "harm",
    "bullied",
    "harassed",
    "supervision",
    "incident",
)
SCHOOL_ACTOR_TERMS = (
    "school",
    "district",
    "principal",
    "teacher",
    "administrator",
    "usd",
    "board",
    "counselor",
    "coordinator",
    "jcprd",
)
TITLE_VI_SPECIFIC_PATTERNS = (
    r"\bbecause of (?:his|her|their|my child's|the student's)?\s*(?:race|color|national origin|ethnicity|language)",
    r"\b(?:racial|race-based|national-origin|language-access)\s+(?:harassment|discrimination|different treatment)",
    r"\benglish learner\b.{0,120}\b(?:denied|refused|excluded|harassed|different treatment)",
)
TITLE_IX_SPECIFIC_PATTERNS = (
    r"\b(?:sex discrimination|sexual harassment|gender-based harassment|title ix)\b",
    r"\bbecause of (?:his|her|their|my child's|the student's)?\s*(?:sex|gender|pregnancy)",
)
GENERIC_LEGAL_TEXT_PATTERNS = (
    "equal employment opportunity",
    "employment practices",
    "sexual harassment policy",
    "non-discrimination",
    "nondiscrimination",
    "ada notice",
    "protected characteristics",
    "workers' compensation",
    "general liability",
)
RECORD_RECOMMENDATIONS = {
    "non_ocr": [
        "Incident reports, witness notes, and medical or injury follow-up records.",
        "Staffing, supervision, and aftercare program schedules for the relevant dates.",
        "USD 232 and JCPRD agreements, policies, training materials, and communications about oversight.",
        "A complete parent-school/JCPRD communication timeline tied to the incident and response.",
    ],
    "disability": [
        "The written 504/IEP evaluation request and every district response.",
        "Evaluation, eligibility, accommodation, placement, and prior written notice records.",
        "Emails or meeting notes showing when the school had notice of the disability-related need.",
    ],
    "retaliation": [
        "Dated protected activity: complaint, accommodation request, grievance, or OCR/state agency contact.",
        "Dated adverse action records after the protected activity.",
        "Communications linking the adverse action to the complaint or accommodation request.",
    ],
    "title_vi": [
        "Dated reports of race, color, national-origin, or language-access concerns.",
        "School responses, investigation notes, and discipline or remedy records.",
    ],
    "title_ix": [
        "Dated reports of sex-based harassment or discrimination.",
        "Title IX coordinator communications, supportive measures, and investigation records.",
    ],
}


@dataclass(frozen=True)
class _AnalyzedDocument:
    doc: CaseDocument
    role: str
    text: str
    supports: set[str] = field(default_factory=set)
    snippet: str = ""


@dataclass(frozen=True)
class _SignalSet:
    disability: bool
    title_vi: bool
    title_ix: bool
    protected_activity: bool
    adverse_action: bool
    nexus: bool


def _contains_term(text: str, term: str) -> bool:
    if re.fullmatch(r"[a-z0-9]+", term):
        return re.search(rf"\b{re.escape(term)}\b", text) is not None
    return term in text


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(_contains_term(text, term) for term in terms)


def _matches_any(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns)


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        normalized = item.strip()
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result


def _scoped_docs(case: CaseRecord, documents: list[CaseDocument]) -> list[CaseDocument]:
    return [
        doc for doc in documents
        if doc.workspace_id == case.workspace_id and doc.case_id == case.id
    ]


def _case_fact_text(case: CaseRecord) -> str:
    intake = case.intake
    blocks = [
        case.title,
        case.summary,
        case.family_narrative,
        intake.narrative,
        intake.desired_outcome,
        " ".join(intake.desired_outcomes or []),
        intake.issue_type,
        " ".join(intake.issue_categories or []),
        intake.iep_504_status,
        intake.school_setting,
        intake.district,
        intake.school,
        " ".join(intake.prior_actions or []),
        str(intake.retaliation_concern),
    ]
    return "\n".join(str(block or "") for block in blocks).lower()


def _doc_text(doc: CaseDocument) -> str:
    blocks = [
        doc.filename,
        doc.evidence_type,
        doc.inferred_category,
        doc.user_description,
        doc.document_date or "",
        doc.source_person,
        doc.source_zip_path,
        " ".join(doc.source_zip_paths or []),
        " ".join(doc.tags or []),
        doc.extracted_text,
        doc.document_summary,
        doc.case_relevance,
        " ".join(doc.legal_flags or []),
    ]
    return "\n".join(str(block or "") for block in blocks).lower()


def _scrub_negated_reference_clauses(text: str) -> str:
    return re.sub(
        r"\b(?:does not|doesn't|do not|did not|no)\s+(?:mention|reference|include|involve|raise|allege)\s+[^.;\n]{0,160}",
        " ",
        text,
        flags=re.IGNORECASE,
    )


def _snippet(text: str, terms: tuple[str, ...] = ()) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if not compact:
        return ""
    lowered = compact.lower()
    index = -1
    for term in terms:
        index = lowered.find(term)
        if index >= 0:
            break
    if index < 0:
        return compact[:260]
    start = max(0, index - 90)
    end = min(len(compact), index + 170)
    return compact[start:end]


def _classify_document(doc: CaseDocument, text: str) -> str:
    haystack = " ".join([
        doc.filename,
        doc.evidence_type,
        doc.inferred_category,
        doc.source_zip_path,
        " ".join(doc.source_zip_paths or []),
        " ".join(doc.tags or []),
        text[:1200],
    ]).lower()

    if any(term in haystack for term in ("insurance", "general liability", "travelers package", "umbrella policy", "certificate of liability", "gli.pdf")):
        return "insurance_contract"
    if any(term in haystack for term in ("staff training", "training manual", "training records", "staff training log", "cpr aed", "medication storage")):
        return "staff_training"
    if any(term in haystack for term in ("another child", "other student", "prior incident", "comparator", "not involve this child")):
        return "comparator_incident"
    if any(term in haystack for term in ("board minutes", "committee packet", "meeting agenda", "ada notice", "nondiscrimination", "non-discrimination")):
        return "policy_context"
    if any(term in haystack for term in ("policy", "procedure", "licensing", "regulation", "handbook")):
        return "policy_context"
    if _contains_any(haystack, DISABILITY_REQUEST_TERMS + PROTECTED_ACTIVITY_TERMS):
        return "parent_communication"
    if _contains_any(haystack, ADVERSE_ACTION_TERMS) and _contains_any(haystack, SCHOOL_ACTOR_TERMS):
        return "school_response"
    if any(term in haystack for term in ("email", "from:", "to:", "principal email", "school response", "district response")):
        if any(term in haystack for term in ("principal email", "district response", "school response")):
            return "school_response"
        return "parent_communication"
    if any(term in haystack for term in ("student record", "504 plan", "iep", "evaluation record", "accommodation plan")):
        return "student_record"
    if any(term in haystack for term in ("incident report", "critical incident", "injury", "attacked", "altercation")):
        return "primary_event"
    if _contains_any(haystack, DISABILITY_IDENTITY_TERMS) or _matches_any(haystack, TITLE_VI_SPECIFIC_PATTERNS + TITLE_IX_SPECIFIC_PATTERNS):
        return "generic_legal_notice" if any(pattern in haystack for pattern in GENERIC_LEGAL_TEXT_PATTERNS) else "unrelated"
    return "unrelated"


def _affirmative_iep_504_status(value: str) -> bool:
    cleaned = value.strip().lower()
    if not cleaned or cleaned in {"unknown", "not specified", "none", "no", "n/a", "na"}:
        return False
    if any(term in cleaned for term in ("not under", "does not have", "no 504", "no iep")):
        return False
    return any(term in cleaned for term in ("504", "iep", "plan", "requested", "evaluation", "accommodation"))


def _has_child_specific_disability(text: str) -> bool:
    scrubbed = _scrub_negated_reference_clauses(text)
    child_before = re.search(
        r"\b(?:my child|my son|my daughter|student|child|our child|our son|our daughter)\b[^.\n]{0,140}\b"
        r"(?:504|section 504|iep|adhd|autism|dyslexia|disability|disabled|accommodation|accommodations|special education|fape)\b",
        scrubbed,
        flags=re.IGNORECASE,
    )
    basis_before = re.search(
        r"\b(?:504|section 504|iep|adhd|autism|dyslexia|disability|disabled|accommodation|accommodations|special education|fape)\b"
        r"[^.\n]{0,140}\b(?:my child|my son|my daughter|student|child|our child|our son|our daughter)\b",
        scrubbed,
        flags=re.IGNORECASE,
    )
    return bool(child_before or basis_before or _contains_any(scrubbed, DISABILITY_REQUEST_TERMS))


def _has_title_vi_case_specific(text: str) -> bool:
    return _matches_any(_scrub_negated_reference_clauses(text), TITLE_VI_SPECIFIC_PATTERNS)


def _has_title_ix_case_specific(text: str) -> bool:
    return _matches_any(_scrub_negated_reference_clauses(text), TITLE_IX_SPECIFIC_PATTERNS)


def _has_protected_activity(text: str) -> bool:
    scrubbed = _scrub_negated_reference_clauses(text)
    return _contains_any(scrubbed, DISABILITY_REQUEST_TERMS) or _matches_any(scrubbed, CIVIL_RIGHTS_ACTIVITY_PATTERNS)


def _has_adverse_action(text: str) -> bool:
    return _contains_any(_scrub_negated_reference_clauses(text), ADVERSE_ACTION_TERMS)


def _has_nexus(text: str, signals: _SignalSet | None = None) -> bool:
    if " after " in text and _has_protected_activity(text) and _has_adverse_action(text):
        return True
    if re.search(r"\b(?:because|due to|in response to|following)\b[^.\n]{0,160}\b(?:complaint|504|accommodation|evaluation|civil rights)\b", text):
        return True
    if signals and signals.protected_activity and signals.adverse_action and (signals.disability or signals.title_vi or signals.title_ix):
        return True
    return False


def _analyze_documents(case: CaseRecord, docs: list[CaseDocument]) -> list[_AnalyzedDocument]:
    analyzed = []
    for doc in docs:
        text = _doc_text(doc)
        role = _classify_document(doc, text)
        supports: set[str] = set()
        searchable = text if role in SUPPORTING_ROLES else ""
        if searchable:
            if _has_child_specific_disability(searchable) or _contains_any(searchable, DISABILITY_REQUEST_TERMS):
                supports.add("disability")
            if _has_title_vi_case_specific(searchable):
                supports.add("title_vi")
            if _has_title_ix_case_specific(searchable):
                supports.add("title_ix")
            if _has_protected_activity(searchable):
                supports.add("protected_activity")
            if _has_adverse_action(searchable):
                supports.add("adverse_action")
            if _has_nexus(searchable):
                supports.add("nexus")

        terms = DISABILITY_IDENTITY_TERMS + PROTECTED_ACTIVITY_TERMS + ADVERSE_ACTION_TERMS
        analyzed.append(_AnalyzedDocument(
            doc=doc,
            role=role,
            text=text,
            supports=supports,
            snippet=_snippet(text, terms),
        ))
    return analyzed


def _evidence_ids(analyzed: list[_AnalyzedDocument], supports: str | tuple[str, ...]) -> list[str]:
    support_set = {supports} if isinstance(supports, str) else set(supports)
    return [item.doc.id for item in analyzed if item.supports & support_set]


def _signals(case: CaseRecord, analyzed: list[_AnalyzedDocument]) -> _SignalSet:
    intake = case.intake
    fact_text = _case_fact_text(case)
    support_terms = {support for item in analyzed for support in item.supports}

    disability = (
        _affirmative_iep_504_status(intake.iep_504_status)
        or _has_child_specific_disability(fact_text)
        or "disability" in support_terms
    )
    title_vi = _has_title_vi_case_specific(fact_text) or "title_vi" in support_terms
    title_ix = _has_title_ix_case_specific(fact_text) or "title_ix" in support_terms
    protected_activity = (
        bool(intake.retaliation_concern)
        or _has_protected_activity(fact_text)
        or "protected_activity" in support_terms
    )
    adverse_action = _has_adverse_action(fact_text) or "adverse_action" in support_terms
    provisional = _SignalSet(
        disability=disability,
        title_vi=title_vi,
        title_ix=title_ix,
        protected_activity=protected_activity,
        adverse_action=adverse_action,
        nexus=False,
    )
    nexus = _has_nexus(fact_text, provisional) or "nexus" in support_terms
    return _SignalSet(
        disability=disability,
        title_vi=title_vi,
        title_ix=title_ix,
        protected_activity=protected_activity,
        adverse_action=adverse_action,
        nexus=nexus,
    )


def _date_strings(case: CaseRecord, docs: list[CaseDocument], text: str) -> list[str]:
    values = []
    if case.intake.incident_date:
        values.append(case.intake.incident_date)
    values.extend(doc.document_date for doc in docs if doc.document_date)
    values.extend(re.findall(r"\b\d{4}-\d{2}-\d{2}\b", text))
    values.extend(re.findall(
        r"\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}\b",
        text,
        flags=re.IGNORECASE,
    ))
    return _dedupe(values)


def _parse_date(value: str) -> datetime | None:
    cleaned = value.strip()
    for fmt in ("%Y-%m-%d", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(cleaned.title(), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _timeliness_gate(date_values: list[str]) -> OcrGate:
    parsed = [date for value in date_values if (date := _parse_date(value))]
    if not parsed:
        return OcrGate(
            key="timeliness",
            label="OCR timing screen",
            status="unknown",
            rationale="No clear event date was found, so OCR timing cannot be screened yet.",
            missing_items=["Add dates for the concern, school response, and any later adverse action."],
        )

    most_recent = max(parsed)
    age_days = (utc_now() - most_recent).days
    if age_days > 180:
        return OcrGate(
            key="timeliness",
            label="OCR timing screen",
            status="partially_supported",
            rationale=f"The most recent detected event is about {age_days} days old, so OCR timing may need review.",
            missing_items=["Confirm whether OCR's timeliness rules or an extension/waiver could apply."],
        )
    return OcrGate(
        key="timeliness",
        label="OCR timing screen",
        status="met",
        rationale="A dated event appears within a normal OCR screening window.",
    )


def _jurisdiction_gate(case: CaseRecord, text: str) -> OcrGate:
    if case.intake.district or case.intake.school or "district" in text or "school" in text or "usd" in text:
        return OcrGate(
            key="jurisdiction",
            label="OCR-covered school or program",
            status="met",
            rationale="The case appears to involve a school, district, or public education program.",
        )
    return OcrGate(
        key="jurisdiction",
        label="OCR-covered school or program",
        status="partially_supported",
        rationale="The case needs clearer school, district, or program context before OCR fit can be assessed.",
        missing_items=["Add the school, district, and whether this is a public school or federally assisted program."],
    )


def _protected_basis_gate(signals: _SignalSet, analyzed: list[_AnalyzedDocument]) -> OcrGate:
    bases = []
    evidence_ids = []
    if signals.disability:
        bases.append("disability / Section 504")
        evidence_ids.extend(_evidence_ids(analyzed, "disability"))
    if signals.title_vi:
        bases.append("race, color, or national origin")
        evidence_ids.extend(_evidence_ids(analyzed, "title_vi"))
    if signals.title_ix:
        bases.append("sex discrimination or harassment")
        evidence_ids.extend(_evidence_ids(analyzed, "title_ix"))

    if bases:
        return OcrGate(
            key="protected_basis",
            label="Protected civil-rights basis",
            status="met",
            rationale=f"The case-specific facts identify a possible OCR basis: {', '.join(bases)}.",
            evidence_ids=_dedupe(evidence_ids),
        )
    return OcrGate(
        key="protected_basis",
        label="Protected civil-rights basis",
        status="not_supported",
        rationale="The case-specific facts read as a safety, supervision, records, or communication problem without a protected civil-rights basis.",
        missing_items=[
            "Facts tying the concern to disability, race/color/national origin, sex discrimination, or protected civil-rights activity."
        ],
    )


def _protected_activity_gate(signals: _SignalSet, analyzed: list[_AnalyzedDocument]) -> OcrGate:
    if signals.protected_activity:
        return OcrGate(
            key="protected_activity",
            label="Protected activity",
            status="met",
            rationale="The case describes a complaint, accommodation/evaluation request, grievance, or similar protected activity.",
            evidence_ids=_evidence_ids(analyzed, "protected_activity"),
        )
    return OcrGate(
        key="protected_activity",
        label="Protected activity",
        status="not_supported",
        rationale="The current facts do not identify a civil-rights complaint, accommodation request, OCR contact, or similar protected activity.",
    )


def _adverse_action_gate(signals: _SignalSet, analyzed: list[_AnalyzedDocument]) -> OcrGate:
    if signals.adverse_action:
        return OcrGate(
            key="adverse_action",
            label="Adverse action or denial",
            status="met",
            rationale="The case describes exclusion, refusal, denial, threat, removal, or a similar adverse action.",
            evidence_ids=_evidence_ids(analyzed, "adverse_action"),
        )
    return OcrGate(
        key="adverse_action",
        label="Adverse action or denial",
        status="not_supported",
        rationale="The current facts do not identify a denial or adverse action tied to a protected civil-rights basis.",
    )


def _nexus_gate(signals: _SignalSet, analyzed: list[_AnalyzedDocument]) -> OcrGate:
    if not (signals.disability or signals.title_vi or signals.title_ix):
        return OcrGate(
            key="causal_nexus",
            label="Protected-basis connection",
            status="not_applicable",
            rationale="No protected-basis theory is currently indicated, so there is no OCR nexus to assess.",
        )
    if signals.nexus:
        return OcrGate(
            key="causal_nexus",
            label="Protected-basis connection",
            status="met",
            rationale="The case connects the protected basis or protected activity to the denial, exclusion, or adverse action.",
            evidence_ids=_evidence_ids(analyzed, "nexus"),
        )
    return OcrGate(
        key="causal_nexus",
        label="Protected-basis connection",
        status="partially_supported",
        rationale="A protected-basis issue may be present, but the current facts need a clearer link to the action or harm.",
        missing_items=["Explain how the school action was connected to the protected basis or protected activity."],
    )


def _factual_gate(case: CaseRecord, text: str, date_values: list[str]) -> OcrGate:
    missing = []
    if not date_values:
        missing.append("dated events")
    if not _contains_any(text, SCHOOL_ACTOR_TERMS):
        missing.append("school, district, or program actor")
    if not (_contains_any(text, ADVERSE_ACTION_TERMS) or _contains_any(text, HARM_TERMS)):
        missing.append("specific action, inaction, or harm")
    if not (case.intake.desired_outcome or case.intake.desired_outcomes):
        missing.append("requested remedy")

    if not missing:
        return OcrGate(
            key="factual_sufficiency",
            label="Concrete facts",
            status="met",
            rationale="The case has dates, actors, action or harm, and a requested outcome.",
        )
    if len(missing) <= 2:
        return OcrGate(
            key="factual_sufficiency",
            label="Concrete facts",
            status="partially_supported",
            rationale="The case has some useful facts but still needs more specificity.",
            missing_items=missing,
        )
    return OcrGate(
        key="factual_sufficiency",
        label="Concrete facts",
        status="not_supported",
        rationale="The case needs more concrete details before OCR fit can be assessed.",
        missing_items=missing,
    )


def _evidence_gate(signals: _SignalSet, analyzed: list[_AnalyzedDocument]) -> OcrGate:
    if not (signals.disability or signals.title_vi or signals.title_ix):
        return OcrGate(
            key="evidence_support",
            label="Source support",
            status="not_applicable",
            rationale="Sources were reviewed, but none support a case-specific OCR protected-basis theory.",
        )

    protected_ids = _evidence_ids(analyzed, ("disability", "title_vi", "title_ix", "protected_activity"))
    action_ids = _evidence_ids(analyzed, ("adverse_action", "nexus"))
    supporting_ids = _dedupe(protected_ids + action_ids)
    if protected_ids and action_ids:
        return OcrGate(
            key="evidence_support",
            label="Source support",
            status="met",
            rationale="Case-scoped records support both the protected-basis/protected-activity element and the action or denial element.",
            evidence_ids=supporting_ids,
        )
    if supporting_ids:
        return OcrGate(
            key="evidence_support",
            label="Source support",
            status="partially_supported",
            rationale="Some case-scoped records support the OCR screen, but key elements still need source support.",
            evidence_ids=supporting_ids,
            missing_items=["Add source records for the missing protected-basis, protected-activity, denial, or nexus element."],
        )
    return OcrGate(
        key="evidence_support",
        label="Source support",
        status="not_supported",
        rationale="The OCR screen is currently narrative-led and does not have source records supporting the OCR elements.",
        missing_items=["Upload emails, meeting notes, notices, evaluation records, or school responses tied to the OCR issue."],
    )


def _limiting_facts_gate(case: CaseRecord, signals: _SignalSet, analyzed: list[_AnalyzedDocument]) -> OcrGate:
    limiting = []
    if not _affirmative_iep_504_status(case.intake.iep_504_status):
        limiting.append("No current IEP/504 status is saved for the impacted child.")
    if not case.intake.retaliation_concern:
        limiting.append("The intake does not mark retaliation as a concern.")
    context_docs = [item.doc.id for item in analyzed if item.role in CONTEXT_ONLY_ROLES and (
        _contains_any(item.text, DISABILITY_IDENTITY_TERMS + PROTECTED_ACTIVITY_TERMS + ADVERSE_ACTION_TERMS)
        or _matches_any(item.text, TITLE_VI_SPECIFIC_PATTERNS + TITLE_IX_SPECIFIC_PATTERNS)
    )]
    if context_docs:
        limiting.append("Civil-rights words appear in context-only records, but those records do not tie the issue to this child.")

    if limiting and not (signals.disability or signals.title_vi or signals.title_ix):
        return OcrGate(
            key="limiting_facts",
            label="Limiting facts",
            status="partially_supported",
            rationale=" ".join(limiting),
            evidence_ids=context_docs[:8],
        )
    return OcrGate(
        key="limiting_facts",
        label="Limiting facts",
        status="not_applicable",
        rationale="No separate limiting facts changed the OCR screen.",
    )


def _source_refs(ids: list[str]) -> list[OcrSourceRef]:
    return [SOURCE_BY_ID[source_id] for source_id in _dedupe(ids) if source_id in SOURCE_BY_ID]


def _reviewed_evidence_refs(case: CaseRecord, analyzed: list[_AnalyzedDocument], evidence_ids: list[str]) -> list[OcrEvidenceRef]:
    selected: list[_AnalyzedDocument] = []
    evidence_set = set(evidence_ids)
    for item in analyzed:
        if item.doc.id in evidence_set or item.supports:
            selected.append(item)
    if not selected:
        for item in analyzed:
            if item.role in CONTEXT_ONLY_ROLES and (
                _contains_any(item.text, DISABILITY_IDENTITY_TERMS + PROTECTED_ACTIVITY_TERMS + ADVERSE_ACTION_TERMS)
                or _matches_any(item.text, TITLE_VI_SPECIFIC_PATTERNS + TITLE_IX_SPECIFIC_PATTERNS)
            ):
                selected.append(item)
    if not selected:
        selected = [item for item in analyzed if item.role in SUPPORTING_ROLES][:4]

    refs = []
    for item in selected[:12]:
        refs.append(OcrEvidenceRef(
            id=f"doc:{item.doc.id}",
            document_id=item.doc.id,
            label=item.doc.filename or f"Evidence {item.doc.id}",
            role=item.role,
            snippet=item.snippet or "Case-scoped evidence reviewed for the OCR screen.",
            route=f"/cases/{case.id}/locker/{item.doc.id}",
            supports=sorted(item.supports),
        ))
    return refs


def _allegations(signals: _SignalSet, analyzed: list[_AnalyzedDocument], gates: list[OcrGate]) -> list[OcrPotentialAllegation]:
    gate_status = {gate.key: gate.status for gate in gates}
    if gate_status.get("protected_basis") == "not_supported":
        return []

    missing = []
    if gate_status.get("causal_nexus") != "met":
        missing.append("clear link between the protected basis/protected activity and the denial, exclusion, or harm")
    if gate_status.get("evidence_support") != "met":
        missing.append("source records supporting each OCR element")

    allegations: list[OcrPotentialAllegation] = []
    if signals.disability:
        evidence_ids = _dedupe(_evidence_ids(analyzed, ("disability", "protected_activity", "adverse_action", "nexus")))
        allegations.append(OcrPotentialAllegation(
            theory="Section 504 disability access, evaluation, or FAPE question",
            protected_basis="disability",
            authority_refs=["ocr-504-fape-reg", "ocr-504-fape-faq", "ada-title-ii"],
            supporting_facts=[
                "The case-specific facts identify a disability, 504/IEP, evaluation, or accommodation issue for the impacted child.",
                "OCR can review disability discrimination and Section 504 education access questions when the facts fit its jurisdiction.",
            ],
            evidence_ids=evidence_ids,
            missing_facts=missing,
            confidence="evidence_supported" if gate_status.get("evidence_support") == "met" else "possible",
            cautions=["This is a readiness screen, not a legal finding that FAPE was denied."],
        ))

    if signals.protected_activity and signals.adverse_action and (signals.disability or signals.title_vi or signals.title_ix):
        evidence_ids = _dedupe(_evidence_ids(analyzed, ("protected_activity", "adverse_action", "nexus")))
        allegations.append(OcrPotentialAllegation(
            theory="Retaliation after protected civil-rights activity question",
            protected_basis="retaliation",
            authority_refs=["ocr-retaliation", "ocr-cpm"],
            supporting_facts=[
                "The case-specific facts identify protected activity, such as a complaint or accommodation/evaluation request.",
                "The case also describes a later denial, exclusion, refusal, threat, or similar adverse action.",
            ],
            evidence_ids=evidence_ids,
            missing_facts=missing,
            confidence="evidence_supported" if gate_status.get("evidence_support") == "met" else "possible",
            cautions=["Timing alone is not enough; the case needs records showing protected activity, adverse action, and possible connection."],
        ))

    if signals.title_vi:
        allegations.append(OcrPotentialAllegation(
            theory="Title VI race, color, or national-origin discrimination question",
            protected_basis="race/color/national origin",
            authority_refs=["title-vi", "ocr-cpm"],
            supporting_facts=["The case-specific facts identify race, color, national origin, language access, or related harassment concerns."],
            evidence_ids=_evidence_ids(analyzed, "title_vi"),
            missing_facts=missing,
            confidence="evidence_supported" if gate_status.get("evidence_support") == "met" else "possible",
            cautions=["General unfairness is not enough for Title VI; the facts need a protected-basis connection."],
        ))

    if signals.title_ix:
        allegations.append(OcrPotentialAllegation(
            theory="Title IX sex discrimination or harassment question",
            protected_basis="sex",
            authority_refs=["title-ix", "ocr-cpm"],
            supporting_facts=["The case-specific facts identify sex discrimination, gender-based harassment, pregnancy, or Title IX concerns."],
            evidence_ids=_evidence_ids(analyzed, "title_ix"),
            missing_facts=missing,
            confidence="evidence_supported" if gate_status.get("evidence_support") == "met" else "possible",
            cautions=["Title IX rules are version-sensitive; confirm the current rule and facts before relying on this."],
        ))

    return allegations


def assess_ocr_readiness(case: CaseRecord, documents: list[CaseDocument]) -> OcrReadinessResult:
    docs = _scoped_docs(case, documents)
    analyzed = _analyze_documents(case, docs)
    fact_text = _case_fact_text(case)
    doc_text = "\n".join(item.text for item in analyzed)
    combined_text = "\n".join([fact_text, doc_text])
    signals = _signals(case, analyzed)
    date_values = _date_strings(case, docs, combined_text)

    gates = [
        _jurisdiction_gate(case, fact_text),
        _protected_basis_gate(signals, analyzed),
        _protected_activity_gate(signals, analyzed),
        _adverse_action_gate(signals, analyzed),
        _nexus_gate(signals, analyzed),
        _timeliness_gate(date_values),
        _factual_gate(case, fact_text, date_values),
        _evidence_gate(signals, analyzed),
        _limiting_facts_gate(case, signals, analyzed),
    ]
    allegations = _allegations(signals, analyzed, gates)
    gate_status = {gate.key: gate.status for gate in gates}

    has_protected_basis = gate_status["protected_basis"] == "met"
    factual_supported = gate_status["factual_sufficiency"] in {"met", "partially_supported"}
    evidence_supported = gate_status["evidence_support"] == "met"

    if not has_protected_basis:
        overall_status = "no_ocr_theory_indicated"
        summary = (
            "This currently reads as a supervision, safety, records, and policy accountability issue. "
            "I do not see facts tying the incident to disability, race/color/national origin, sex discrimination, "
            "or retaliation for protected civil-rights activity."
        )
        confidence = "low"
    elif not factual_supported:
        overall_status = "needs_more_info"
        summary = "There may be a civil-rights or OCR question, but key facts are missing before the screen is meaningful."
        confidence = "low"
    elif evidence_supported:
        overall_status = "evidence_supported_ocr_question"
        summary = "The case has case-specific facts and source support for an OCR review question, but this is not a legal determination."
        confidence = "medium"
    else:
        overall_status = "possible_ocr_question"
        summary = "The case has facts that could raise an OCR question, but source records are still needed before relying on that theory."
        confidence = "medium"

    authority_ids = ["ocr-cpm", "ocr-complaint-process"]
    for allegation in allegations:
        authority_ids.extend(allegation.authority_refs)

    recommended = []
    if signals.disability:
        recommended.extend(RECORD_RECOMMENDATIONS["disability"])
    if signals.protected_activity or signals.adverse_action:
        recommended.extend(RECORD_RECOMMENDATIONS["retaliation"])
    if signals.title_vi:
        recommended.extend(RECORD_RECOMMENDATIONS["title_vi"])
    if signals.title_ix:
        recommended.extend(RECORD_RECOMMENDATIONS["title_ix"])
    if not recommended:
        recommended = RECORD_RECOMMENDATIONS["non_ocr"].copy()

    cited_ids = []
    for gate in gates:
        cited_ids.extend(gate.evidence_ids)
    for allegation in allegations:
        cited_ids.extend(allegation.evidence_ids)

    return OcrReadinessResult(
        schema_version=SCHEMA_VERSION,
        overall_status=overall_status,
        summary=summary,
        gates=gates,
        potential_allegations=allegations,
        reviewed_evidence=_reviewed_evidence_refs(case, analyzed, _dedupe(cited_ids)),
        recommended_records=_dedupe(recommended)[:8],
        non_ocr_routes=[
            "Student safety or supervision escalation",
            "School board or district complaint process",
            "Public records request for incident, policy, oversight, and communication records",
        ] if overall_status == "no_ocr_theory_indicated" else [],
        source_refs=_source_refs(authority_ids),
        cautions=[
            "This is not a legal determination and does not decide whether OCR would accept or resolve a complaint.",
            "OCR fit depends on the exact facts, dates, protected basis, jurisdiction, and evidence available.",
        ],
        confidence=confidence,
        trace_metadata={
            "schema_version": SCHEMA_VERSION,
            "decision_mode": "deterministic_element_screen",
            "document_scope": "case_scoped",
            "case_document_count": len(docs),
            "reviewed_document_count": len(analyzed),
            "model_role": "case_read_synthesis_only",
        },
    )
