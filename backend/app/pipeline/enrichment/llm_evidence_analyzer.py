"""
LLM-powered evidence analyzer — extracts structured profile data from
case evidence documents using a lightweight LLM.

Replaces dumb regex-only extraction with contextual understanding:
- Resolves name variants (Will = William, Bre = BreAnna)
- Interprets email signatures and header blocks
- Extracts structured contact info, role, bio, and relationships
- Validates regex-extracted candidates against document context

Uses the cheap COLLECT_MODEL (gemini-2.5-flash-lite) since this is a
focused extraction task, not deep reasoning.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import dspy

from app.config import settings

logger = logging.getLogger(__name__)


class ExtractPersonProfile(dspy.Signature):
    """Extract structured profile information about a specific person from
    case evidence documents (emails, memos, reports).

    The documents may mention many people. Extract ONLY information about
    the target person identified by person_name, role, and organization.

    Name variants are common: "Will" and "William" are the same person,
    "Bre" and "BreAnna" are the same person, etc. Use context clues
    (organization, role, email domain) to confirm identity.

    Return valid JSON with these fields:
    - email: the person's most likely email address (null if not found)
    - phone: their phone number with area code (null if not found)
    - role_title: their exact job title as stated in the evidence
    - bio_summary: 2-3 sentence factual summary based ONLY on evidence
    - related_people: list of {name, email, relationship} for people they
      interact with in the evidence
    - confidence: 0.0-1.0 how confident you are the extracted data belongs
      to the target person specifically
    """
    person_name: str = dspy.InputField(desc="Full name of the target person")
    person_role: str = dspy.InputField(desc="Known role/title")
    person_org: str = dspy.InputField(desc="Known organization")
    person_location: str = dspy.InputField(desc="Known city/state")
    document_texts: str = dspy.InputField(
        desc="Concatenated evidence document texts, separated by ---DOC---"
    )
    regex_candidates: str = dspy.InputField(
        desc="JSON of regex-extracted candidates: {emails: [], phones: []}"
    )

    extracted_json: str = dspy.OutputField(
        desc='Valid JSON: {"email", "phone", "role_title", "bio_summary", "related_people": [{"name", "email", "relationship"}], "confidence"}'
    )


_module: dspy.Module | None = None


def _get_module() -> dspy.Module:
    global _module
    if _module is not None:
        return _module

    lm = dspy.LM(settings.collect_model, max_tokens=1024, temperature=0.1)
    _module = dspy.Predict(ExtractPersonProfile)
    dspy.configure(lm=lm)
    return _module


def analyze_evidence(
    person_name: str,
    person_role: str,
    person_org: str,
    person_location: str,
    doc_texts: list[str],
    candidate_emails: list[str],
    candidate_phones: list[str],
) -> dict[str, Any]:
    """
    Run the LLM evidence analyzer on a set of documents.

    Returns parsed structured data or an empty fallback dict on failure.
    """
    if not doc_texts:
        return _empty_result()

    combined_text = "\n---DOC---\n".join(
        t[:3000] for t in doc_texts[:8]
    )

    if len(combined_text) > 12000:
        combined_text = combined_text[:12000]

    regex_data = json.dumps({
        "emails": list(set(candidate_emails))[:10],
        "phones": list(set(candidate_phones))[:10],
    })

    try:
        module = _get_module()
        result = module(
            person_name=person_name,
            person_role=person_role,
            person_org=person_org,
            person_location=person_location,
            document_texts=combined_text,
            regex_candidates=regex_data,
        )

        raw = result.extracted_json
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0]

        parsed = json.loads(raw)

        logger.info(
            "LLM evidence analyzer for %s: email=%s, phone=%s, confidence=%.2f",
            person_name,
            parsed.get("email"),
            parsed.get("phone"),
            parsed.get("confidence", 0),
        )
        return parsed

    except json.JSONDecodeError as e:
        logger.warning("LLM evidence analyzer returned invalid JSON: %s", e)
        return _empty_result()
    except Exception as e:
        logger.warning("LLM evidence analyzer failed (non-fatal): %s", e)
        return _empty_result()


def _empty_result() -> dict[str, Any]:
    return {
        "email": None,
        "phone": None,
        "role_title": None,
        "bio_summary": None,
        "related_people": [],
        "confidence": 0.0,
    }
