"""
Entity Research Pipeline — five-phase intelligence gathering for organizations.

Phase 1: WEBSITE CRAWL
  Fetch the entity's homepage and key sub-pages (about, board, meetings, contact).
  Extract leadership names, meeting schedules, records custodian info.

Phase 2: NEWS SEARCH
  Search for recent news articles about the entity. Prioritize
  regulatory actions, complaints, investigations, and public commitments.

Phase 3: SOCIAL LISTEN
  Search social media for complaints, advocacy needs, and public sentiment.

Phase 4: OVERSIGHT MAP
  Discover parent agencies, oversight bodies, and regulatory relationships.
  Creates EntityRelationship records and may stub new entity records.

Phase 5: RECORDS CHECK
  Search for existing public records requests (MuckRock), audit reports,
  and inspection results related to the entity.

Each phase produces EntityFact and/or EntityRelationship objects.
Disambiguation is applied via the multi-signal scorer to attribute
results to the correct entity (critical when aliases are common names).
"""
from __future__ import annotations

import logging
from datetime import datetime

import dspy

from app.config import settings
from app.models import (
    Entity, EntityAnchor, EntityFact, EntityRelationship, RecordsCustodian,
    ResearchJob, JobStatus,
)
from app.pipeline.disambiguator import Disambiguator, score_entity_match
from app.pipeline.tools.web_search import search_web, fetch_page

logger = logging.getLogger(__name__)

try:
    from langfuse import observe
    _HAS_OBSERVE = True
except ImportError:
    _HAS_OBSERVE = False

    def observe(**kwargs):
        def decorator(fn):
            return fn
        return decorator


class ExtractEntityIntel(dspy.Signature):
    """Extract actionable intelligence from a document about an organization.

    Focus on: leadership/board members, meeting schedules, oversight bodies,
    records custodian contact info, public commitments, complaints,
    regulatory actions, and organizational relationships.

    Return a JSON list of facts, each with:
      category, title, summary, source_date (if found)
    """
    document_text: str = dspy.InputField(desc="Webpage or article text (first 3000 chars)")
    entity_name: str = dspy.InputField()
    entity_context: str = dspy.InputField(desc="Entity type, state, aliases")

    facts: list[dict] = dspy.OutputField(
        desc="List of {category, title, summary, source_date} dicts"
    )
    relationships: list[dict] = dspy.OutputField(
        desc="List of {target_entity_name, relationship_type, description} dicts"
    )
    records_custodian: dict = dspy.OutputField(
        desc="{name, title, email, phone, address, submission_url} or empty dict"
    )
    meeting_url: str = dspy.OutputField(desc="URL for public meeting schedule/calendar, or empty string")


def _build_search_queries(entity: Entity, anchor: EntityAnchor) -> dict[str, list[str]]:
    """Generate search queries for each research phase."""
    names = [entity.name] + [a.name for a in entity.aliases]
    state = entity.state

    news_queries = []
    social_queries = []
    oversight_queries = []
    records_queries = []

    for name in names[:3]:
        news_queries.extend([
            f'"{name}" {state} news',
            f'"{name}" complaint investigation',
            f'"{name}" audit report {state}',
        ])
        social_queries.extend([
            f'"{name}" site:reddit.com',
            f'"{name}" site:nextdoor.com complaint',
            f'"{name}" complaint review',
        ])
        oversight_queries.extend([
            f'"{name}" oversight board {state}',
            f'"{name}" regulated by {state}',
            f'"{name}" parent agency jurisdiction',
        ])
        records_queries.extend([
            f'"{name}" site:muckrock.com',
            f'"{name}" FOIA open records request',
            f'"{name}" inspection report {state}',
        ])

    return {
        "news": news_queries,
        "social": social_queries,
        "oversight": oversight_queries,
        "records": records_queries,
    }


