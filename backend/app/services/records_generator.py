from __future__ import annotations

import uuid

from app.models import CaseRecord, Entity, RecordsCustodian, RecordsRequest
from app.services.records_rulebook import (
    FEDERAL_FERPA_SOURCE,
    FEDERAL_IDEA_SOURCE,
    FERPA_GUIDANCE_SOURCE,
    get_rule_pack,
    normalize_state,
)
from app.time import utc_now

CAUTION = "This is not legal advice"
NAMESPACE = uuid.UUID("8ef48c48-3d60-4fb8-8f7d-b84531346ea8")


def _stable_id(case_id: str, law_code: str, category: str) -> str:
    return f"rr-{uuid.uuid5(NAMESPACE, f'{case_id}:{law_code}:{category}').hex[:12]}"


def _case_text(case: CaseRecord) -> str:
    intake = case.intake
    parts = [
        case.title,
        case.summary,
        case.family_narrative,
        intake.narrative,
        intake.desired_outcome,
        " ".join(intake.issue_categories),
        intake.issue_type,
        intake.iep_504_status,
    ]
    return " ".join(part for part in parts if part).lower()


def _needs_idea_request(case: CaseRecord) -> bool:
    text = _case_text(case)
    return "iep" in text or "individualized education" in text or case.intake.issue_type == "special_education"


def _needs_ferpa_request(case: CaseRecord) -> bool:
    return bool(case.intake.school or case.intake.district or "school" in _case_text(case))


def _primary_custodian(case: CaseRecord, entities: list[Entity]) -> tuple[RecordsCustodian, list[str]]:
    case_entities = [entity for entity in entities if entity.case_id == case.id and entity.workspace_id == case.workspace_id]
    for entity in case_entities:
        if entity.records_custodian and (
            entity.records_custodian.email
            or entity.records_custodian.submission_url
            or entity.records_custodian.address
            or entity.records_custodian.name
        ):
            return entity.records_custodian, [entity.id]
    district = case.intake.district or "the school district"
    return RecordsCustodian(name=f"{district} records custodian", notes="Confirm the correct custodian before sending."), []


def _recipient_name(custodian: RecordsCustodian) -> str:
    return custodian.name or custodian.title or "Records Custodian"


def _case_summary_line(case: CaseRecord) -> str:
    school = f" at {case.intake.school}" if case.intake.school else ""
    date = f" on or around {case.intake.incident_date}" if case.intake.incident_date else ""
    return f"This request concerns the student's school-related incident or concern{school}{date}."


def _render_state_letter(case: CaseRecord, request: RecordsRequest) -> str:
    return "\n".join([
        f"Dear {_recipient_name(request.custodian or RecordsCustodian())},",
        "",
        f"I am requesting records under the {request.legal_basis}. {_case_summary_line(case)}",
        "",
        "Please provide the following records in electronic form where available:",
        request.records_description,
        "",
        "If any record is withheld or redacted, please identify the legal basis for withholding or redaction and release any reasonably segregable non-exempt portions.",
        "",
        "Please let me know if you need clarification that would help locate the records.",
        "",
        "Sincerely,",
        "[Parent/Guardian]",
    ])


def _render_education_letter(case: CaseRecord, request: RecordsRequest) -> str:
    return "\n".join([
        f"Dear {_recipient_name(request.custodian or RecordsCustodian())},",
        "",
        f"I am the parent/guardian requesting access to my child's education records. {_case_summary_line(case)}",
        "",
        f"Basis for request: {request.legal_basis}.",
        "",
        "Please provide the following records in electronic form where available:",
        request.records_description,
        "",
        "If a requested item is not maintained by your office, please identify the office or person most likely to have it.",
        "",
        "Sincerely,",
        "[Parent/Guardian]",
    ])


def render_records_request_letter(case: CaseRecord, request: RecordsRequest) -> str:
    if request.request_type == "state_public_records":
        return _render_state_letter(case, request)
    return _render_education_letter(case, request)


