from __future__ import annotations

from app.time import utc_now

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
import json
import re

from app.api._store import agent_runs
from app.config import settings
from app.models import (
    AdvocateActionProposal,
    AdvocateMessagePart,
    AdvocateSafetyFlag,
    AdvocateSource,
    AgentRun,
    CaseChatTurnResult,
    CaseIntakeAnalysis,
    CaseIntakeFacts,
    CaseIntakeMessage,
    CaseIntakeQuestion,
    CaseIntakeSession,
)

REASONING_MODEL = settings.deepinfra_reasoning_model
FALLBACK_MODEL = settings.deepinfra_fallback_model
AGNO_RUN_TIMEOUT_SECONDS = 30.0
LOCAL_CASE_FILE_MODEL = "local-case-file"
LOCAL_CASE_FILE_INTENTS = {
    "case_summary",
    "evidence_question",
    "records_question",
    "timeline_question",
    "gap_question",
    "action_request",
    "legal_boundary",
    "smalltalk",
}


class CaseChatModelTimeout(RuntimeError):
    """Raised when a hosted chat model exceeds the per-turn budget."""


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


def _latest_user_message(session: CaseIntakeSession) -> str:
    for message in reversed(session.messages):
        if message.role == "user":
            return message.content
    return ""


def classify_case_chat_intent(message: str, hint: str = "") -> str:
    explicit = hint.strip().lower()
    if explicit in {
        "case_question",
        "case_summary",
        "evidence_question",
        "records_question",
        "timeline_question",
        "gap_question",
        "intake_answer",
        "action_request",
        "legal_boundary",
        "smalltalk",
    }:
        return explicit

    text = message.strip()
    lowered = text.lower()
    if not lowered:
        return "smalltalk"
    if "question:" in lowered and "answer:" in lowered:
        return "intake_answer"
    asks_for_info = bool(
        "?" in text
        or re.search(r"\b(tell me|what|why|how|when|where|who|which|can you|could you|please help|help me)\b", lowered)
    )
    if any(phrase in lowered for phrase in ("legal advice", "should i sue", "can i sue", "lawsuit", "attorney", "lawyer")):
        return "legal_boundary"
    if re.search(r"\b(summarize|summary|recap|overview|what is this case|tell me about (this|my) case)\b", lowered):
        return "case_summary"
    if asks_for_info and re.search(r"\b(evidence|proof|source|sources|document|documents|file|files|screenshot|incident report)\b", lowered):
        return "evidence_question"
    if asks_for_info and re.search(r"\b(records?|kora|foia|open records|request|requests?)\b", lowered):
        return "records_question"
    if asks_for_info and re.search(r"\b(timeline|chronology|sequence|dates?|when did|what happened first)\b", lowered):
        return "timeline_question"
    if asks_for_info and re.search(r"\b(gap|gaps|missing|weak|weakness|strength|need next|next step|what else)\b", lowered):
        return "gap_question"
    if re.search(r"\b(open|go to|take me|show me|navigate|switch to|run|draft|import|update|search gmail|start case read)\b", lowered):
        return "action_request"
    if lowered in {"hi", "hello", "hey", "thanks", "thank you"}:
        return "smalltalk"
    if "?" in text:
        return "case_question"
    return "intake_answer"


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


def _as_source(item: dict) -> AdvocateSource | None:
    try:
        return AdvocateSource(**item)
    except Exception:
        return None


def _context_sources(context: dict | None) -> list[AdvocateSource]:
    sources: list[AdvocateSource] = []
    for item in (context or {}).get("evidence_sources", []):
        source = _as_source(item)
        if source:
            sources.append(source)
    return sources


def _safe_route(context: dict | None, suffix: str = "") -> str:
    base = (context or {}).get("route_base") or ""
    return f"{base}{suffix}" if base else suffix