def run_entity_research_pipeline(entity: Entity, job: ResearchJob) -> Entity:
    """Execute the full five-phase entity research pipeline."""
    anchor = EntityAnchor.from_entity(entity)
    disambiguator = Disambiguator()
    extractor = dspy.ChainOfThought(ExtractEntityIntel)

    entity_context = (
        f"Type: {entity.type}, State: {entity.state}, "
        f"Aliases: {', '.join(a.name for a in entity.aliases)}"
    )

    lm = dspy.LM(settings.collect_model, max_tokens=4096)
    queries = _build_search_queries(entity, anchor)

    all_facts: list[EntityFact] = list(entity.facts)
    all_rels: list[EntityRelationship] = list(entity.relationships)
    seen_urls: set[str] = set()

    # =======================================================================
    # Phase 1: Website Crawl
    # =======================================================================
    logger.info("Phase 1: WEBSITE CRAWL for %s", entity.name)
    job.status = JobStatus.SEARCHING
    _persist_job(job)

    if entity.website:
        website_pages = _crawl_website(entity.website)
        for page in website_pages:
            seen_urls.add(page["url"])
            with dspy.context(lm=lm):
                new_facts, new_rels, custodian, meeting = _extract_from_document(
                    extractor, page, entity, entity_context, anchor, disambiguator,
                )
            all_facts.extend(new_facts)
            all_rels.extend(new_rels)
            if custodian and custodian.email and not entity.records_custodian:
                entity.records_custodian = custodian
            if meeting and not entity.meeting_url:
                entity.meeting_url = meeting

    # =======================================================================
    # Phase 2-5: Search-based phases
    # =======================================================================
    phase_map = {
        "news": ("Phase 2: NEWS SEARCH", JobStatus.ENRICHING),
        "social": ("Phase 3: SOCIAL LISTEN", JobStatus.ENRICHING),
        "oversight": ("Phase 4: OVERSIGHT MAP", JobStatus.DISAMBIGUATING),
        "records": ("Phase 5: RECORDS CHECK", JobStatus.EXTRACTING),
    }

    for phase_key, (phase_name, status) in phase_map.items():
        logger.info("%s for %s", phase_name, entity.name)
        job.status = status
        _persist_job(job)

        phase_queries = queries.get(phase_key, [])
        documents = _search_and_fetch(phase_queries, seen_urls, anchor)

        for doc in documents:
            with dspy.context(lm=lm):
                new_facts, new_rels, custodian, meeting = _extract_from_document(
                    extractor, doc, entity, entity_context, anchor, disambiguator,
                )
            all_facts.extend(new_facts)
            all_rels.extend(new_rels)
            if custodian and custodian.email and not entity.records_custodian:
                entity.records_custodian = custodian
            if meeting and not entity.meeting_url:
                entity.meeting_url = meeting

    entity.facts = _deduplicate_facts(all_facts)
    entity.relationships = _deduplicate_relationships(all_rels)

    logger.info(
        "Entity research complete for %s: %d facts, %d relationships",
        entity.name, len(entity.facts), len(entity.relationships),
    )
    return entity


def _persist_job(job: ResearchJob):
    from app.api._store import jobs as _jobs_store
    _jobs_store[job.id] = job


def _crawl_website(base_url: str) -> list[dict]:
    """Fetch homepage and key sub-pages."""
    pages = []
    sub_paths = ["", "/about", "/board", "/meetings", "/contact", "/public-records"]

    base = base_url.rstrip("/")
    for path in sub_paths:
        url = f"{base}{path}"
        try:
            text = fetch_page(url)
            if text and not text.startswith("Error") and len(text) > 100:
                pages.append({"url": url, "title": f"Website: {path or '/'}", "text": text})
                logger.info("  Crawled: %s (%d chars)", url, len(text))
        except Exception as e:
            logger.debug("  Crawl skip %s: %s", url, e)

    return pages


