"""
Internal evidence search worker — Step 0 of the enrichment pipeline.

Searches Qdrant for documents already stored about a person (case evidence,
prior enrichment results, research web scrapes). Extracts contact info and
bio snippets from matching docs. Free and instant — runs before any external
API calls so we maximize data we already have.
"""
from __future__ import annotations

import logging
from typing import Any

from app.models import Person

logger = logging.getLogger(__name__)


def enrich_from_internal(person: Person) -> dict[str, Any]:
    """
    Search our own vector store for evidence related to this person.

    1. Filter-based search: all docs tagged with this person's ID
    2. Semantic search: person name + org + role as query text
    3. LLM analysis: pass doc texts through LLM for smart extraction

    Returns a dict compatible with the unifier merge format:
    {email, phone, social_profiles, addresses, bio_snippet, doc_count}
    """
    from app.services.qdrant_client import search_by_person, search_semantic
    from app.pipeline.enrichment.contact_extractor import (
        extract_emails,
        extract_phones,
        extract_name_email_pairs,
        names_match,
    )

    result: dict[str, Any] = {
        "email": None,
        "phone": None,
        "social_profiles": [],
        "addresses": [],
        "bio_snippet": None,
        "doc_count": 0,
        "source": "internal_evidence",
    }

    all_docs: list[dict] = []

    tagged_docs = search_by_person(person.id)
    all_docs.extend(tagged_docs)
    logger.info("Internal search: %d docs tagged for %s", len(tagged_docs), person.id)

    query = f"{person.name} {person.organization} {person.role}".strip()
    if query:
        semantic_docs = search_semantic(query, person_id=None, limit=10)
        seen_ids = {d.get("doc_id") for d in all_docs if d.get("doc_id")}
        for doc in semantic_docs:
            if doc.get("doc_id") and doc["doc_id"] not in seen_ids:
                all_docs.append(doc)
                seen_ids.add(doc["doc_id"])
        logger.info("Internal search: +%d semantic matches for '%s'", len(semantic_docs), query[:60])

    result["doc_count"] = len(all_docs)

    if not all_docs:
        return result

    candidate_emails: list[str] = []
    candidate_phones: list[str] = []
    bio_chunks: list[str] = []
    person_name_lower = person.name.lower()

    for doc in all_docs:
        text = doc.get("full_text") or doc.get("text_preview") or ""
        if not text:
            continue

        for raw_name, email in extract_name_email_pairs(text):
            clean = raw_name.strip().strip('*"\'').lower()
            if names_match(clean, person_name_lower):
                candidate_emails.append(email.lower())

        emails_standalone = extract_emails(text)
        for em in emails_standalone:
            parts = person_name_lower.split()
            if any(part in em.lower() for part in parts if len(part) > 2):
                candidate_emails.append(em.lower())

        phones = extract_phones(text)
        text_lower = text.lower()
        for phone in phones:
            phone_idx = text_lower.find(phone.replace("-", "").replace(".", ""))
            if phone_idx == -1:
                phone_idx = text_lower.find(phone)
            if phone_idx >= 0:
                nearby = text_lower[max(0, phone_idx - 200):phone_idx]
                if person_name_lower in nearby or any(
                    part in nearby for part in person_name_lower.split() if len(part) > 2
                ):
                    candidate_phones.append(phone)

        summary = doc.get("summary", "")
        if summary and person_name_lower in summary.lower():
            bio_chunks.append(summary)

    # --- Phase 2: LLM analysis for smarter extraction ---
    doc_texts = [
        doc.get("full_text") or doc.get("text_preview") or ""
        for doc in all_docs if doc.get("full_text") or doc.get("text_preview")
    ]

    llm_result = None
    if doc_texts:
        try:
            from app.pipeline.enrichment.llm_evidence_analyzer import analyze_evidence
            llm_result = analyze_evidence(
                person_name=person.name,
                person_role=person.role or "",
                person_org=person.organization or "",
                person_location=f"{person.city or ''}, {person.state or ''}".strip(", "),
                doc_texts=doc_texts,
                candidate_emails=candidate_emails,
                candidate_phones=candidate_phones,
            )
            logger.info(
                "LLM evidence analysis for %s: email=%s, phone=%s, confidence=%.2f",
                person.name,
                llm_result.get("email"),
                llm_result.get("phone"),
                llm_result.get("confidence", 0),
            )
        except Exception as e:
            logger.warning("LLM evidence analysis failed, falling back to regex: %s", e)

    # --- Phase 3: Merge regex + LLM results (LLM takes priority) ---
    if llm_result and llm_result.get("confidence", 0) >= 0.5:
        if llm_result.get("email") and not (person.contact and person.contact.email):
            result["email"] = llm_result["email"].lower()
        if llm_result.get("phone") and not (person.contact and person.contact.phone):
            result["phone"] = llm_result["phone"]
        if llm_result.get("bio_summary"):
            result["bio_snippet"] = llm_result["bio_summary"]
        if llm_result.get("role_title"):
            result["role_title"] = llm_result["role_title"]
        if llm_result.get("related_people"):
            result["related_people"] = llm_result["related_people"]
    else:
        # Fall back to regex-only results
        if candidate_emails and not (person.contact and person.contact.email):
            from collections import Counter
            email_counts = Counter(candidate_emails)
            result["email"] = email_counts.most_common(1)[0][0]
        if candidate_phones and not (person.contact and person.contact.phone):
            from collections import Counter
            phone_counts = Counter(candidate_phones)
            result["phone"] = phone_counts.most_common(1)[0][0]
        if bio_chunks:
            result["bio_snippet"] = " | ".join(bio_chunks[:3])

    if result["email"]:
        logger.info("Internal search: final email %s for %s", result["email"], person.name)
    if result["phone"]:
        logger.info("Internal search: final phone %s for %s", result["phone"], person.name)

    return result