def _action_proposals_for_message(message: str, context: dict | None) -> list[AdvocateActionProposal]:
    lowered = message.lower()
    actions: list[AdvocateActionProposal] = []
    if any(word in lowered for word in ("evidence", "locker", "upload", "document", "file", "pdf", "incident report")):
        actions.append(AdvocateActionProposal(
            type="open_evidence_locker",
            label="Open Evidence Locker",
            description="Go to the evidence workspace so you can review or upload source records.",
            payload={"route": _safe_route(context, "/locker")},
        ))
    if any(word in lowered for word in ("records", "kora", "foia", "request")):
        actions.append(AdvocateActionProposal(
            type="draft_records_request",
            label="Review Records Requests",
            description="Open the records workspace before any request is drafted or sent.",
            payload={"route": _safe_route(context, "/records")},
        ))
    if any(word in lowered for word in ("gmail", "email import", "search email", "search gmail")):
        actions.append(AdvocateActionProposal(
            type="search_gmail",
            label="Review Gmail Import",
            description="Check connected Gmail evidence settings before any messages are searched or imported.",
            payload={"route": _safe_route(context, "/locker"), "mode": "gmail"},
        ))
    if any(word in lowered for word in ("case read", "evaluate", "evaluation", "run the read")):
        actions.append(AdvocateActionProposal(
            type="start_case_read",
            label="Prepare Case Read",
            description="Review the case file before starting a Case Read.",
            payload={"route": _safe_route(context, "")},
        ))
    if any(word in lowered for word in ("plan", "overview", "case plan")):
        actions.append(AdvocateActionProposal(
            type="navigate",
            label="Open Case Plan",
            description="Go back to the case plan overview.",
            payload={"route": _safe_route(context, "")},
        ))
    return actions[:3]


def _safety_flags_for_message(message: str, facts: CaseIntakeFacts, sources: list[AdvocateSource]) -> list[AdvocateSafetyFlag]:
    lowered = message.lower()
    flags: list[AdvocateSafetyFlag] = []
    if any(word in lowered for word in ("legal advice", "sue", "lawsuit", "attorney", "lawyer", "file a complaint")):
        flags.append(AdvocateSafetyFlag(
            type="legal_boundary",
            label="Information only",
            detail="Chat can organize facts and prepare questions, but it should not be treated as legal advice.",
            severity="warning",
        ))
    if facts.safety_risk or facts.urgent or facts.urgency_level in {"urgent", "immediate"}:
        flags.append(AdvocateSafetyFlag(
            type="urgent_safety",
            label="Safety concern",
            detail="Current safety concerns should stay visible while the case file is organized.",
            severity="warning",
        ))
    if any(word in lowered for word in ("evidence", "proof", "document", "record", "timeline", "contradiction")) and not sources:
        flags.append(AdvocateSafetyFlag(
            type="missing_evidence",
            label="No matching source found",
            detail="The answer should be treated as a planning note until matching evidence is added or found.",
            severity="info",
        ))
    return flags[:3]


def _default_message_parts(
    assistant_message: str,
    sources: list[AdvocateSource],
    actions: list[AdvocateActionProposal],
    safety_flags: list[AdvocateSafetyFlag],
) -> list[AdvocateMessagePart]:
    parts = [AdvocateMessagePart(type="text", text=assistant_message)]
    if sources:
        parts.append(AdvocateMessagePart(
            type="source_claim",
            title="Sources checked",
            text="I found matching evidence in the case file.",
            source_ids=[source.id for source in sources[:4]],
        ))
    if actions:
        parts.append(AdvocateMessagePart(
            type="checklist",
            title="Confirm before I do anything",
            items=[action.label for action in actions],
            severity="warning",
        ))
    if safety_flags:
        parts.append(AdvocateMessagePart(
            type="status",
            title="Boundary to keep in mind",
            text=safety_flags[0].detail or safety_flags[0].label,
            severity=safety_flags[0].severity,
        ))
    return parts


def _normalize_manager_output(
    analysis: CaseIntakeAnalysis,
    session: CaseIntakeSession,
    context: dict | None,
    *,
    fallback: bool,
    model_id: str,
    error: str = "",
) -> CaseIntakeAnalysis:
    latest_message = _latest_user_message(session)
    allowed_sources = {source.id: source for source in _context_sources(context)}
    allowed_doc_ids = {source.document_id: source for source in allowed_sources.values() if source.document_id}
    normalized_sources: list[AdvocateSource] = []
    for source in analysis.sources:
        if source.id in allowed_sources:
            normalized_sources.append(allowed_sources[source.id])
        elif source.document_id in allowed_doc_ids:
            normalized_sources.append(allowed_doc_ids[source.document_id])
    if not normalized_sources:
        normalized_sources = list(allowed_sources.values())[:4]

    action_proposals = analysis.action_proposals or _action_proposals_for_message(latest_message, context)
    for action in action_proposals:
        action.requires_confirmation = True
        if action.status not in {"approved", "rejected", "expired"}:
            action.status = "pending"
        if not action.payload.get("route"):
            route_by_type = {
                "open_evidence_locker": _safe_route(context, "/locker"),
                "draft_records_request": _safe_route(context, "/records"),
                "search_gmail": _safe_route(context, "/locker"),
                "start_case_read": _safe_route(context, ""),
                "navigate": _safe_route(context, ""),
            }
            if action.type in route_by_type:
                action.payload = {**action.payload, "route": route_by_type[action.type]}

    safety_flags = analysis.safety_flags or _safety_flags_for_message(latest_message, analysis.facts, normalized_sources)
    if not analysis.assistant_message:
        analysis.assistant_message = _assistant_message(analysis.facts, analysis.missing_fields, analysis.next_question)
    if not analysis.message_parts:
        analysis.message_parts = _default_message_parts(analysis.assistant_message, normalized_sources, action_proposals, safety_flags)
    analysis.sources = normalized_sources
    analysis.action_proposals = action_proposals[:4]
    analysis.safety_flags = safety_flags
    analysis.model_route = {
        "runtime": "agno",
        "agent": "case_advocate_manager",
        "model": model_id,
        "provider": "deepinfra",
        "fallback": fallback,
        "error": error,
    }
    analysis.trace_id = analysis.trace_id or f"adv-{session.id}-{utc_now().strftime('%Y%m%d%H%M%S')}"
    return analysis


