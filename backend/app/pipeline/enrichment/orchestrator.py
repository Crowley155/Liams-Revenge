"""
Enrichment orchestrator — Phase 0: IDENTIFY.

Runs all enrichment workers in sequence, starting with our own internal
evidence before hitting external APIs. Discovered social profiles land as
"pending" — the user confirms/dismisses each one via separate endpoints,
which triggers per-profile scraping and data extraction.

Flow:
  0. Internal evidence search → contact info + bio from our own data (free)
  1. SerpAPI Knowledge Graph → social links + bio
  2. Clay webhook (async) or PDL (fallback) → structured identity data
  3. Maigret OSINT → extra social profiles from discovered usernames
  4. Unify → merge, deduplicate, score confidence
"""
from __future__ import annotations

from app.time import utc_now

import logging
from datetime import datetime

from app.models import Person, ResearchJob, JobStatus
from app.api._store import profiles, jobs

logger = logging.getLogger(__name__)


def _has_clay_worthy_data(person: Person) -> bool:
    """
    Only fire the Clay webhook if we have enough anchor data to get
    a meaningful (and correct) result. Avoids burning credits on
    ambiguous queries that return the wrong person.
    """
    has_linkedin = any(
        sp.platform == "linkedin" and sp.url for sp in person.social_profiles
    )
    if has_linkedin:
        return True

    has_email = bool(
        person.contact and person.contact.email
    ) or any("@" in a for a in person.known_associates)
    if has_email:
        return True

    has_org_and_location = bool(person.organization) and bool(person.city or person.state)
    if has_org_and_location:
        return True

    return False


def run_enrichment_pipeline(person: Person, job: ResearchJob) -> Person:
    """
    Execute all enrichment workers and unify results.
    Updates job status as it progresses.
    """
    job.status = JobStatus.ENRICHING
    job.started_at = utc_now()
    jobs[job.id] = job

    worker_results: list[dict] = []

    # --- Worker 0: Internal evidence search (free, instant) ---
    logger.info("Enrichment Phase 0.0: Internal evidence search for %s", person.name)
    try:
        from app.pipeline.enrichment.internal_search import enrich_from_internal
        internal_result = enrich_from_internal(person)
        worker_results.append(internal_result)

        if internal_result.get("email") and not (person.contact and person.contact.email):
            from app.models import ContactInfo
            if not person.contact:
                person.contact = ContactInfo()
            person.contact.email = internal_result["email"]
            logger.info("  Internal: found email %s", internal_result["email"])

        if internal_result.get("phone") and not (person.contact and person.contact.phone):
            from app.models import ContactInfo
            if not person.contact:
                person.contact = ContactInfo()
            person.contact.phone = internal_result["phone"]
            logger.info("  Internal: found phone %s", internal_result["phone"])

        if "internal_evidence" not in person.enrichment_sources:
            person.enrichment_sources.append("internal_evidence")

        logger.info(
            "  Internal: %d docs found, email=%s, phone=%s",
            internal_result.get("doc_count", 0),
            internal_result.get("email"),
            internal_result.get("phone"),
        )
    except Exception as e:
        logger.warning("Internal evidence search failed: %s", e)

    profiles[person.id] = person

    # --- Worker 1: SerpAPI ---
    logger.info("Enrichment Phase 0.1: SerpAPI KG for %s", person.name)
    try:
        from app.pipeline.enrichment.serpapi_kg import enrich_from_serpapi
        is_re_enrich = bool(person.enriched_at)
        serp_result = enrich_from_serpapi(person, flush_cache=is_re_enrich)
        worker_results.append(serp_result)

        if serp_result.get("social_profiles"):
            person.social_profiles.extend(serp_result["social_profiles"])
            logger.info("  SerpAPI found %d social profiles", len(serp_result["social_profiles"]))
    except Exception as e:
        logger.warning("SerpAPI enrichment failed: %s", e)

    # --- Worker 2: Clay webhook (preferred, async) or PDL (fallback, sync) ---
    from app.config import settings as _cfg
    if _cfg.has_clay and _has_clay_worthy_data(person):
        logger.info("Enrichment Phase 0.2: Clay webhook for %s (fire-and-forget)", person.name)
        try:
            from app.pipeline.enrichment.clay_worker import enrich_from_clay
            clay_status = enrich_from_clay(person, callback_base_url=_cfg.backend_public_url)
            logger.info("  Clay webhook result: %s", clay_status.get("status", "unknown"))
            if clay_status.get("status") == "pending_callback":
                if "clay" not in person.enrichment_sources:
                    person.enrichment_sources.append("clay_pending")
        except Exception as e:
            logger.warning("Clay webhook failed: %s", e)
    elif _cfg.has_clay:
        logger.info("Enrichment Phase 0.2: Skipping Clay — not enough anchor data yet for %s", person.name)
    elif _cfg.has_pdl:
        logger.info("Enrichment Phase 0.2: People Data Labs for %s", person.name)
        try:
            from app.pipeline.enrichment.pdl_worker import enrich_from_pdl
            pdl_result = enrich_from_pdl(person)
            worker_results.append(pdl_result)
            logger.info(
                "  PDL: %d socials, %d addresses, %d employers",
                len(pdl_result.get("social_profiles", [])),
                len(pdl_result.get("addresses", [])),
                len(pdl_result.get("employer_history", [])),
            )
        except Exception as e:
            logger.warning("PDL enrichment failed: %s", e)
    else:
        logger.info("Enrichment Phase 0.2: No Clay or PDL configured — skipping")

    # --- Worker 3: Maigret OSINT ---
    logger.info("Enrichment Phase 0.3: Maigret OSINT for %s", person.name)
    try:
        from app.pipeline.enrichment.maigret_worker import enrich_from_maigret
        maigret_result = enrich_from_maigret(person)
        worker_results.append(maigret_result)
        logger.info("  Maigret: %d profiles found", len(maigret_result.get("social_profiles", [])))
    except Exception as e:
        logger.warning("Maigret enrichment failed: %s", e)

    # Worker 4 (social scraping) removed — scraping now happens per-profile
    # when the user confirms a discovered profile via the confirm endpoint.

    # --- Unify ---
    logger.info("Enrichment Phase 0.5: Unifying results for %s", person.name)
    from app.pipeline.enrichment.unifier import unify_enrichment
    person = unify_enrichment(person, worker_results)

    person.updated_at = utc_now()
    profiles[person.id] = person

    logger.info(
        "Enrichment complete for %s: confidence=%.2f, %d socials, %d addresses, %d employers, sources=%s",
        person.name,
        person.identity_confidence,
        len(person.social_profiles),
        len(person.addresses),
        len(person.employer_history),
        person.enrichment_sources,
    )

    return person
