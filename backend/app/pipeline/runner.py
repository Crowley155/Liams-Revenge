"""
Pipeline runner — orchestrates the full research flow.

1. PersonSearcher finds raw information (search + fetch pages)
2. For each URL found, fetch the full page text explicitly
3. FactExtractor pulls multiple structured facts from each page
4. ProfileBuilder synthesizes facts into a battle card
5. FactValidator cross-checks key claims

This runs synchronously within a background task. The caller (API endpoint)
is responsible for running it off the main thread.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime

import dspy

from app.config import settings
from app.models import Person, PersonCreate, Fact, BattleCard, ContactInfo, ResearchJob, JobStatus
from app.pipeline.searcher import PersonSearcher
from app.pipeline.extractor import FactExtractor
from app.pipeline.profiler import ProfileBuilder
from app.pipeline.validator import FactValidator
from app.pipeline.tools.web_search import fetch_page

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def _configure_dspy():
    """Set up DSPy with the configured LLM via LiteLLM, optionally with Langfuse tracing."""
    if settings.has_langfuse:
        import litellm
        litellm.success_callback = ["langfuse"]
        litellm.failure_callback = ["langfuse"]
        logger.info("Langfuse tracing enabled via LiteLLM callbacks")

    lm = dspy.LM(settings.pipeline_model, max_tokens=4096)
    dspy.configure(lm=lm)


_DATE_PATTERNS = [
    re.compile(r'(\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b)'),
    re.compile(r'(\b\d{4}[-/]\d{2}[-/]\d{2}\b)'),
    re.compile(r'(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b)'),
]


def _extract_date_hint(title: str, url: str, text_start: str) -> str:
    """Try to extract a publication date from the URL, title, or first 500 chars."""
    combined = f"{url} {title} {text_start}"
    for pat in _DATE_PATTERNS:
        m = pat.search(combined)
        if m:
            return m.group(1)
    url_date = re.search(r'/(\d{4})/(\d{2})/(\d{2})/', url)
    if url_date:
        return f"{url_date.group(1)}-{url_date.group(2)}-{url_date.group(3)}"
    return "unknown"


def run_research_pipeline(request: PersonCreate, job: ResearchJob) -> Person:
    """
    Execute the full research pipeline for a single person.

    Updates job.status as it progresses. Raises on failure.
    Returns a fully populated Person with battle card.
    """
    _configure_dspy()

    person = Person(
        id=job.person_id,
        name=request.name,
        role=request.role,
        organization=request.organization,
        state=request.state,
    )

    # --- Phase 1: Search ---
    job.status = JobStatus.SEARCHING
    job.started_at = datetime.utcnow()
    logger.info("Phase 1: Searching for %s (%s, %s)", request.name, request.role, request.organization)

    searcher = PersonSearcher()
    search_result = searcher(
        person_name=request.name,
        role=request.role,
        organization=request.organization,
        state=request.state,
        context=request.context,
    )

    raw_findings = search_result.findings or []
    job.sources_searched = len(raw_findings)
    logger.info("Phase 1 complete: %d findings from agent", len(raw_findings))

    for i, f in enumerate(raw_findings):
        logger.info("  Finding %d: %s", i, {k: str(v)[:100] for k, v in f.items()} if isinstance(f, dict) else str(f)[:200])

    # --- Phase 1b: Run explicit targeted searches + fetch pages ---
    # The ReAct agent returns summaries but often no URLs. We run our own
    # targeted searches and fetch the actual pages for deep extraction.
    from app.pipeline.tools.web_search import search_web

    search_queries = [
        f'"{request.name}" {request.organization} {request.role}',
        f'"{request.name}" school board meeting minutes',
        f'"{request.name}" {request.organization} policy',
        f'{request.organization} board meeting {request.name}',
        f'"{request.name}" {request.organization} email contact',
    ]

    documents: list[dict] = []
    seen_urls: set[str] = set()

    for query in search_queries:
        logger.info("Explicit search: %s", query)
        try:
            results = search_web(query)
            for r in results[:5]:
                url = r.get("url", "")
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)

                logger.info("  Fetching: %s", url)
                try:
                    page_text = fetch_page(url)
                    if page_text and not page_text.startswith("Error") and len(page_text) > 100:
                        documents.append({
                            "title": r.get("title", ""),
                            "url": url,
                            "text": page_text,
                        })
                        logger.info("  Got %d chars from %s", len(page_text), r.get("title", "")[:60])
                except Exception as e:
                    logger.warning("  Fetch failed: %s", e)
        except Exception as e:
            logger.warning("Search failed for query '%s': %s", query, e)

    # Also include any text the ReAct agent produced as supplementary context
    for finding in raw_findings:
        if isinstance(finding, dict):
            text = finding.get("text", "") or finding.get("finding", "") or finding.get("value", "")
            if text and len(text) > 50:
                documents.append({"title": "Agent finding", "url": "", "text": text})

    logger.info("Phase 1b complete: %d documents with content", len(documents))

    # --- Phase 2: Extract facts + contact info ---
    job.status = JobStatus.EXTRACTING
    extractor = FactExtractor()
    all_facts: list[Fact] = []
    raw_texts: list[str] = []
    merged_contact: dict = {}

    for doc in documents:
        text = doc["text"]
        raw_texts.append(text[:2000])

        date_hint = _extract_date_hint(doc.get("title", ""), doc.get("url", ""), text[:500])

        try:
            result = extractor(
                document_text=text,
                person_name=request.name,
                source_date_hint=date_hint,
            )
            extracted = result.facts or []
            logger.info("  Extracted %d facts from: %s", len(extracted), doc["title"][:60])

            for f in extracted:
                if not isinstance(f, dict) or not f.get("content"):
                    continue
                all_facts.append(Fact(
                    category=f.get("category", "action"),
                    content=f.get("content", ""),
                    date=f.get("date") if f.get("date") != "unknown" else None,
                    source_url=doc.get("url"),
                    source_title=doc.get("title"),
                    confidence=float(f.get("confidence", 0.5)),
                ))
        except Exception as e:
            logger.warning("Extraction failed for %s: %s", doc.get("title", "?"), e)

        try:
            ci = extractor.extract_contact_info(text, request.name)
            if isinstance(ci, dict):
                for k, v in ci.items():
                    if v and k != "other_urls":
                        merged_contact.setdefault(k, v)
                    elif k == "other_urls" and isinstance(v, list):
                        merged_contact.setdefault("other_urls", []).extend(v)
        except Exception as e:
            logger.warning("Contact extraction failed: %s", e)

    person.facts = all_facts
    job.facts_found = len(all_facts)

    if merged_contact:
        if "other_urls" in merged_contact:
            merged_contact["other_urls"] = list(set(merged_contact["other_urls"]))
        person.contact = ContactInfo(**{k: v for k, v in merged_contact.items() if v})
        logger.info("Contact info found: %s", {k: v for k, v in merged_contact.items() if v and k != "other_urls"})

    logger.info("Phase 2 complete: %d total facts extracted", len(all_facts))

    # --- Phase 3: Build profile ---
    job.status = JobStatus.BUILDING_PROFILE
    logger.info("Phase 3: Building battle card profile")
    profiler = ProfileBuilder()

    facts_json = json.dumps([f.model_dump() for f in all_facts], default=str)
    context_text = "\n---\n".join(raw_texts[:5])
    enriched_input = f"{facts_json}\n\n=== RAW SOURCE EXCERPTS ===\n{context_text}"

    profile_result = profiler(
        person_name=request.name,
        role=request.role,
        organization=request.organization,
        facts_json=enriched_input,
    )

    person.battle_card = BattleCard(
        summary=profile_result.summary,
        key_positions=profile_result.key_positions or [],
        contradictions=profile_result.contradictions or [],
        organizational_ties=profile_result.organizational_ties or [],
        action_items=profile_result.action_items or [],
        public_statements=[f for f in all_facts if f.category in ("statement", "quote")],
        voting_record=[f for f in all_facts if f.category == "vote"],
    )

    # --- Phase 4: Validate key facts ---
    job.status = JobStatus.VALIDATING
    validated_count = 0
    validator = FactValidator()
    for fact in all_facts:
        if fact.confidence >= 0.7 and fact.source_title:
            try:
                vr = validator(claim=fact.content, source_text=fact.source_title)
                fact.verified = bool(vr.is_verified)
                fact.confidence = float(vr.confidence)
                validated_count += 1
            except Exception as e:
                logger.warning("Validation failed for fact: %s", e)

    logger.info("Phase 4 complete: validated %d facts", validated_count)

    # --- Done ---
    job.status = JobStatus.COMPLETE
    job.completed_at = datetime.utcnow()
    person.updated_at = datetime.utcnow()

    logger.info(
        "Pipeline DONE for %s: %d sources, %d facts, battle card built in %.1fs",
        request.name,
        len(documents),
        len(all_facts),
        (job.completed_at - job.started_at).total_seconds(),
    )
    return person