def _heuristic_analysis(session: CaseIntakeSession, context: dict | None = None) -> CaseIntakeAnalysis:
    text = _user_text(session)
    lowered = text.lower()
    categories = _infer_issue_categories(text)
    narrative = text.strip()
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
            narrative=narrative,
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
    suggested_actions = []
    if not facts.narrative:
        suggested_actions.append("Start with what happened in your own words.")
    if missing:
        suggested_actions.append(f"Fill the next case-file gap: {missing[0]}.")
    if not facts.prior_actions:
        suggested_actions.append("Share what you have already tried so records and next steps fit the real history.")
    question_cards = _question_cards(facts, missing, next_question)
    assistant_message = _assistant_message(facts, missing, next_question)
    sources = _context_sources(context)
    actions = _action_proposals_for_message(_latest_user_message(session), context)
    safety_flags = _safety_flags_for_message(_latest_user_message(session), facts, sources)
    return CaseIntakeAnalysis(
        facts=facts,
        confidence=confidence,
        missing_fields=missing,
        issue_tags=facts.issue_categories,
        next_question=next_question,
        question_cards=question_cards,
        assistant_message=assistant_message,
        draft_title=facts.title or "New school case",
        family_narrative_patch=narrative,
        suggested_actions=suggested_actions[:3],
        route_suggestion="",
        message_parts=_default_message_parts(assistant_message, sources, actions, safety_flags),
        sources=sources,
        action_proposals=actions,
        safety_flags=safety_flags,
    )


def _question_cards(facts: CaseIntakeFacts, missing: list[str], next_question: str) -> list[CaseIntakeQuestion]:
    cards: list[CaseIntakeQuestion] = []
    if not next_question:
        return cards

    label = "Next case-file question"
    field = "case_context"
    why = "This helps USDWatch organize the case file without forcing you into a long form."
    input_type = "free_text"
    options: list[str] = []

    if "who was impacted" in missing:
        label = "Who was impacted"
        field = "impacted_party"
        why = "Age, grade, and relationship help the Case Read adjust the questions and records checklist."
    elif not facts.district and not facts.school:
        label = "School or agency involved"
        field = "institution"
        why = "This tells USDWatch which records, policies, and jurisdiction rules may matter."
    elif "whether there is a current safety concern" in missing:
        label = "Current safety concern"
        field = "safety_risk"
        input_type = "yes_no"
        options = ["Yes, there is a current safety concern.", "No, the immediate safety concern has passed.", "I am not sure yet."]
        why = "Current safety risk changes the urgency of the plan and the next records to request."
    elif not facts.prior_actions:
        label = "What you already tried"
        field = "prior_actions"
        input_type = "multi_choice"
        options = ["Emailed school staff", "Asked for a meeting", "Requested records", "Filed a complaint", "Nothing yet"]
        why = "Prior actions keep the next step realistic and prevent USDWatch from suggesting things you already did."
    else:
        label = "Goal for the first plan"
        field = "desired_outcome"
        input_type = "single_choice"
        options = ["Request records", "Prepare for a meeting", "Document a safety concern", "Evaluate complaint options", "Find outside support"]
        why = "A clear first goal makes the packet and records plan more useful."

    cards.append(CaseIntakeQuestion(
        field=field,
        label=label,
        question=next_question,
        why=why,
        input_type=input_type,
        options=options,
        priority=1,
    ))
    return cards


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
        prefix += " One helpful next detail would make the case file stronger."
    if next_question:
        prefix += " I put one focused question below so you can answer it directly."
    return prefix


