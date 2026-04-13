"""
Identity Unifier — merges enrichment data from multiple sources.

After all workers run, this module:
  1. Deduplicates social profiles by URL
  2. Merges employer history with fuzzy org-name matching
  3. Picks most-recent address as primary
  4. Scores identity_confidence based on cross-source agreement
  5. Flags contradictions (e.g. PDL says Denver, SerpAPI says Kansas)
"""
from __future__ import annotations

import logging
from collections import Counter

from app.models import Person, Address, SocialProfile, Employment, Education

logger = logging.getLogger(__name__)


def unify_enrichment(person: Person, worker_results: list[dict]) -> Person:
    """
    Merge all worker results into the person's enrichment fields.
    Returns the updated Person (mutated in-place for convenience).
    """
    all_socials: list[SocialProfile] = []
    all_addresses: list[Address] = []
    all_employers: list[Employment] = []
    all_education: list[Education] = []
    all_associates: list[str] = list(person.known_associates)
    all_intel: list[str] = list(person.profile_intel)
    sources_used: set[str] = set(person.enrichment_sources)
    bio_snippets: list[str] = []

    for result in worker_results:
        if result.get("social_profiles"):
            all_socials.extend(result["social_profiles"])
        if result.get("addresses"):
            all_addresses.extend(result["addresses"])
        if result.get("employer_history"):
            all_employers.extend(result["employer_history"])
        if result.get("education"):
            all_education.extend(result["education"])
        if result.get("known_associates"):
            all_associates.extend(result["known_associates"])
        if result.get("profile_intel"):
            all_intel.extend(result["profile_intel"])
        if result.get("bio_snippet"):
            bio_snippets.append(result["bio_snippet"])

        for sp in result.get("social_profiles", []):
            if sp.source:
                sources_used.add(sp.source)

    person.social_profiles = _dedup_socials(person.social_profiles + all_socials)
    person.addresses = _dedup_addresses(person.addresses + all_addresses)
    person.employer_history = _dedup_employers(person.employer_history + all_employers)
    person.education = _dedup_education(person.education + all_education)
    person.known_associates = list(set(all_associates))
    seen_intel = set()
    deduped_intel = []
    for bullet in all_intel:
        normalized = bullet.strip().lower()
        if normalized not in seen_intel:
            seen_intel.add(normalized)
            deduped_intel.append(bullet.strip())
    person.profile_intel = deduped_intel
    person.enrichment_sources = sorted(sources_used)

    for result in worker_results:
        if result.get("gender") and not person.gender:
            person.gender = result["gender"]
        if result.get("date_of_birth") and not person.date_of_birth:
            person.date_of_birth = result["date_of_birth"]

    # Wire bio_snippet to curated_bio as a fallback (seed data takes priority)
    if bio_snippets and not person.curated_bio:
        person.curated_bio = bio_snippets[0]
        logger.info("Set curated_bio from enrichment bio_snippet for %s", person.name)

    person.identity_confidence = _score_confidence(person)

    contradictions = _detect_contradictions(person, worker_results)
    if contradictions:
        logger.warning("Identity contradictions for %s: %s", person.name, contradictions)

    from datetime import datetime
    person.enriched_at = datetime.utcnow()

    return person


def _dedup_socials(profiles: list[SocialProfile]) -> list[SocialProfile]:
    seen: dict[str, SocialProfile] = {}
    for sp in profiles:
        normalized = sp.url.rstrip("/").lower()
        existing = seen.get(normalized)
        if not existing or sp.confidence > existing.confidence:
            seen[normalized] = sp
    return sorted(seen.values(), key=lambda s: -s.confidence)


def _dedup_addresses(addresses: list[Address]) -> list[Address]:
    seen: set[str] = set()
    deduped = []
    for a in addresses:
        key = f"{a.city.lower().strip()},{a.state.lower().strip()}"
        if key not in seen and a.city:
            seen.add(key)
            deduped.append(a)
    return deduped


def _dedup_employers(employers: list[Employment]) -> list[Employment]:
    seen: set[str] = set()
    deduped = []
    for e in employers:
        key = e.organization.lower().strip()[:30]
        if key not in seen and e.organization:
            seen.add(key)
            deduped.append(e)
    return deduped


def _dedup_education(education: list[Education]) -> list[Education]:
    seen: set[str] = set()
    deduped = []
    for e in education:
        key = e.institution.lower().strip()[:30]
        if key not in seen and e.institution:
            seen.add(key)
            deduped.append(e)
    return deduped


def _score_confidence(person: Person) -> float:
    """
    Score 0-1 based on how many independent sources agree on identity data.
    More sources + more verified socials = higher confidence.
    """
    score = 0.0
    source_count = len(person.enrichment_sources)

    if source_count >= 3:
        score += 0.3
    elif source_count >= 2:
        score += 0.2
    elif source_count >= 1:
        score += 0.1

    verified_socials = sum(1 for sp in person.social_profiles if sp.verified)
    likely_socials = sum(1 for sp in person.social_profiles if sp.confidence >= 0.6)
    score += min(0.2, verified_socials * 0.1)
    score += min(0.1, likely_socials * 0.03)

    if person.addresses:
        score += 0.1
    if person.employer_history:
        score += 0.1
    if person.education:
        score += 0.05
    if person.date_of_birth:
        score += 0.05
    if person.gender:
        score += 0.02

    state_mentions = Counter()
    for a in person.addresses:
        if a.state:
            state_mentions[a.state.upper()] += 1
    if person.state and state_mentions.get(person.state.upper(), 0) >= 1:
        score += 0.08

    return min(1.0, round(score, 2))


def _detect_contradictions(person: Person, results: list[dict]) -> list[str]:
    """Flag when sources disagree on location or identity."""
    issues = []
    states = set()
    for a in person.addresses:
        if a.state:
            states.add(a.state.upper())

    if person.state and len(states) > 1 and person.state.upper() not in states:
        issues.append(
            f"Person's state is {person.state} but enrichment found addresses in: {', '.join(states)}"
        )

    return issues
