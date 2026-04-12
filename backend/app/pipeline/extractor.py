"""
FactExtractor — pulls structured facts from raw search findings.

Takes a raw document/page text and the person's name, returns MULTIPLE
typed facts — a single school board minutes page may contain 10+ facts.

Also extracts contact and social media information when found.
"""
from __future__ import annotations

import dspy


class ExtractFacts(dspy.Signature):
    """Extract ALL facts about a specific person from a document.

    Look for: public statements, votes, policy positions, actions taken,
    organizational relationships, direct quotes, biographical details,
    election information, and anything that reveals accountability or
    contradictions. Return every distinct fact you can find.

    CRITICAL date rules:
    - NEVER use relative dates like "last week", "on Monday", "yesterday", "recently".
    - ALWAYS convert to absolute dates (e.g. "April 5, 2021", "September 2024").
    - Use the article's publication date or any dates in the text to resolve relative references.
    - If you truly cannot determine any date, use "unknown".
    """

    document_text: str = dspy.InputField(desc="Full text from a web page or document")
    person_name: str = dspy.InputField()
    source_date_hint: str = dspy.InputField(
        desc="Approximate date of the source document if known (e.g. from URL or article text), else 'unknown'"
    )

    facts: list[dict] = dspy.OutputField(
        desc=(
            "List of facts found. Each dict has keys: "
            "'category' (statement|vote|position|action|relationship|quote|bio|contact), "
            "'content' (the fact stated clearly — rewrite relative time references as absolute dates), "
            "'date' (ABSOLUTE date like 'April 5, 2021' or 'September 2024' — NEVER 'last week'/'Monday'/etc — use 'unknown' only as last resort), "
            "'confidence' (0.0-1.0 based on source quality)"
        )
    )


class ExtractContact(dspy.Signature):
    """Extract contact information and social media profiles for a person from document text.

    Look for: email addresses, phone numbers, office addresses,
    LinkedIn URLs, Twitter/X handles, Facebook pages, and any other
    public contact or social media information.
    """

    document_text: str = dspy.InputField(desc="Full text from a web page or document")
    person_name: str = dspy.InputField()

    contact_info: dict = dspy.OutputField(
        desc=(
            "Dict with optional keys: "
            "'email' (string or null), "
            "'phone' (string or null), "
            "'address' (string or null), "
            "'linkedin_url' (string or null), "
            "'twitter_handle' (string or null), "
            "'facebook_url' (string or null), "
            "'other_urls' (list of strings). "
            "Only include fields where actual data was found."
        )
    )


class FactExtractor(dspy.Module):
    """Extracts multiple structured facts from a single document."""

    def __init__(self):
        self.extract = dspy.ChainOfThought(ExtractFacts)
        self.extract_contact = dspy.Predict(ExtractContact)

    def forward(self, document_text: str, person_name: str,
                source_date_hint: str = "unknown") -> dspy.Prediction:
        return self.extract(
            document_text=document_text,
            person_name=person_name,
            source_date_hint=source_date_hint,
        )

    def extract_contact_info(self, document_text: str, person_name: str) -> dict:
        try:
            result = self.extract_contact(
                document_text=document_text,
                person_name=person_name,
            )
            return result.contact_info or {}
        except Exception:
            return {}