def _run_agno_analysis(session: CaseIntakeSession, model_id: str = REASONING_MODEL, context: dict | None = None) -> CaseIntakeAnalysis:
    if not settings.has_deepinfra:
        raise RuntimeError("DEEPINFRA_API_KEY is not configured")
    from agno.agent import Agent
    from agno.models.deepinfra import DeepInfra

    agent = Agent(
        name="USDWatch Case Chat Manager",
        model=DeepInfra(id=model_id, temperature=0.1, max_tokens=2500, timeout=AGNO_RUN_TIMEOUT_SECONDS),
        output_schema=CaseIntakeAnalysis,
        instructions=[
            "You are a careful parent-facing case chat manager for a private school case file.",
            "Extract only facts supported by the parent messages; leave uncertain fields blank.",
            "Ask one practical follow-up question at a time.",
            "Put the follow-up question in next_question and question_cards, not buried inside assistant_message.",
            "Return question_cards for the next question. Keep them short, concrete, and answerable by a stressed parent.",
            "Use input_type free_text unless a small set of choices would reduce friction.",
            "Question card options must be complete short sentence answers, not labels.",
            "Write a concise family_narrative_patch in the parent's plain-language voice when enough story exists.",
            "Return suggested_actions that help the parent fill case-file gaps, upload evidence, or track records.",
            "Return message_parts so the UI can render text, source-backed claims, checklists, and status boundaries.",
            "Only cite sources from the provided evidence_sources list. Do not invent document ids or facts.",
            "Return action_proposals only for useful next actions. Every action requires confirmation before execution.",
            "Use safety_flags for legal-advice boundaries, current safety urgency, missing evidence, or low confidence.",
            "Do not provide legal advice or promise outcomes.",
        ],
        markdown=False,
    )
    prompt = "\n\n".join([
        "Analyze this case conversation and return structured JSON for the case chat.",
        f"Current facts:\n{session.facts.model_dump_json()}",
        f"User overrides:\n{json.dumps(session.user_overrides)}",
        f"Case context:\n{json.dumps(context or {}, default=str)}",
        f"Conversation:\n{_conversation_text(session)}",
    ])
    response = agent.run(prompt)
    content = getattr(response, "content", response)
    if isinstance(content, CaseIntakeAnalysis):
        return content
    if isinstance(content, dict):
        return CaseIntakeAnalysis(**content)
    return CaseIntakeAnalysis.model_validate_json(str(content))


def _run_agno_analysis_with_timeout(
    session: CaseIntakeSession,
    model_id: str = REASONING_MODEL,
    context: dict | None = None,
) -> CaseIntakeAnalysis:
    timeout = max(float(AGNO_RUN_TIMEOUT_SECONDS), 0.01)
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="case-chat-agno")
    future = executor.submit(_run_agno_analysis, session, model_id, context)
    try:
        return future.result(timeout=timeout)
    except FutureTimeoutError as exc:
        future.cancel()
        raise RuntimeError(f"Case chat model timed out after {timeout:g}s") from exc
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def _case_location(facts: CaseIntakeFacts, context: dict | None) -> str:
    case_context = (context or {}).get("case", {})
    return facts.school or facts.district or case_context.get("school") or case_context.get("district") or "the school or district"


def _has_case_story(facts: CaseIntakeFacts, context: dict | None) -> bool:
    case_context = (context or {}).get("case", {})
    return bool(
        (facts.narrative or "").strip()
        or facts.district
        or facts.school
        or facts.issue_categories and facts.issue_categories != ["other"]
        or case_context.get("document_count", 0)
    )


def _first_sentence(text: str, limit: int = 360) -> str:
    text = re.sub(r"\s+", " ", (text or "").strip())
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(".,;") + "."


def _suggested_replies_for_intent(intent: str, has_story: bool, sources: list[AdvocateSource]) -> list[str]:
    if intent == "case_summary" and not has_story:
        return ["Share what happened", "Add the school or district", "Upload evidence"]
    if intent == "case_summary":
        return ["What evidence supports this?", "What gaps should I close?", "What records should I request?"]
    if intent == "evidence_question" and not sources:
        return ["Add the strongest document", "What evidence should I look for?", "Draft a records plan"]
    if intent == "evidence_question":
        return ["What does this evidence prove?", "What is still missing?", "Help me build a timeline"]
    if intent == "records_question":
        return ["What records should I request first?", "Help me draft the request", "What evidence supports this request?"]
    if intent == "legal_boundary":
        return ["Help me organize facts", "What questions should I ask a professional?", "Summarize the evidence"]
    return ["Summarize this case", "What evidence is missing?", "What should I do next?"]