def _state_records_request(case: CaseRecord, custodian: RecordsCustodian, entity_ids: list[str]) -> RecordsRequest:
    state = normalize_state(case.intake.state)
    pack = get_rule_pack(state)
    if pack:
        law_code = pack.public_records_law_code
        legal_basis = f"{pack.public_records_law_label}, {pack.public_records_citation}"
        source_refs = pack.sources
        status = "draft"
        confirmed = True
        jurisdiction = pack.jurisdiction
    else:
        law_code = "STATE_PUBLIC_RECORDS_UNSUPPORTED"
        legal_basis = "Confirm the state public-records law and custodian before sending this request."
        source_refs = []
        status = "needs_review"
        confirmed = False
        jurisdiction = state or "UNKNOWN"

    records_description = "\n".join([
        "- Incident, investigation, witness, supervision, and response records connected to the concern.",
        "- Communications between school, district, program, or agency staff about the concern.",
        "- Policies, procedures, staff guidance, training materials, schedules, or staffing records that applied at the time.",
        "- Records showing any follow-up, corrective action, denial, partial response, or closure decision.",
    ])
    request = RecordsRequest(
        id=_stable_id(case.id, law_code, "public_records"),
        workspace_id=case.workspace_id,
        case_id=case.id,
        request_type="state_public_records",
        request_law_code=law_code,
        jurisdiction=jurisdiction,
        jurisdiction_confirmed=confirmed,
        entity_ids=entity_ids,
        custodian=custodian,
        subject="Public records about the incident, response, and applicable policies",
        records_description=records_description,
        legal_basis=legal_basis,
        relevance="These records can show what happened, what the agency knew, how it responded, and what rules applied.",
        record_category="incident_response",
        status=status,
        source_refs=source_refs,
        cautions=[CAUTION],
        trace_metadata={"route": "deterministic_records_generator_v1", "state": state or "unknown"},
    )
    request.letter_text = render_records_request_letter(case, request)
    return request


def _ferpa_request(case: CaseRecord, custodian: RecordsCustodian, entity_ids: list[str]) -> RecordsRequest:
    records_description = "\n".join([
        "- Education records about the incident or concern, including reports, notes, logs, emails, and meeting records.",
        "- Any discipline, attendance, nursing, safety, counseling, or administrative records connected to the concern.",
        "- Records showing notices sent to the family and internal records of the school's response.",
    ])
    request = RecordsRequest(
        id=_stable_id(case.id, "FERPA_EDUCATION_RECORDS", "education_records"),
        workspace_id=case.workspace_id,
        case_id=case.id,
        request_type="education_records_ferpa",
        request_law_code="FERPA_EDUCATION_RECORDS",
        jurisdiction="US",
        jurisdiction_confirmed=True,
        entity_ids=entity_ids,
        custodian=custodian,
        subject="Parent request for education records connected to this concern",
        records_description=records_description,
        legal_basis="FERPA and 34 CFR Part 99",
        relevance="Education records can help the parent compare the official record with the saved narrative and evidence.",
        record_category="education_records",
        source_refs=[FEDERAL_FERPA_SOURCE, FERPA_GUIDANCE_SOURCE],
        cautions=[CAUTION],
        trace_metadata={"route": "deterministic_records_generator_v1", "federal": "ferpa"},
    )
    request.letter_text = render_records_request_letter(case, request)
    return request


def _idea_request(case: CaseRecord, custodian: RecordsCustodian, entity_ids: list[str]) -> RecordsRequest:
    records_description = "\n".join([
        "- Evaluation, eligibility, IEP, placement, prior written notice, and procedural-safeguard records.",
        "- Records of parent requests, meeting notes, service logs, progress reports, and school responses.",
        "- Communications about accommodations, services, placement, discipline, exclusion, or changes after the parent's request.",
    ])
    request = RecordsRequest(
        id=_stable_id(case.id, "IDEA_SPECIAL_EDUCATION_RECORDS", "special_education"),
        workspace_id=case.workspace_id,
        case_id=case.id,
        request_type="special_education_idea",
        request_law_code="IDEA_SPECIAL_EDUCATION_RECORDS",
        jurisdiction="US",
        jurisdiction_confirmed=True,
        entity_ids=entity_ids,
        custodian=custodian,
        subject="Parent request for special education records",
        records_description=records_description,
        legal_basis="IDEA Part B regulations, 34 CFR Part 300",
        relevance="Special education records can show requests, notice, services, decisions, and whether the case file has the records needed for a meaningful review.",
        record_category="special_education",
        source_refs=[FEDERAL_IDEA_SOURCE],
        cautions=[CAUTION],
        trace_metadata={"route": "deterministic_records_generator_v1", "federal": "idea"},
    )
    request.letter_text = render_records_request_letter(case, request)
    return request


def generate_records_requests_for_case(case: CaseRecord, entities: list[Entity], existing: list[RecordsRequest] | None = None) -> list[RecordsRequest]:
    custodian, entity_ids = _primary_custodian(case, entities)
    generated = [_state_records_request(case, custodian, entity_ids)]
    if _needs_ferpa_request(case):
        generated.append(_ferpa_request(case, custodian, entity_ids))
    if _needs_idea_request(case):
        generated.append(_idea_request(case, custodian, entity_ids))

    existing_by_id = {item.id: item for item in existing or []}
    now = utc_now()
    merged = []
    for request in generated:
        previous = existing_by_id.get(request.id)
        if previous:
            request.status = previous.status
            request.sent_at = previous.sent_at
            request.response_notes = previous.response_notes
            request.response_doc_ids = previous.response_doc_ids
            request.created_at = previous.created_at
        request.updated_at = now
        merged.append(request)
    return merged
