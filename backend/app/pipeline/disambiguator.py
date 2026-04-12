"""
Disambiguator — identity verification for research pipeline.

Solves the "wrong person" problem: when you search for "Will Crowley USD 232",
search engines return results for EVERY Will Crowley. This module gates
documents and facts, ensuring only data about the TARGET person survives.

Two levels of checking:
  1. Document-level: "Is this document about our person?"
  2. Fact-level: "Is this specific fact about our person?"
"""
from __future__ import annotations

import json
import logging
from urllib.parse import urlparse

import dspy

from app.models import IdentityAnchor

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# DSPy Signatures
# ---------------------------------------------------------------------------

class CheckDocumentIdentity(dspy.Signature):
    """Determine if a document is about the specific person we're researching,
    or about a different person who shares the same name.

    Consider: geographic location, organization, role, time period, known
    associates, and any other contextual clues. Err on the side of REJECTING
    ambiguous documents rather than including wrong-person data.

    If the identity_anchor includes negative_anchors (traits of KNOWN DIFFERENT
    people with the same name), actively check whether the document matches
    any of those — if so, reject immediately.
    """
    document_text: str = dspy.InputField(desc="First 2000 chars of the document")
    person_name: str = dspy.InputField()
    identity_anchor: str = dspy.InputField(
        desc="JSON of known facts: organization, role, state, city, known_associates, known_events, negative_anchors"
    )

    is_same_person: bool = dspy.OutputField(
        desc="True ONLY if the document clearly refers to the target person. False if ambiguous or different person."
    )
    confidence: float = dspy.OutputField(desc="0.0-1.0")
    reasoning: str = dspy.OutputField(
        desc="Cite specific clues: matching org names, locations, roles, or contradicting details."
    )


class VerifyFactIdentity(dspy.Signature):
    """Verify that a specific extracted fact is about the target person,
    not someone else mentioned in the same document.

    A school board minutes document may mention 20 people. Make sure this
    fact actually describes our target, not a bystander.
    """
    fact_content: str = dspy.InputField()
    fact_category: str = dspy.InputField()
    person_name: str = dspy.InputField()
    document_excerpt: str = dspy.InputField(desc="~500 chars surrounding where this fact was found")
    identity_anchor: str = dspy.InputField()

    is_about_target: bool = dspy.OutputField()
    confidence: float = dspy.OutputField(desc="0.0-1.0")


# ---------------------------------------------------------------------------
# Module
# ---------------------------------------------------------------------------

class Disambiguator(dspy.Module):
    """Identity verification gate for the research pipeline."""

    def __init__(self):
        self.check_doc = dspy.ChainOfThought(CheckDocumentIdentity)
        self.check_fact = dspy.Predict(VerifyFactIdentity)

    def check_document(
        self,
        document_text: str,
        person_name: str,
        anchor: IdentityAnchor,
        source_url: str = "",
    ) -> tuple[bool, float, str]:
        """Check if a document is about the target person.

        Returns (is_same_person, confidence, reasoning).
        Skips the LLM call for trusted domains (the org's own website).
        """
        if _is_trusted_domain(source_url, anchor.organization):
            logger.info("  Trusted domain %s — skipping identity check", urlparse(source_url).netloc)
            return True, 0.95, "Trusted organizational domain"

        anchor_json = anchor.model_dump_json()
        text_preview = document_text[:2000]

        try:
            result = self.check_doc(
                document_text=text_preview,
                person_name=person_name,
                identity_anchor=anchor_json,
            )
            is_same = bool(result.is_same_person)
            conf = float(result.confidence)
            reasoning = str(result.reasoning)

            logger.info(
                "  Identity check: %s (%.2f) — %s",
                "ACCEPT" if is_same else "REJECT",
                conf,
                reasoning[:120],
            )
            return is_same, conf, reasoning
        except Exception as e:
            logger.warning("  Identity check failed (allowing document): %s", e)
            return True, 0.5, f"Check failed: {e}"

    def verify_fact(
        self,
        fact_content: str,
        fact_category: str,
        person_name: str,
        document_excerpt: str,
        anchor: IdentityAnchor,
    ) -> tuple[bool, float]:
        """Verify a specific fact is about the target person.

        Returns (is_about_target, confidence).
        """
        try:
            result = self.check_fact(
                fact_content=fact_content,
                fact_category=fact_category,
                person_name=person_name,
                document_excerpt=document_excerpt[:500],
                identity_anchor=anchor.model_dump_json(),
            )
            return bool(result.is_about_target), float(result.confidence)
        except Exception as e:
            logger.warning("  Fact identity check failed: %s", e)
            return True, 0.5


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ORG_DOMAIN_HINTS = {
    "usd 232": ["usd232.org"],
    "usd232": ["usd232.org"],
    "jcprd": ["jcprd.com"],
    "kansas state board of education": ["ksde.org"],
}


def _is_trusted_domain(url: str, organization: str) -> bool:
    """Check if a URL belongs to the target organization's own domain."""
    if not url:
        return False
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False

    org_lower = organization.lower().strip()
    for org_key, domains in _ORG_DOMAIN_HINTS.items():
        if org_key in org_lower:
            if any(d in host for d in domains):
                return True

    org_slug = org_lower.replace(" ", "").replace("-", "")
    host_slug = host.replace("www.", "").replace("-", "").replace(".", "")
    if org_slug and org_slug in host_slug:
        return True

    return False


def build_anchor_from_request(
    name: str,
    role: str,
    organization: str,
    state: str,
    context: str,
    existing_person: object | None = None,
) -> IdentityAnchor:
    """Build an IdentityAnchor from a PersonCreate request and optional existing data."""
    anchor = IdentityAnchor(
        name=name,
        organization=organization,
        role=role,
        state=state,
    )

    if context:
        anchor.known_events.append(context[:300])

    if existing_person:
        if hasattr(existing_person, "negative_anchors"):
            anchor.negative_anchors = list(existing_person.negative_anchors)
        if hasattr(existing_person, "curated_bio") and existing_person.curated_bio:
            anchor.known_events.append(existing_person.curated_bio[:200])
        if hasattr(existing_person, "entity_ids"):
            pass

    return anchor