def _suggested_replies_from_question_cards(cards: list[CaseIntakeQuestion]) -> list[str]:
    if not cards:
        return []
    card = cards[0]
    options = [item for item in card.options if item]
    if options:
        return options[:3]
    return []


def _chat_message_parts(message: str, sources: list[AdvocateSource], safety_flags: list[AdvocateSafetyFlag]) -> list[AdvocateMessagePart]:
    parts = [AdvocateMessagePart(type="text", text=message)]
    if sources:
        parts.append(AdvocateMessagePart(
            type="source_claim",
            title="Sources checked",
            text="I found matching evidence in this case file.",
            source_ids=[source.id for source in sources[:4]],
        ))
    if safety_flags:
        parts.append(AdvocateMessagePart(
            type="status",
            title="Boundary",
            text=safety_flags[0].detail or safety_flags[0].label,
            severity=safety_flags[0].severity,
        ))
    return parts


def _fallback_case_chat_result(
    session: CaseIntakeSession,
    context: dict | None,
    intent: str,
    *,
    model_id: str,
    error: str = "",
) -> CaseChatTurnResult:
    facts = session.facts
    latest = _latest_user_message(session)
    sources = _context_sources(context)
    safety_flags = _safety_flags_for_message(latest, facts, sources)
    has_story = _has_case_story(facts, context)
    case_context = (context or {}).get("case", {})
    title = facts.title or case_context.get("title") or "this case"
    location = _case_location(facts, context)
    categories = [item for item in (facts.issue_categories or ([facts.issue_type] if facts.issue_type else [])) if item and item != "other"]
    category_text = ", ".join(item.replace("_", " ") for item in categories) or "the concern you are documenting"
    narrative = _first_sentence(facts.narrative)

    if intent == "case_summary":
        if not has_story:
            message = (
                "I do not have enough case detail yet to summarize this case. Share a few sentences about what happened, "
                "who was involved, and what outcome you want, and I can turn it into a case summary."
            )
        else:
            details = [f"{title} is about {category_text} involving {location}."]
            if narrative:
                details.append(f"The current narrative says: {narrative}")
            if facts.desired_outcome:
                details.append(f"The parent goal is: {facts.desired_outcome}")
            doc_count = int(case_context.get("document_count") or 0)
            if doc_count:
                details.append(f"The Evidence Locker has {doc_count} file{'s' if doc_count != 1 else ''}.")
            message = " ".join(details)
    elif intent == "evidence_question":
        if sources:
            labels = ", ".join(source.label for source in sources[:3] if source.label)
            message = f"I found matching evidence in this case file: {labels}. Treat this as a source-backed starting point and open the Evidence Locker if you need to inspect the full file."
        else:
            message = (
                "I do not see matching evidence in this case yet. Add the strongest document, email, screenshot, incident note, "
                "or records response you have, and I can connect future answers to specific sources."
            )
    elif intent == "records_question":
        records = (context or {}).get("records", {})
        pending = int(records.get("pending_count") or 0)
        message = (
            f"For records, start with source documents that can confirm what happened at {location}: incident reports, emails, supervision notes, "
            "staff assignments, meeting notes, and any policy or procedure records tied to the concern."
        )
        if pending:
            message += f" I see {pending} pending or draft records request item{'s' if pending != 1 else ''} already tracked."
    elif intent == "timeline_question":
        message = (
            "I can help build a timeline from the case file. Right now, I need dated facts: when the incident happened, when you contacted the school, "
            "when the school responded, and when any records or meetings occurred."
        )
        if facts.incident_date:
            message = f"The incident date I have is {facts.incident_date}. " + message
    elif intent == "gap_question":
        missing = []
        if not (facts.district or facts.school):
            missing.append("school or district")
        if not facts.narrative:
            missing.append("plain-language narrative")
        if not (facts.desired_outcome or facts.desired_outcomes):
            missing.append("desired outcome")
        if int(case_context.get("document_count") or 0) == 0:
            missing.append("supporting evidence")
        message = "The main gaps I see are: " + ", ".join(missing) + "." if missing else "The basic case file is started. The next useful step is to connect claims to specific evidence and records."
    elif intent == "legal_boundary":
        message = (
            "I can help organize facts, evidence, timelines, records questions, and preparation notes, but I cannot give legal advice or promise outcomes. "
            "For legal strategy, filing decisions, or deadlines, use this as preparation for a qualified professional."
        )
    elif intent == "action_request":
        allowed_action_types = {"draft_records_request", "search_gmail", "import_selected_gmail", "start_case_read", "update_family_narrative"}
        actions = [action for action in _action_proposals_for_message(latest, context) if action.type in allowed_action_types]
        if actions:
            message = "I can prepare that as a proposed action. Please confirm before anything changes in the case file or connected services."
        else:
            message = "I can point you to the right workspace, but I will not move you around automatically from chat. Use the case tabs for Evidence, Records, People, Packet, or Case Plan."
    elif intent == "smalltalk":
        message = "I am here. Ask me to summarize the case, check evidence, find gaps, plan records, or help organize what happened."
    else:
        if not has_story:
            message = "I can answer case questions once there is a little case detail. Start with what happened, who was involved, and what you want changed."
        else:
            message = f"I can help with that from the case file. I currently see {category_text} involving {location}."

    if intent != "action_request":
        actions = []
    route = {
        "runtime": "agno",
        "agent": "case_chat_manager",
        "model": model_id,
        "provider": "deepinfra",
        "fallback": True,
        "error": error,
    }
    return CaseChatTurnResult(
        intent=intent,
        assistant_message=message,
        message_parts=_chat_message_parts(message, sources, safety_flags),
        sources=sources,
        suggested_replies=_suggested_replies_for_intent(intent, has_story, sources),
        case_update_proposals=[],
        action_proposals=actions[:3],
        safety_flags=safety_flags,
        model_route=route,
        trace_id=f"chat-{session.id}-{utc_now().strftime('%Y%m%d%H%M%S')}",
    )