def _search_and_fetch(
    queries: list[str],
    seen_urls: set[str],
    anchor: EntityAnchor,
    max_results_per_query: int = 5,
) -> list[dict]:
    """Execute search queries and fetch pages, skipping duplicates."""
    documents = []

    for query in queries:
        try:
            results = search_web(query)
            for r in results[:max_results_per_query]:
                url = r.get("url", "")
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)

                try:
                    text = fetch_page(url)
                    if text and not text.startswith("Error") and len(text) > 100:
                        documents.append({
                            "url": url,
                            "title": r.get("title", ""),
                            "text": text,
                        })
                except Exception as e:
                    logger.debug("  Fetch skip %s: %s", url[:60], e)
        except Exception as e:
            logger.warning("  Search failed: %s — %s", query[:60], e)

    return documents


def _extract_from_document(
    extractor,
    doc: dict,
    entity: Entity,
    entity_context: str,
    anchor: EntityAnchor,
    disambiguator: Disambiguator,
) -> tuple[list[EntityFact], list[EntityRelationship], RecordsCustodian | None, str]:
    """Run disambiguation + extraction on a single document."""
    url = doc.get("url", "")
    text = doc["text"]

    is_same, conf, reasoning = disambiguator.check_entity_document(
        document_text=text,
        entity_name=entity.name,
        anchor=anchor,
        source_url=url,
    )

    if not is_same:
        logger.info("  REJECTED: %s (%.2f) — %s", doc.get("title", "")[:60], conf, reasoning[:80])
        return [], [], None, ""

    try:
        result = extractor(
            document_text=text[:3000],
            entity_name=entity.name,
            entity_context=entity_context,
        )
    except Exception as e:
        logger.warning("  Extraction failed for %s: %s", url[:60], e)
        return [], [], None, ""

    facts = []
    for f in (result.facts or []):
        if not isinstance(f, dict) or not f.get("title"):
            continue
        facts.append(EntityFact(
            category=f.get("category", "news"),
            title=f["title"],
            summary=f.get("summary", ""),
            source_url=url,
            source_date=f.get("source_date"),
            confidence=conf,
        ))

    rels = []
    for r in (result.relationships or []):
        if not isinstance(r, dict) or not r.get("target_entity_name"):
            continue
        rels.append(EntityRelationship(
            target_entity_id=_resolve_or_stub_entity(r["target_entity_name"], entity.state),
            relationship_type=r.get("relationship_type", "related_to"),
            description=r.get("description", ""),
            source_url=url,
        ))

    custodian = None
    rc = result.records_custodian
    if isinstance(rc, dict) and rc.get("email"):
        custodian = RecordsCustodian(**{k: v for k, v in rc.items() if v and k in RecordsCustodian.model_fields})

    meeting = ""
    if isinstance(result.meeting_url, str) and result.meeting_url.startswith("http"):
        meeting = result.meeting_url

    return facts, rels, custodian, meeting


def _resolve_or_stub_entity(name: str, state: str) -> str:
    """Look up an entity by name or create a stub. Returns entity ID."""
    from app.api._store import entities as _entities_store

    name_lower = name.lower().strip()
    for eid, ent in _entities_store.items():
        if ent.name.lower().strip() == name_lower:
            return eid
        for alias in ent.aliases:
            if alias.name.lower().strip() == name_lower:
                return eid

    import uuid
    stub = Entity(
        id=str(uuid.uuid4())[:8],
        name=name,
        state=state,
        type="agency",
        description="Auto-discovered via entity research pipeline",
    )
    _entities_store[stub.id] = stub
    logger.info("  Stubbed new entity: %s (%s)", stub.name, stub.id)
    return stub.id


def _deduplicate_facts(facts: list[EntityFact]) -> list[EntityFact]:
    """Remove near-duplicate facts by title similarity."""
    seen_titles: set[str] = set()
    unique = []
    for f in facts:
        key = f.title.lower().strip()[:80]
        if key not in seen_titles:
            seen_titles.add(key)
            unique.append(f)
    return unique


def _deduplicate_relationships(rels: list[EntityRelationship]) -> list[EntityRelationship]:
    """Remove duplicate relationships by (target, type) pair."""
    seen: set[tuple[str, str]] = set()
    unique = []
    for r in rels:
        key = (r.target_entity_id, r.relationship_type)
        if key not in seen:
            seen.add(key)
            unique.append(r)
    return unique
