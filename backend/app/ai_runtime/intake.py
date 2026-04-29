from __future__ import annotations

from app.time import utc_now

import json
import re
from datetime import datetime

from app.api._store import agent_runs
from app.config import settings
from app.models import AgentRun, CaseIntakeAnalysis, CaseIntakeFacts, CaseIntakeMessage, CaseIntakeSession

REASONING_MODEL = settings.deepinfra_reasoning_model
FALLBACK_MODEL = settings.deepinfra_fallback_model


ISSUE_KEYWORDS = {
    "student_safety": ("unsafe", "injury", "hurt", "supervision", "assault", "safety", "threat", "restraint", "seclusion"),
    "special_education": ("iep", "504", "accommodation", "evaluation", "services", "disability", "fape"),
    "bullying_harassment": ("bully", "bullying", "harass", "harassment", "discrimination", "slur"),
    "discipline": ("suspension", "expulsion", "discipline", "detention", "removed"),
    "records": ("records", "email", "kora", "foia", "open records", "request"),
    "retaliation": ("retaliation", "retaliate", "afraid", "targeted", "punished for"),
}

STATE_HINTS = {
    "kansas": "KS",
    "ks": "KS",
    "montana": "MT",
    "mt": "MT",
    "missouri": "MO",
    "mo": "MO",
    "colorado": "CO",
    "co": "CO",
    "texas": "TX",
    "tx": "TX",
}


def _conversation_text(session: CaseIntakeSession) -> str:
    return "\n".join(
        f"{message.role}: {message.content}"
        for message in session.messages
        if message.role in {"user", "assistant"}
    ).strip()


def _user_text(session: CaseIntakeSession) -> str:
    return "\n".join(message.content for message in session.messages if message.role == "user").strip()


def _merge_facts(base: CaseIntakeFacts, patch: CaseIntakeFacts | dict, overrides: dict | None = None) -> CaseIntakeFacts:
    data = base.model_dump()
    patch_data = patch.model_dump() if isinstance(patch, CaseIntakeFacts) else dict(patch)
    for key, value in patch_data.items():
        if value in (None, "", [], {}):
            continue
        data[key] = value
    for key, value in (overrides or {}).items():
        data[key] = value
    return CaseIntakeFacts(**data)


def _infer_state(text: str) -> str:
    lowered = text.lower()
    for hint, code in STATE_HINTS.items():
        if re.search(rf"\b{re.escape(hint)}\b", lowered):
            return code
    return ""