def _local_case_file_chat_result(
    session: CaseIntakeSession,
    context: dict | None,
    intent: str,
    *,
    error: str = "",
    fallback: bool = False,
) -> CaseChatTurnResult:
    result = _fallback_case_chat_result(
        session,
        context,
        intent,
        model_id=LOCAL_CASE_FILE_MODEL,
        error=error,
    )
    result.model_route = {
        "runtime": "local_case_file",
        "agent": "case_chat_manager",
        "model": LOCAL_CASE_FILE_MODEL,
        "provider": "local_case_file",
        "fallback": fallback,
        "error": error,
    }
    return result


def _should_use_local_case_file_chat(intent: str, context: dict | None) -> bool:
    if intent in LOCAL_CASE_FILE_INTENTS:
        return True
    return not settings.has_deepinfra


def _normalize_case_chat_result(
    result: CaseChatTurnResult,
    session: CaseIntakeSession,
    context: dict | None,
    *,
    intent: str,
    fallback: bool,
    model_id: str,
    error: str = "",
) -> CaseChatTurnResult:
    allowed_sources = {source.id: source for source in _context_sources(context)}
    result.sources = [allowed_sources[source.id] for source in result.sources if source.id in allowed_sources]
    if not result.assistant_message:
        fallback_result = _fallback_case_chat_result(session, context, intent, model_id=model_id, error=error)
        result.assistant_message = fallback_result.assistant_message
    result.intent = intent
    result.case_update_proposals = []
    allowed_action_types = {"draft_records_request", "search_gmail", "import_selected_gmail", "start_case_read", "update_family_narrative"}
    normalized_actions: list[AdvocateActionProposal] = []
    for action in result.action_proposals:
        if action.type not in allowed_action_types:
            continue
        action.requires_confirmation = True
        if action.status not in {"approved", "rejected", "expired"}:
            action.status = "pending"
        normalized_actions.append(action)
    result.action_proposals = normalized_actions[:3]
    if not result.suggested_replies:
        result.suggested_replies = _suggested_replies_for_intent(intent, _has_case_story(session.facts, context), result.sources)
    if not result.message_parts:
        result.message_parts = _chat_message_parts(result.assistant_message, result.sources, result.safety_flags)
    result.model_route = {
        "runtime": "agno",
        "agent": "case_chat_manager",
        "model": model_id,
        "provider": "deepinfra",
        "fallback": fallback,
        "error": error,
    }
    result.trace_id = result.trace_id or f"chat-{session.id}-{utc_now().strftime('%Y%m%d%H%M%S')}"
    return result


