"""
KORA Request Generator — produces targeted Kansas Open Records Act requests
from case data using LLM analysis.

Two-pass approach:
  1. GenerateKoraRequests: turn existing evidence gaps into structured requests
  2. BrainstormRecordCategories: discover NEW record categories not yet identified
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

import dspy

from app.models import Entity, KoraRequest, RecordsCustodian

logger = logging.getLogger(__name__)


class GenerateKoraRequests(dspy.Signature):
    """Given case evidence gaps and target entities, generate specific KORA
    (Kansas Open Records Act) requests for each gap.

    Each request should:
    - Target one or more agencies (entity_ids)
    - Describe the specific records sought with enough detail to be actionable
    - Cite the relevant K.S.A. provisions
    - Explain why the records matter to the case
    - Assign a record_category
    """
    case_summary: str = dspy.InputField(desc="Brief summary of the case and its legal context")
    entities_json: str = dspy.InputField(desc="JSON array of entities (agencies) with id, name, type")
    evidence_gaps_json: str = dspy.InputField(desc="JSON array of evidence gaps with id, item, importance, method")
    statutes_json: str = dspy.InputField(desc="JSON array of relevant statutes with citation, holding, relevance")

    requests: list[dict] = dspy.OutputField(
        desc=(
            "List of KORA request dicts. Each has: "
            "'entity_ids' (list of target agency ids), "
            "'subject' (short title), "
            "'records_description' (detailed records sought — be specific about dates, names, types), "
            "'legal_basis' (K.S.A. citations and why they apply), "
            "'relevance' (why these records matter to the case), "
            "'evidence_gap_ids' (list of GAP ids this addresses), "
            "'record_category' (one of: incident_reports, communications, training, policy, meeting_minutes, inspection, personnel, financial)"
        )
    )


class BrainstormRecordCategories(dspy.Signature):
    """Given full case context, brainstorm ADDITIONAL public record categories
    that should be requested via KORA but are NOT already covered by the
    evidence gaps.

    Think about:
    - Internal communications between agencies
    - Personnel and disciplinary records
    - Insurance and liability records
    - Inspection and compliance histories
    - Financial records (contracts, payments, fees)
    - Meeting minutes and executive session topics
    - Training and certification records
    - Prior incident patterns
    """
    case_summary: str = dspy.InputField(desc="Brief summary of the case")
    entities_json: str = dspy.InputField(desc="JSON array of entities with id, name, type")
    actors_json: str = dspy.InputField(desc="JSON array of key persons with name, role, organization")
    statutes_json: str = dspy.InputField(desc="JSON array of relevant statutes")
    existing_requests_summary: str = dspy.InputField(desc="Summary of KORA requests already generated from evidence gaps")

    new_requests: list[dict] = dspy.OutputField(
        desc=(
            "List of NEW KORA request dicts NOT covered by existing requests. Same format: "
            "'entity_ids', 'subject', 'records_description', 'legal_basis', 'relevance', "
            "'evidence_gap_ids' (empty list since these are new), "
            "'record_category'"
        )
    )


def _load_case_data() -> dict:
    """Load case-data.json from the standard locations."""
    for p in [
        Path("/app/case-data/case-data.json"),
        Path(__file__).resolve().parents[3] / "data" / "case-data.json",
    ]:
        if p.exists():
            return json.loads(p.read_text())
    raise FileNotFoundError("case-data.json not found")


def _build_case_summary(data: dict) -> str:
    meta = data.get("meta", {})
    return (
        f"Case: {meta.get('case', 'Unknown')}\n"
        f"A {meta.get('studentAgeLabel', 'child')} was assaulted during an after-school program "
        f"operated by JCPRD on USD 232 school property. Neither agency investigated. "
        f"The case involves failures of supervision, contractual obligations under a lease agreement, "
        f"KDHE child care licensing violations, and institutional deflection of responsibility."
    )


def _render_letter(req: KoraRequest, entities_by_id: dict[str, Entity]) -> str:
    """Render a formal KORA request letter."""
    entity_names = [entities_by_id[eid].name for eid in req.entity_ids if eid in entities_by_id]
    primary = entity_names[0] if entity_names else "Records Custodian"

    custodian_block = ""
    if req.custodian and req.custodian.name:
        lines = [req.custodian.name]
        if req.custodian.title:
            lines.append(req.custodian.title)
        lines.append(primary)
        if req.custodian.address:
            lines.append(req.custodian.address)
        if req.custodian.email:
            lines.append(req.custodian.email)
        custodian_block = "\n".join(lines)
    else:
        custodian_block = f"Records Custodian\n{primary}"

    date_str = datetime.now().strftime("%B %d, %Y")

    return f"""{date_str}

{custodian_block}

Re: Kansas Open Records Act Request — {req.subject}

Dear Records Custodian:

Pursuant to the Kansas Open Records Act, K.S.A. 45-215 et seq., I am requesting access to and copies of the following public records:

{req.records_description}

LEGAL BASIS:
{req.legal_basis}

I request these records in electronic format where available. If any portion of the requested records is exempt from disclosure, please redact the exempt material and provide the remainder, along with a written explanation citing the specific statutory exemption for each redaction, as required by K.S.A. 45-218(d).

Per K.S.A. 45-218(d), I expect a response within three business days of receipt of this request. I am willing to pay reasonable fees for copies. If fees will exceed $25.00, please notify me before proceeding.

Thank you for your prompt attention to this matter.

Sincerely,
[Your Name]
[Your Address]
[Your Email]
[Your Phone]"""


def generate_kora_requests(
    entities_override: list[Entity] | None = None,
) -> list[KoraRequest]:
    """Main entry point: generate KORA requests from case data.

    Returns a list of KoraRequest objects ready to store.
    """
    from app.config import settings
    from app.api._store import entities as entity_store

    lm = dspy.LM(settings.synthesize_model, max_tokens=8000)
    dspy.configure(lm=lm)

    data = _load_case_data()
    case_summary = _build_case_summary(data)

    all_entities = entities_override or list(entity_store.values())
    entities_json = json.dumps([
        {"id": e.id, "name": e.name, "type": e.type, "state": e.state}
        for e in all_entities
    ], indent=2)

    entities_by_id = {e.id: e for e in all_entities}

    gaps = data.get("evidenceGaps", [])
    kora_gaps = [g for g in gaps if "KORA" in (g.get("method") or "").upper()
                 or "records" in (g.get("method") or "").lower()]
    gaps_json = json.dumps(kora_gaps, indent=2)

    statutes = data.get("sources", [])
    kora_statutes = [s for s in statutes
                     if s.get("type") == "statute"
                     or "KORA" in (s.get("holding") or "").upper()
                     or "45-21" in (s.get("citation") or "")]
    statutes_json = json.dumps([
        {"citation": s.get("citation", ""), "holding": s.get("holding", ""), "relevance": s.get("relevance", "")}
        for s in kora_statutes[:20]
    ], indent=2)

    actors = data.get("actors", [])
    actors_json = json.dumps([
        {"name": a.get("name", ""), "role": a.get("role", ""), "org": a.get("org", "")}
        for a in actors[:15]
    ], indent=2)

    logger.info("Generating KORA requests — %d gaps, %d entities, %d statutes",
                len(kora_gaps), len(all_entities), len(kora_statutes))

    generator = dspy.ChainOfThought(GenerateKoraRequests)
    result = generator(
        case_summary=case_summary,
        entities_json=entities_json,
        evidence_gaps_json=gaps_json,
        statutes_json=statutes_json,
    )

    requests_data = result.requests or []
    if isinstance(requests_data, str):
        try:
            requests_data = json.loads(requests_data)
        except (json.JSONDecodeError, TypeError):
            requests_data = []

    all_requests: list[KoraRequest] = []
    for rd in requests_data:
        if not isinstance(rd, dict):
            continue
        req = KoraRequest(
            entity_ids=rd.get("entity_ids", []),
            subject=rd.get("subject", ""),
            records_description=rd.get("records_description", ""),
            legal_basis=rd.get("legal_basis", ""),
            relevance=rd.get("relevance", ""),
            evidence_gap_ids=rd.get("evidence_gap_ids", []),
            record_category=rd.get("record_category", ""),
        )
        req.letter_text = _render_letter(req, entities_by_id)
        all_requests.append(req)

    existing_summary = "\n".join(
        f"- {r.subject} ({r.record_category})" for r in all_requests
    )

    logger.info("Pass 1 complete: %d requests from evidence gaps. Starting brainstorm...",
                len(all_requests))

    brainstormer = dspy.ChainOfThought(BrainstormRecordCategories)
    brainstorm_result = brainstormer(
        case_summary=case_summary,
        entities_json=entities_json,
        actors_json=actors_json,
        statutes_json=statutes_json,
        existing_requests_summary=existing_summary or "(none yet)",
    )

    new_data = brainstorm_result.new_requests or []
    if isinstance(new_data, str):
        try:
            new_data = json.loads(new_data)
        except (json.JSONDecodeError, TypeError):
            new_data = []

    for rd in new_data:
        if not isinstance(rd, dict):
            continue
        req = KoraRequest(
            entity_ids=rd.get("entity_ids", []),
            subject=rd.get("subject", ""),
            records_description=rd.get("records_description", ""),
            legal_basis=rd.get("legal_basis", ""),
            relevance=rd.get("relevance", ""),
            evidence_gap_ids=[],
            record_category=rd.get("record_category", ""),
        )
        req.letter_text = _render_letter(req, entities_by_id)
        all_requests.append(req)

    logger.info("KORA generation complete: %d total requests", len(all_requests))
    return all_requests