def _infer_district(text: str) -> str:
    patterns = [
        r"\bUSD\s*[-#]?\s*\d+\b",
        r"\b[A-Z][A-Za-z .'-]{2,60}\s+(?:Public Schools|School District|Unified School District|ISD)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return re.sub(r"\s+", " ", match.group(0)).strip()
    return ""


def _infer_school(text: str) -> str:
    match = re.search(r"\b[A-Z][A-Za-z .'-]{2,60}\s+(?:Elementary|Middle|High|School|Academy)\b", text)
    return re.sub(r"\s+", " ", match.group(0)).strip() if match else ""


def _infer_date(text: str) -> str | None:
    numeric = re.search(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b", text)
    if numeric:
        return numeric.group(0)
    month = re.search(
        r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:,\s*\d{4})?\b",
        text,
        re.IGNORECASE,
    )
    return month.group(0) if month else None


def _infer_age(text: str) -> int | None:
    match = re.search(r"\b(?:age|aged)\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:year|yr)[-\s]*old\b", text, re.IGNORECASE)
    if not match:
        return None
    value = match.group(1) or match.group(2)
    age = int(value)
    return age if 2 <= age <= 25 else None


def _infer_grade(text: str) -> str:
    match = re.search(r"\b(?:kindergarten|pre-k|prek|\d{1,2}(?:st|nd|rd|th)?\s+grade|freshman|sophomore|junior|senior)\b", text, re.IGNORECASE)
    return match.group(0) if match else ""


def _infer_issue_categories(text: str) -> list[str]:
    lowered = text.lower()
    categories = []
    for category, words in ISSUE_KEYWORDS.items():
        if any(word in lowered for word in words):
            categories.append(category)
    return categories or ["other"]


def _infer_prior_actions(text: str) -> list[str]:
    lowered = text.lower()
    actions = []
    if any(word in lowered for word in ("emailed", "email", "called", "contacted", "texted")):
        actions.append("Contacted school staff")
    if any(word in lowered for word in ("principal", "administrator")):
        actions.append("Contacted principal or administrator")
    if any(word in lowered for word in ("records request", "requested records", "kora", "foia")):
        actions.append("Requested records")
    if any(word in lowered for word in ("meeting", "met with", "conference")):
        actions.append("Met with the school")
    if any(word in lowered for word in ("complaint", "ocr", "state complaint", "agency")):
        actions.append("Filed or considered a complaint")
    return actions


def _infer_desired_outcomes(text: str) -> list[str]:
    lowered = text.lower()
    outcomes = []
    if "record" in lowered:
        outcomes.append("Understand what records to request")
    if "meeting" in lowered:
        outcomes.append("Prepare for a school meeting")
    if any(word in lowered for word in ("safe", "safety", "injury", "supervision")):
        outcomes.append("Document safety concerns")
    if any(word in lowered for word in ("complaint", "ocr", "civil rights")):
        outcomes.append("Evaluate complaint options")
    if any(word in lowered for word in ("attorney", "lawyer", "advocate")):
        outcomes.append("Find attorney or advocate support")
    return outcomes or ["Understand what records to request"]


def _heuristic_analysis(session: CaseIntakeSession) -> CaseIntakeAnalysis:
    text = _user_text(session)
    lowered = text.lower()
    categories = _infer_issue_categories(text)
    facts = _merge_facts(
        session.facts,
        CaseIntakeFacts(
            title=session.facts.title or (_infer_district(text) or _infer_school(text) or "New school case"),
            state=_infer_state(text),
            district=_infer_district(text),
            school=_infer_school(text),
            issue_type=categories[0],
            issue_categories=categories,
            incident_date=_infer_date(text),
            narrative=text,
            desired_outcomes=_infer_desired_outcomes(text),
            desired_outcome="; ".join(_infer_desired_outcomes(text)),
            impacted_party_age=_infer_age(text),
            student_age=_infer_age(text),
            grade_level=_infer_grade(text),
            relationship_to_child="parent_guardian" if any(word in lowered for word in ("my son", "my daughter", "my child", "parent")) else "",
            iep_504_status="iep" if "iep" in lowered else ("504" if "504" in lowered else ""),
            urgency_level="immediate" if any(word in lowered for word in ("immediate", "emergency", "unsafe now")) else ("urgent" if any(word in lowered for word in ("urgent", "unsafe", "injury", "retaliation")) else "routine"),
            safety_risk=any(word in lowered for word in ("unsafe", "injury", "hurt", "assault", "supervision", "safety")),
            retaliation_concern=any(word in lowered for word in ("retaliation", "retaliate", "afraid", "targeted")),
            prior_actions=_infer_prior_actions(text),
            urgent=any(word in lowered for word in ("urgent", "immediate", "unsafe", "injury")),
        ),
        session.user_overrides,
    )
    confidence = {
        "narrative": 0.9 if facts.narrative else 0.0,
        "district": 0.75 if facts.district else 0.0,
        "school": 0.7 if facts.school else 0.0,
        "state": 0.65 if facts.state else 0.0,
        "incident_date": 0.55 if facts.incident_date else 0.0,
        "issue_categories": 0.72 if facts.issue_categories and facts.issue_categories != ["other"] else 0.35,
    }
    missing = [
        label for label, present in {
            "district or agency involved": bool(facts.district or facts.school),
            "who was impacted": bool(facts.impacted_party_age or facts.grade_level or facts.relationship_to_child),
            "what outcome the parent wants": bool(facts.desired_outcome or facts.desired_outcomes),
        }.items() if not present
    ]
    if not facts.safety_risk and "student_safety" in facts.issue_categories:
        missing.append("whether there is a current safety concern")
    next_question = _next_question(facts, missing)
    return CaseIntakeAnalysis(
        facts=facts,
        confidence=confidence,
        missing_fields=missing,
        issue_tags=facts.issue_categories,
        next_question=next_question,
        assistant_message=_assistant_message(facts, missing, next_question),
        draft_title=facts.title or "New school case",
    )


def _next_question(facts: CaseIntakeFacts, missing: list[str]) -> str:
    if "who was impacted" in missing:
        return "Who was impacted, and roughly what age or grade are they in?"
    if not facts.district and not facts.school:
        return "What school, district, program, or agency was involved?"
    if "whether there is a current safety concern" in missing:
        return "Is there any current safety risk or urgent placement concern right now?"
    if not facts.prior_actions:
        return "What have you already tried: emails, meetings, records requests, complaints, or something else?"
    return "What outcome are you hoping for first: records, a meeting, a safety plan, complaint options, or outside support?"


def _assistant_message(facts: CaseIntakeFacts, missing: list[str], next_question: str) -> str:
    understood = []
    if facts.district or facts.school:
        understood.append(f"involved: {facts.school or facts.district}")
    if facts.issue_categories:
        understood.append(f"issue area: {', '.join(facts.issue_categories)}")
    if facts.urgency_level and facts.urgency_level != "routine":
        understood.append(f"urgency: {facts.urgency_level}")
    prefix = "I have enough to start organizing this." if understood else "I am starting a case file from what you shared."
    if understood:
        prefix += " I am seeing " + "; ".join(understood) + "."
    if missing:
        prefix += " The biggest gap is " + missing[0] + "."
    return f"{prefix} {next_question}"


def _run_agno_analysis(session: CaseIntakeSession, model_id: str = REASONING_MODEL) -> CaseIntakeAnalysis:
    if not settings.has_deepinfra:
        raise RuntimeError("DEEPINFRA_API_KEY is not configured")
    from agno.agent import Agent
    from agno.models.deepinfra import DeepInfra

    agent = Agent(
        name="USDWatch Case Advocate Intake",
        model=DeepInfra(id=model_id, temperature=0.1, max_tokens=2500),
        output_schema=CaseIntakeAnalysis,
        instructions=[
            "You are a careful parent-facing case advocate intake agent.",
            "Extract only facts supported by the parent messages; leave uncertain fields blank.",
            "Ask one practical follow-up question at a time.",
            "Do not provide legal advice or promise outcomes.",
        ],
        markdown=False,
    )
    prompt = "\n\n".join([
        "Analyze this intake conversation and return structured JSON.",
        f"Current facts:\n{session.facts.model_dump_json()}",
        f"User overrides:\n{json.dumps(session.user_overrides)}",
        f"Conversation:\n{_conversation_text(session)}",
    ])
    response = agent.run(prompt)
    content = getattr(response, "content", response)
    if isinstance(content, CaseIntakeAnalysis):
        return content
    if isinstance(content, dict):
        return CaseIntakeAnalysis(**content)
    return CaseIntakeAnalysis.model_validate_json(str(content))


def analyze_intake_session(session: CaseIntakeSession) -> CaseIntakeSession:
    run = AgentRun(
        workspace_id=session.workspace_id,
        case_id=session.draft_case_id or "intake",
        evaluation_id=session.id,
        agent_id="case_advocate_intake",
        status="running",
        model_id=REASONING_MODEL,
    )
    agent_runs[run.id] = run
    try:
        try:
            try:
                analysis = _run_agno_analysis(session, REASONING_MODEL)
            except Exception as primary_exc:
                if REASONING_MODEL == FALLBACK_MODEL or not settings.has_deepinfra:
                    raise
                run.model_id = FALLBACK_MODEL
                run.status = "fallback_model"
                run.error = f"Primary model {REASONING_MODEL} failed: {primary_exc}"
                analysis = _run_agno_analysis(session, FALLBACK_MODEL)
            if run.status != "fallback_model":
                run.status = "complete"
        except Exception as exc:
            analysis = _heuristic_analysis(session)
            run.status = "fallback"
            run.error = str(exc)

        session.facts = _merge_facts(session.facts, analysis.facts, session.user_overrides)
        session.confidence = {**session.confidence, **analysis.confidence}
        session.missing_fields = analysis.missing_fields
        session.issue_tags = analysis.issue_tags
        session.next_question = analysis.next_question
        if analysis.assistant_message:
            session.messages.append(CaseIntakeMessage(role="assistant", content=analysis.assistant_message))
        session.updated_at = utc_now()
        run.output_tokens = len((analysis.assistant_message or "").split())
        return session
    finally:
        run.completed_at = utc_now()
        agent_runs[run.id] = run