def _run_case_chat_agno_analysis(session: CaseIntakeSession, model_id: str = REASONING_MODEL, context: dict | None = None) -> CaseChatTurnResult:
    if not settings.has_deepinfra:
        raise RuntimeError("DEEPINFRA_API_KEY is not configured")
    from agno.agent import Agent
    from agno.models.deepinfra import DeepInfra

    agent = Agent(
        name="USDWatch Case Chat Manager",
        model=DeepInfra(id=model_id, temperature=0.1, max_tokens=1800, timeout=AGNO_RUN_TIMEOUT_SECONDS),
        output_schema=CaseChatTurnResult,
        instructions=[
            "You are USDWatch Chat, a careful case-aware assistant for parents organizing a private school case file.",
            "Answer the user's direct question first. Do not force an intake question every turn.",
            "Only use facts from the current case facts, conversation, and provided evidence_sources.",
            "Only cite sources from evidence_sources. Do not invent document ids, quotations, or evidence.",
            "Do not update case facts directly. Return case_update_proposals only when the user explicitly asks to update the case.",
            "Return action_proposals only for side effects that require confirmation: records drafts, Gmail search or import, Case Read, or narrative update.",
            "Do not return navigation actions for opening app sections. Mention the existing tab instead.",
            "Keep suggested_replies optional and short.",
            "Maintain legal-advice boundaries and never promise outcomes.",
        ],
        markdown=False,
    )
    prompt = "\n\n".join([
        "Return structured JSON for one USDWatch case chat turn.",
        f"Intent:\n{(context or {}).get('intent', 'case_question')}",
        f"Current facts:\n{session.facts.model_dump_json()}",
        f"Case context:\n{json.dumps(context or {}, default=str)}",
        f"Conversation:\n{_conversation_text(session)}",
    ])
    response = agent.run(prompt)
    content = getattr(response, "content", response)
    if isinstance(content, CaseChatTurnResult):
        return content
    if isinstance(content, dict):
        return CaseChatTurnResult(**content)
    return CaseChatTurnResult.model_validate_json(str(content))


def _run_case_chat_agno_analysis_with_timeout(
    session: CaseIntakeSession,
    model_id: str = REASONING_MODEL,
    context: dict | None = None,
) -> CaseChatTurnResult:
    timeout = max(float(AGNO_RUN_TIMEOUT_SECONDS), 0.01)
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="case-chat-manager")
    future = executor.submit(_run_case_chat_agno_analysis, session, model_id, context)
    try:
        return future.result(timeout=timeout)
    except FutureTimeoutError as exc:
        future.cancel()
        raise CaseChatModelTimeout(f"Case chat model timed out after {timeout:g}s") from exc
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def _store_case_chat_result(session: CaseIntakeSession, result: CaseChatTurnResult, run: AgentRun) -> CaseIntakeSession:
    session.messages.append(CaseIntakeMessage(
        role="assistant",
        content=result.assistant_message,
        structured={
            "intent": result.intent,
            "message_parts": [part.model_dump(mode="json") for part in result.message_parts],
            "sources": [source.model_dump(mode="json") for source in result.sources],
            "suggested_replies": result.suggested_replies,
            "case_update_proposals": [proposal.model_dump(mode="json") for proposal in result.case_update_proposals],
            "action_proposals": [action.model_dump(mode="json") for action in result.action_proposals],
            "safety_flags": [flag.model_dump(mode="json") for flag in result.safety_flags],
            "model_route": result.model_route,
            "trace_id": result.trace_id,
            "agent_run_ids": [run.id],
            "question_cards": [],
            "next_question": "",
        },
    ))
    session.updated_at = utc_now()
    run.output_tokens = len((result.assistant_message or "").split())
    return session


