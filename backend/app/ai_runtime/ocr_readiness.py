from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone

from app.models import (
    CaseDocument,
    CaseRecord,
    OcrGate,
    OcrPotentialAllegation,
    OcrReadinessResult,
    OcrSourceRef,
)
from app.time import utc_now


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

DISABILITY_TERMS = (
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
    "evaluation",
    "special education",
    "related services",
)
RACE_NATIONAL_ORIGIN_TERMS = (
    "race",
    "racial",
    "national origin",
    "english learner",
    "ell",
    "language access",
    "immigrant",
    "ethnicity",
)
SEX_TERMS = (
    "sex discrimination",
    "sexual harassment",
    "gender",
    "pregnancy",
    "title ix",
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
)
HARM_TERMS = (
    "excluded",
    "injured",
    "denied",
    "unsafe",
    "missed",
    "lost",
    "harm",
    "bullied",
    "harassed",
    "not receive",
    "would not attend",
)
RECORD_RECOMMENDATIONS = {
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
class _SignalSet:
    disability: bool
    title_vi: bool
    title_ix: bool
    protected_activity: bool
    adverse_action: bool


def _contains_term(text: str, term: str) -> bool:
    if re.fullmatch(r"[a-z0-9]+", term):
        return re.search(rf"\b{re.escape(term)}\b", text) is not None
    return term in text


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(_contains_term(text, term) for term in terms)


def _scrub_negated_reference_clauses(text: str) -> str:
    return re.sub(
        r"\b(?:does not|doesn't|do not|did not|no)\s+(?:mention|reference|include|involve|raise|allege)\s+[^.;\n]{0,140}",
        " ",
        text,
        flags=re.IGNORECASE,
    )


def _contains_any_without_negated_references(text: str, terms: tuple[str, ...]) -> bool:
    return _contains_any(_scrub_negated_reference_clauses(text), terms)


def _evidence_ids(docs: list[CaseDocument], terms: tuple[str, ...], *, scrub_negated_references: bool = False) -> list[str]:
    ids: list[str] = []
    for doc in docs:
        text = " ".join([
            doc.filename or "",
            doc.evidence_type or "",
            doc.user_description or "",
            doc.extracted_text or "",
            doc.document_summary or "",
        ]).lower()
        if scrub_negated_references:
            text = _scrub_negated_reference_clauses(text)
        if _contains_any(text, terms):
            ids.append(doc.id)
    return ids


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


def _case_text(case: CaseRecord, docs: list[CaseDocument]) -> str:
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
    for doc in docs:
        blocks.extend([
            doc.filename,
            doc.evidence_type,
            doc.user_description,
            doc.document_date or "",
            doc.extracted_text,
            doc.document_summary,
            " ".join(doc.legal_flags or []),
        ])
    return "\n".join(str(block or "") for block in blocks).lower()


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


def _timeliness_status(date_values: list[str]) -> tuple[str, str, list[str]]:
    parsed = [date for value in date_values if (date := _parse_date(value))]
    if not parsed:
        return "weak", "No clear event date was found, so OCR timeliness cannot be assessed yet.", ["Add dates for the complaint, school response, and most recent adverse action."]

    most_recent = max(parsed)
    age_days = (utc_now() - most_recent).days
    if age_days > 180:
        return (
            "weak",
            f"The most recent detected event is about {age_days} days old, so OCR timeliness may need review.",
            ["Confirm whether OCR's timeliness rules or an extension/waiver could apply."],
        )
    return "pass", "A dated event appears within a normal OCR screening window.", []


def _signals(case: CaseRecord, text: str) -> _SignalSet:
    intake = case.intake
    disability = (
        _contains_any_without_negated_references(text, DISABILITY_TERMS)
        or intake.iep_504_status.lower() not in {"", "unknown", "not specified", "none", "no"}
        or intake.issue_type == "special_education"
        or "special_education" in (intake.issue_categories or [])
    )
    title_vi = _contains_any_without_negated_references(text, RACE_NATIONAL_ORIGIN_TERMS)
    title_ix = _contains_any_without_negated_references(text, SEX_TERMS)
    protected_activity = _contains_any(text, PROTECTED_ACTIVITY_TERMS) or bool(intake.retaliation_concern)
    adverse_action = _contains_any(text, ADVERSE_ACTION_TERMS)
    return _SignalSet(
        disability=disability,
        title_vi=title_vi,
        title_ix=title_ix,
        protected_activity=protected_activity,
        adverse_action=adverse_action,
    )


def _jurisdiction_gate(case: CaseRecord, text: str) -> OcrGate:
    evidence = []
    if case.intake.district or "district" in text or "usd" in text:
        evidence.append("district")
    if case.intake.school or "school" in text:
        evidence.append("school")
    if "public" in (case.intake.school_setting or "").lower() or evidence:
        return OcrGate(
            key="jurisdiction",
            label="OCR-covered school or program",
            status="pass",
            rationale="The case appears to involve a school, district, or public education program.",
            evidence_ids=[],
        )
    return OcrGate(
        key="jurisdiction",
        label="OCR-covered school or program",
        status="weak",
        rationale="The case needs clearer school, district, or program context before OCR fit can be assessed.",
        missing_items=["Add the school, district, and whether this is a public school or federally assisted program."],
    )


def _protected_basis_gate(signals: _SignalSet, docs: list[CaseDocument]) -> OcrGate:
    bases = []
    evidence_ids = []
    if signals.disability:
        bases.append("disability / Section 504")
        evidence_ids.extend(_evidence_ids(docs, DISABILITY_TERMS, scrub_negated_references=True))
    if signals.title_vi:
        bases.append("race, color, or national origin")
        evidence_ids.extend(_evidence_ids(docs, RACE_NATIONAL_ORIGIN_TERMS, scrub_negated_references=True))
    if signals.title_ix:
        bases.append("sex discrimination or harassment")
        evidence_ids.extend(_evidence_ids(docs, SEX_TERMS, scrub_negated_references=True))
    if signals.protected_activity and signals.adverse_action:
        bases.append("retaliation after protected activity")
        evidence_ids.extend(_evidence_ids(docs, PROTECTED_ACTIVITY_TERMS + ADVERSE_ACTION_TERMS))

    if bases:
        return OcrGate(
            key="protected_basis",
            label="Protected civil-rights basis",
            status="pass",
            rationale=f"Detected possible OCR basis: {', '.join(bases)}.",
            evidence_ids=_dedupe(evidence_ids),
        )
    return OcrGate(
        key="protected_basis",
        label="Protected civil-rights basis",
        status="missing",
        rationale="The facts currently read as a school safety, supervision, records, or communication problem without a clear OCR-protected basis.",
        missing_items=[
            "Identify whether the concern involves disability, race/color/national origin, sex discrimination, or retaliation for protected civil-rights activity."
        ],
    )


def _factual_gate(case: CaseRecord, text: str, date_values: list[str]) -> OcrGate:
    missing = []
    if not date_values:
        missing.append("dated events")
    if not _contains_any(text, SCHOOL_ACTOR_TERMS):
        missing.append("school or district actor")
    if not _contains_any(text, ADVERSE_ACTION_TERMS + HARM_TERMS):
        missing.append("specific action, inaction, or harm")
    if not (case.intake.desired_outcome or case.intake.desired_outcomes):
        missing.append("requested remedy")

    if not missing:
        return OcrGate(
            key="factual_sufficiency",
            label="Concrete facts",
            status="pass",
            rationale="The case has dates, school actors, action or harm, and a requested outcome.",
        )
    if len(missing) <= 2:
        return OcrGate(
            key="factual_sufficiency",
            label="Concrete facts",
            status="weak",
            rationale="The case has some OCR-relevant facts but still needs more specificity.",
            missing_items=missing,
        )
    return OcrGate(
        key="factual_sufficiency",
        label="Concrete facts",
        status="missing",
        rationale="The case needs more concrete details before OCR fit can be assessed.",
        missing_items=missing,
    )


def _evidence_gate(docs: list[CaseDocument]) -> OcrGate:
    text_docs = [doc for doc in docs if (doc.extracted_text or "").strip()]
    if len(text_docs) >= 2:
        return OcrGate(
            key="evidence_support",
            label="Source support",
            status="pass",
            rationale="Multiple case-scoped documents have readable text that can support or challenge the OCR theory.",
            evidence_ids=[doc.id for doc in text_docs],
        )
    if len(text_docs) == 1:
        return OcrGate(
            key="evidence_support",
            label="Source support",
            status="weak",
            rationale="One case-scoped document has readable text. More records would make the assessment stronger.",
            evidence_ids=[text_docs[0].id],
            missing_items=["Add the school response, meeting notes, and follow-up communications."],
        )
    return OcrGate(
        key="evidence_support",
        label="Source support",
        status="weak",
        rationale="This is currently narrative-led. OCR readiness can be screened, but source support is thin.",
        missing_items=["Upload emails, meeting notes, notices, evaluation records, or incident records."],
    )


def _source_refs(ids: list[str]) -> list[OcrSourceRef]:
    return [SOURCE_BY_ID[source_id] for source_id in _dedupe(ids) if source_id in SOURCE_BY_ID]


def _allegations(signals: _SignalSet, docs: list[CaseDocument], gates: list[OcrGate]) -> list[OcrPotentialAllegation]:
    gate_status = {gate.key: gate.status for gate in gates}
    if gate_status.get("protected_basis") == "missing":
        return []

    allegations: list[OcrPotentialAllegation] = []
    facts_missing = []
    if gate_status.get("factual_sufficiency") != "pass":
        facts_missing.append("more specific dates, school actors, and action/inaction details")
    if gate_status.get("evidence_support") != "pass":
        facts_missing.append("more source documents supporting notice, response, and harm")

    if signals.disability:
        allegations.append(OcrPotentialAllegation(
            theory="Section 504 disability access, evaluation, or FAPE concern",
            protected_basis="disability",
            authority_refs=["ocr-504-fape-reg", "ocr-504-fape-faq", "ada-title-ii"],
            supporting_facts=[
                "The case references disability-related supports, a 504/IEP/evaluation issue, or accommodation needs.",
                "OCR can review disability discrimination and Section 504 education access concerns when the facts fit its jurisdiction.",
            ],
            evidence_ids=_dedupe(_evidence_ids(docs, DISABILITY_TERMS, scrub_negated_references=True)),
            missing_facts=facts_missing,
            confidence="high" if gate_status.get("evidence_support") == "pass" and gate_status.get("factual_sufficiency") == "pass" else "medium",
            cautions=["This is a readiness screen, not a legal finding that FAPE was denied."],
        ))

    if signals.protected_activity and signals.adverse_action and (signals.disability or signals.title_vi or signals.title_ix):
        allegations.append(OcrPotentialAllegation(
            theory="Retaliation after protected civil-rights activity",
            protected_basis="retaliation",
            authority_refs=["ocr-retaliation", "ocr-cpm"],
            supporting_facts=[
                "The case references protected activity, such as a disability-related request or complaint.",
                "The case also references a later adverse action, such as exclusion, refusal, threat, or removal.",
            ],
            evidence_ids=_dedupe(_evidence_ids(docs, PROTECTED_ACTIVITY_TERMS + ADVERSE_ACTION_TERMS)),
            missing_facts=facts_missing + ["clear timeline connecting the protected activity and adverse action"],
            confidence="high" if len(_evidence_ids(docs, PROTECTED_ACTIVITY_TERMS + ADVERSE_ACTION_TERMS)) >= 2 else "medium",
            cautions=["Timing alone is not enough; the case needs records showing protected activity, adverse action, and possible connection."],
        ))

    if signals.title_vi:
        allegations.append(OcrPotentialAllegation(
            theory="Title VI race, color, or national-origin discrimination concern",
            protected_basis="race/color/national origin",
            authority_refs=["title-vi", "ocr-cpm"],
            supporting_facts=["The case references race, color, national origin, language access, or related harassment concerns."],
            evidence_ids=_dedupe(_evidence_ids(docs, RACE_NATIONAL_ORIGIN_TERMS, scrub_negated_references=True)),
            missing_facts=facts_missing,
            confidence="medium",
            cautions=["General unfairness is not enough for Title VI; the facts need a protected-basis connection."],
        ))

    if signals.title_ix:
        allegations.append(OcrPotentialAllegation(
            theory="Title IX sex discrimination or harassment concern",
            protected_basis="sex",
            authority_refs=["title-ix", "ocr-cpm"],
            supporting_facts=["The case references sex discrimination, gender-based harassment, pregnancy, or Title IX concerns."],
            evidence_ids=_dedupe(_evidence_ids(docs, SEX_TERMS, scrub_negated_references=True)),
            missing_facts=facts_missing,
            confidence="medium",
            cautions=["Title IX rules are version-sensitive; confirm the current rule and facts before relying on this."],
        ))

    return allegations


def assess_ocr_readiness(case: CaseRecord, documents: list[CaseDocument]) -> OcrReadinessResult:
    docs = _scoped_docs(case, documents)
    text = _case_text(case, docs)
    signals = _signals(case, text)
    date_values = _date_strings(case, docs, text)
    timeliness_status, timeliness_rationale, timeliness_missing = _timeliness_status(date_values)

    gates = [
        _jurisdiction_gate(case, text),
        _protected_basis_gate(signals, docs),
        OcrGate(
            key="timeliness",
            label="OCR timing screen",
            status=timeliness_status,
            rationale=timeliness_rationale,
            missing_items=timeliness_missing,
        ),
        _factual_gate(case, text, date_values),
        _evidence_gate(docs),
    ]
    allegations = _allegations(signals, docs, gates)
    gate_status = {gate.key: gate.status for gate in gates}

    if gate_status["protected_basis"] == "missing":
        overall_status = "not_ready"
    elif gate_status["factual_sufficiency"] == "missing":
        overall_status = "needs_more_info"
    elif gate_status["evidence_support"] == "pass" and gate_status["factual_sufficiency"] == "pass" and len(allegations) >= 2:
        overall_status = "strong_readiness"
    elif gate_status["factual_sufficiency"] in {"pass", "weak"}:
        overall_status = "plausible_for_ocr_review"
    else:
        overall_status = "needs_more_info"

    if overall_status == "not_ready":
        summary = (
            "This currently does not read as an OCR-ready civil-rights issue. It may still be important, but the case needs a protected-basis "
            "connection before OCR readiness can be assessed meaningfully."
        )
        confidence = "medium" if text.strip() else "low"
    elif overall_status == "needs_more_info":
        summary = "There may be an OCR-related issue, but key facts are missing before the case is ready for a meaningful OCR screen."
        confidence = "low"
    elif overall_status == "strong_readiness":
        summary = "The case has a protected-basis theory, concrete facts, and source support that make it strong enough for OCR readiness review."
        confidence = "high"
    else:
        summary = "The case has facts that could plausibly fit an OCR review theory, but more source records would make the assessment stronger."
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
        recommended = [
            "School incident, supervision, and communication records.",
            "Policies, procedures, and staff training materials tied to the concern.",
        ]

    return OcrReadinessResult(
        overall_status=overall_status,
        summary=summary,
        gates=gates,
        potential_allegations=allegations,
        recommended_records=_dedupe(recommended)[:8],
        non_ocr_routes=[
            "Student safety or supervision escalation",
            "School board or district complaint process",
            "Public records request for incident, policy, and communication records",
        ] if overall_status == "not_ready" else [],
        source_refs=_source_refs(authority_ids),
        cautions=[
            "This is not a legal determination and does not decide whether OCR would accept or resolve a complaint.",
            "OCR readiness depends on the exact facts, dates, protected basis, jurisdiction, and evidence available.",
        ],
        confidence=confidence,
    )