def analyze_case_chat_session(session: CaseIntakeSession, context: dict | None = None) -> CaseIntakeSession:
    context = context or {}
    intent = context.get("intent") or classify_case_chat_intent(_latest_user_message(session), context.get("intent_hint", ""))
    if intent == "intake_answer":
        session = analyze_intake_session(session, context={**context, "intent": intent})
        latest = session.messages[-1] if session.messages else None
        if latest and latest.structured:
            cards = [CaseIntakeQuestion(**card) for card in latest.structured.get("question_cards", [])]
            latest.structured = {
                **latest.structured,
                "intent": intent,
                "suggested_replies": _suggested_replies_from_question_cards(cards),
                "case_update_proposals": [],
            }
        return session

    if _should_use_local_case_file_chat(intent, context):
        run = AgentRun(
            workspace_id=session.workspace_id,
            case_id=session.draft_case_id or session.case_id or "case-chat",
            evaluation_id=session.id,
            agent_id="case_chat_manager",
            status="complete",
            model_id=LOCAL_CASE_FILE_MODEL,
        )
        agent_runs[run.id] = run
        try:
            result = _local_case_file_chat_result(session, context, intent)
            return _store_case_chat_result(session, result, run)
        finally:
            run.completed_at = utc_now()
            agent_runs[run.id] = run

    run = AgentRun(
        workspace_id=session.workspace_id,
        case_id=session.draft_case_id or session.case_id or "case-chat",
        evaluation_id=session.id,
        agent_id="case_chat_manager",
        status="running",
        model_id=REASONING_MODEL,
    )
    agent_runs[run.id] = run
    try:
        try:
            result = _run_case_chat_agno_analysis_with_timeout(session, REASONING_MODEL, {**context, "intent": intent})
            run.status = "complete"
            result = _normalize_case_chat_result(
                result,
                session,
                context,
                intent=intent,
                fallback=False,
                model_id=run.model_id,
                error=run.error or "",
            )
        except Exception as exc:
            run.status = "fallback"
            run.error = str(exc)
            result = _local_case_file_chat_result(
                session,
                context,
                intent,
                error=str(exc),
                fallback=True,
            )
        return _store_case_chat_result(session, result, run)
    finally:
        run.completed_at = utc_now()
        agent_runs[run.id] = run


def analyze_intake_session(session: CaseIntakeSession, context: dict | None = None) -> CaseIntakeSession:
    run = AgentRun(
        workspace_id=session.workspace_id,
        case_id=session.draft_case_id or "intake",
        evaluation_id=session.id,
        agent_id="case_advocate_manager",
        status="running",
        model_id=REASONING_MODEL,
    )
    agent_runs[run.id] = run
    try:
        try:
            try:
                analysis = _run_agno_analysis_with_timeout(session, REASONING_MODEL, context)
            except Exception as primary_exc:
                if REASONING_MODEL == FALLBACK_MODEL or not settings.has_deepinfra:
                    raise
                run.model_id = FALLBACK_MODEL
                run.status = "fallback_model"
                run.error = f"Primary model {REASONING_MODEL} failed: {primary_exc}"
                analysis = _run_agno_analysis_with_timeout(session, FALLBACK_MODEL, context)
            if run.status != "fallback_model":
                run.status = "complete"
            analysis = _normalize_manager_output(
                analysis,
                session,
                context,
                fallback=run.status == "fallback_model",
                model_id=run.model_id,
                error=run.error or "",
            )
        except Exception as exc:
            analysis = _heuristic_analysis(session, context)
            run.status = "fallback"
            run.error = str(exc)
            analysis = _normalize_manager_output(
                analysis,
                session,
                context,
                fallback=True,
                model_id=run.model_id or REASONING_MODEL,
                error=str(exc),
            )

        session.facts = _merge_facts(session.facts, analysis.facts, session.user_overrides)
        session.confidence = {**session.confidence, **analysis.confidence}
        session.missing_fields = analysis.missing_fields
        session.issue_tags = analysis.issue_tags
        session.next_question = analysis.next_question
        analysis.agent_run_ids = [run.id]
        if analysis.assistant_message:
            session.messages.append(CaseIntakeMessage(
                role="assistant",
                content=analysis.assistant_message,
                structured={
                    "facts_patch": analysis.facts.model_dump(mode="json"),
                    "family_narrative_patch": analysis.family_narrative_patch,
                    "missing_facts": analysis.missing_fields,
                    "next_question": analysis.next_question,
                    "question_cards": [card.model_dump(mode="json") for card in analysis.question_cards],
                    "suggested_actions": analysis.suggested_actions,
                    "route_suggestion": analysis.route_suggestion,
                    "confidence": analysis.confidence,
                    "agent_run_ids": analysis.agent_run_ids,
                    "message_parts": [part.model_dump(mode="json") for part in analysis.message_parts],
                    "sources": [source.model_dump(mode="json") for source in analysis.sources],
                    "action_proposals": [action.model_dump(mode="json") for action in analysis.action_proposals],
                    "safety_flags": [flag.model_dump(mode="json") for flag in analysis.safety_flags],
                    "model_route": analysis.model_route,
                    "trace_id": analysis.trace_id,
                },
            ))
        session.updated_at = utc_now()
        run.output_tokens = len((analysis.assistant_message or "").split())
        return session
    finally:
        run.completed_at = utc_now()
        agent_runs[run.id] = run
