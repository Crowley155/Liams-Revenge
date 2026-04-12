"""
Pipeline runner — three-pass research architecture.

Pass 1: COLLECT (cheap model)
  Search broadly, fetch pages, extract candidate facts.
  Tags everything with source URL + raw text excerpt.

Pass 2: DISAMBIGUATE (reasoning model)
  For each document, check: "Is this about our target person?"
  For high-impact facts, run fact-level identity verification.
  Drops or confidence-penalizes facts that fail identity checks.

Pass 3: SYNTHESIZE (reasoning model)
  Build battle card from only identity-verified facts.
  Validate key claims against source material.

Tracing: Langfuse + OpenInference DSPy instrumentation is initialized once
at app startup (main.py). This module uses @observe() and propagate_attributes
to group all LLM calls under a single trace per research job.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime

import dspy

from app.config import settings
from app.models import (
    Person, PersonCreate, Fact, BattleCard, ContactInfo,
    ResearchJob, JobStatus, ConfidenceTier, IdentityAnchor,
)
from app.pipeline.searcher import PersonSearcher
from app.pipeline.extractor import FactExtractor
from app.pipeline.profiler import ProfileBuilder
from app.pipeline.validator import FactValidator
from app.pipeline.disambiguator import Disambiguator, build_anchor_from_request
from app.pipeline.tools.web_search import fetch_page

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

try:
    from langfuse import observe, propagate_attributes
    _HAS_OBSERVE = True
except ImportError:
    _HAS_OBSERVE = False

    def observe(**kwargs):
        """No-op fallback when langfuse is not installed."""
        def decorator(fn):
            return fn
        return decorator

    from contextlib import contextmanager

    @contextmanager
    def propagate_attributes(**kwargs):
        yield


# ---------------------------------------------------------------------------
# DSPy configuration — model tiering
# ---------------------------------------------------------------------------

def _lm(model: str) -> dspy.LM:
    return dspy.LM(model, max_tokens=4096)


# ---------------------------------------------------------------------------
# Date extraction helpers
# ---------------------------------------------------------------------------

_DATE_PATTERNS = [
    re.compile(r'(\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b)'),
    re.compile(r'(\b\d{4}[-/]\d{2}[-/]\d{2}\b)'),
    re.compile(r'(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b)'),
]


def _extract_date_hint(title: str, url: str, text_start: str) -> str:
    combined = f"{url} {title} {text_start}"
    for pat in _DATE_PATTERNS:
        m = pat.search(combined)
        if m:
            return m.group(1)
    url_date = re.search(r'/(\d{4})/(\d{2})/(\d{2})/', url)
    if url_date:
        return f"{url_date.group(1)}-{url_date.group(2)}-{url_date.group(3)}"
    return "unknown"


# ---------------------------------------------------------------------------
# Confidence tiering
# ---------------------------------------------------------------------------

HIGH_IMPACT_CATEGORIES = {"bio", "relationship", "contact", "position"}


def _assign_tier(fact: Fact) -> Fact:
    if fact.confidence >= 0.8 and fact.identity_verified:
        fact.tier = ConfidenceTier.A_CONFIRMED
    elif fact.confidence >= 0.5 and fact.identity_verified:
        fact.tier = ConfidenceTier.B_PROBABLE
    elif fact.confidence >= 0.5:
        fact.tier = ConfidenceTier.C_UNCERTAIN
    else:
        fact.tier = ConfidenceTier.D_REJECTED
    return fact


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

@observe(name="research-pipeline")
def run_research_pipeline(
    request: PersonCreate,
    job: ResearchJob,
    existing_person: Person | None = None,
) -> Person:
    """
    Execute the three-pass research pipeline for a single person.
    Updates job.status as it progresses. Returns a fully populated Person.
    """
    person = Person(
        id=job.person_id,
        name=request.name,
        role=request.role,
        organization=request.organization,
        state=request.state,
    )

    anchor = build_anchor_from_request(
        name=request.name,
        role=request.role,
        organization=request.organization,
        state=request.state,
        context=request.context,
        existing_person=existing_person,
    )

    logger.info("Identity anchor: %s", anchor.model_dump_json()[:300])

    with propagate_attributes(
        user_id=request.name,
        session_id=job.id,
        tags=["research-pipeline"],
        metadata={
            "person_name": request.name,
            "organization": request.organization,
            "job_id": job.id,
            "person_id": job.person_id,
            "collect_model": settings.collect_model,
            "disambiguate_model": settings.disambiguate_model,
            "synthesize_model": settings.synthesize_model,
        },
    ):
        return _run_pipeline_phases(request, job, person, anchor, existing_person)


def _run_pipeline_phases(
    request: PersonCreate,
    job: ResearchJob,
    person: Person,
    anchor: IdentityAnchor,
    existing_person: Person | None,
) -> Person:
    # =======================================================================
    # PASS 1: COLLECT (cheap model)
    # =======================================================================
    collect_lm = _lm(settings.collect_model)
    logger.info("Pass 1: COLLECT using %s", settings.collect_model)

    job.status = JobStatus.SEARCHING
    job.started_at = datetime.utcnow()

    with dspy.context(lm=collect_lm):
        documents = _pass1_collect(request, anchor)

    job.sources_searched = len(documents)
    logger.info("Pass 1 complete: %d documents collected", len(documents))

    # =======================================================================
    # PASS 2: DISAMBIGUATE (reasoning model)
    # =======================================================================
    disamb_lm = _lm(settings.disambiguate_model)
    logger.info("Pass 2: DISAMBIGUATE using %s", settings.disambiguate_model)

    job.status = JobStatus.DISAMBIGUATING

    with dspy.context(lm=disamb_lm):
        accepted_docs, rejected_docs, all_facts, merged_contact, raw_texts = \
            _pass2_disambiguate(documents, request, anchor)

    new_negatives = _build_negative_anchors(rejected_docs)
    if new_negatives:
        logger.info("New negative anchors: %s", new_negatives)
        person.negative_anchors.extend(new_negatives)

    person.facts = all_facts
    job.facts_found = len(all_facts)

    if merged_contact:
        if "other_urls" in merged_contact:
            merged_contact["other_urls"] = list(set(merged_contact["other_urls"]))
        person.contact = ContactInfo(**{k: v for k, v in merged_contact.items() if v})

    logger.info(
        "Pass 2 complete: %d docs accepted, %d rejected, %d facts (A:%d B:%d C:%d D:%d)",
        len(accepted_docs), len(rejected_docs), len(all_facts),
        sum(1 for f in all_facts if f.tier == ConfidenceTier.A_CONFIRMED),
        sum(1 for f in all_facts if f.tier == ConfidenceTier.B_PROBABLE),
        sum(1 for f in all_facts if f.tier == ConfidenceTier.C_UNCERTAIN),
        sum(1 for f in all_facts if f.tier == ConfidenceTier.D_REJECTED),
    )

    # =======================================================================
    # PASS 3: SYNTHESIZE (reasoning model)
    # =======================================================================
    synth_lm = _lm(settings.synthesize_model)
    logger.info("Pass 3: SYNTHESIZE using %s", settings.synthesize_model)

    profile_facts = [f for f in all_facts if f.tier in (ConfidenceTier.A_CONFIRMED, ConfidenceTier.B_PROBABLE)]
    rejected_pipeline_facts = [f for f in all_facts if f.tier == ConfidenceTier.D_REJECTED]
    person.rejected_facts.extend(rejected_pipeline_facts)

    with dspy.context(lm=synth_lm):
        person.battle_card = _pass3_synthesize(profile_facts, raw_texts, request)

        job.status = JobStatus.VALIDATING
        _pass3_validate(profile_facts)

    job.status = JobStatus.COMPLETE
    job.completed_at = datetime.utcnow()
    person.updated_at = datetime.utcnow()

    person.facts = [f for f in all_facts if f.tier != ConfidenceTier.D_REJECTED]

    logger.info(
        "Pipeline DONE for %s: %d sources, %d facts kept, %d rejected, %.1fs",
        request.name,
        len(accepted_docs),
        len(person.facts),
        len(person.rejected_facts),
        (job.completed_at - job.started_at).total_seconds(),
    )
    return person


# ---------------------------------------------------------------------------
# Pass 1: Collect
# ---------------------------------------------------------------------------

@observe(name="pass1-collect")
def _pass1_collect(request: PersonCreate, anchor: IdentityAnchor) -> list[dict]:
    """Search broadly and fetch pages. Returns raw documents."""
    searcher = PersonSearcher()
    search_result = searcher(
        person_name=request.name,
        role=request.role,
        organization=request.organization,
        state=request.state,
        context=request.context,
    )

    raw_findings = search_result.findings or []
    logger.info("  ReAct agent returned %d findings", len(raw_findings))

    from app.pipeline.tools.web_search import search_web

    search_queries = [
        f'"{request.name}" "{request.organization}" {request.state}',
        f'"{request.name}" {request.organization} {request.role}',
        f'"{request.name}" school board meeting minutes {request.organization}',
        f'{request.organization} board meeting {request.name}',
        f'"{request.name}" {request.organization} email contact',
    ]

    if anchor.city:
        search_queries.append(f'"{request.name}" "{anchor.city}" {request.state}')

    documents: list[dict] = []
    seen_urls: set[str] = set()

    for query in search_queries:
        logger.info("  Search: %s", query)
        try:
            results = search_web(query)
            for r in results[:5]:
                url = r.get("url", "")
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)

                try:
                    page_text = fetch_page(url)
                    if page_text and not page_text.startswith("Error") and len(page_text) > 100:
                        documents.append({
                            "title": r.get("title", ""),
                            "url": url,
                            "text": page_text,
                        })
                except Exception as e:
                    logger.warning("  Fetch failed: %s", e)
        except Exception as e:
            logger.warning("  Search failed: %s", e)

    for finding in raw_findings:
        if isinstance(finding, dict):
            text = finding.get("text", "") or finding.get("finding", "") or finding.get("value", "")
            if text and len(text) > 50:
                documents.append({"title": "Agent finding", "url": "", "text": text})

    return documents


# ---------------------------------------------------------------------------
# Pass 2: Disambiguate + Extract
# ---------------------------------------------------------------------------

@observe(name="pass2-disambiguate")
def _pass2_disambiguate(
    documents: list[dict],
    request: PersonCreate,
    anchor: IdentityAnchor,
) -> tuple[list[dict], list[dict], list[Fact], dict, list[str]]:
    """
    For each document: identity check → extract facts → fact-level verify high-impact.
    Returns (accepted_docs, rejected_docs, all_facts, merged_contact, raw_texts).
    """
    disambiguator = Disambiguator()
    extractor = FactExtractor()

    accepted_docs: list[dict] = []
    rejected_docs: list[dict] = []
    all_facts: list[Fact] = []
    raw_texts: list[str] = []
    merged_contact: dict = {}

    for doc in documents:
        url = doc.get("url", "")
        title = doc.get("title", "")[:80]
        text = doc["text"]

        # --- Document-level identity check ---
        is_same, doc_confidence, reasoning = disambiguator.check_document(
            document_text=text,
            person_name=request.name,
            anchor=anchor,
            source_url=url,
        )

        if not is_same and doc_confidence >= 0.6:
            logger.info("  REJECTED doc: %s — %s", title, reasoning[:100])
            rejected_docs.append({**doc, "rejection_reason": reasoning, "confidence": doc_confidence})
            continue

        confidence_penalty = 1.0
        if not is_same and doc_confidence < 0.6:
            logger.info("  AMBIGUOUS doc (low-confidence reject): %s — keeping with penalty", title)
            confidence_penalty = 0.5
        elif is_same and doc_confidence < 0.7:
            logger.info("  AMBIGUOUS doc (low-confidence accept): %s — keeping with penalty", title)
            confidence_penalty = 0.5

        accepted_docs.append(doc)
        raw_texts.append(text[:2000])

        # --- Extract facts ---
        date_hint = _extract_date_hint(title, url, text[:500])

        try:
            result = extractor(
                document_text=text,
                person_name=request.name,
                source_date_hint=date_hint,
            )
            extracted = result.facts or []
            logger.info("  Extracted %d facts from: %s", len(extracted), title)
        except Exception as e:
            logger.warning("  Extraction failed for %s: %s", title, e)
            extracted = []

        for f in extracted:
            if not isinstance(f, dict) or not f.get("content"):
                continue

            raw_confidence = float(f.get("confidence", 0.5)) * confidence_penalty
            category = f.get("category", "action")

            fact = Fact(
                category=category,
                content=f.get("content", ""),
                date=f.get("date") if f.get("date") != "unknown" else None,
                source_url=url,
                source_title=doc.get("title"),
                confidence=raw_confidence,
                identity_verified=(doc_confidence >= 0.7 and is_same),
            )

            # --- Fact-level identity check for high-impact categories ---
            if category in HIGH_IMPACT_CATEGORIES and raw_confidence >= 0.5:
                content_start = text.find(f.get("content", "")[:50])
                excerpt_start = max(0, content_start - 250) if content_start > -1 else 0
                excerpt = text[excerpt_start:excerpt_start + 500]

                is_target, fact_conf = disambiguator.verify_fact(
                    fact_content=fact.content,
                    fact_category=category,
                    person_name=request.name,
                    document_excerpt=excerpt,
                    anchor=anchor,
                )

                if not is_target:
                    fact.confidence *= 0.3
                    fact.identity_verified = False
                    logger.info("    Fact-level REJECT: %s", fact.content[:80])
                else:
                    fact.identity_verified = True
                    fact.confidence = min(fact.confidence, fact_conf)

            fact = _assign_tier(fact)
            all_facts.append(fact)

        # --- Contact extraction ---
        try:
            ci = extractor.extract_contact_info(text, request.name)
            if isinstance(ci, dict):
                for k, v in ci.items():
                    if v and k != "other_urls":
                        merged_contact.setdefault(k, v)
                    elif k == "other_urls" and isinstance(v, list):
                        merged_contact.setdefault("other_urls", []).extend(v)
        except Exception as e:
            logger.warning("  Contact extraction failed: %s", e)

    return accepted_docs, rejected_docs, all_facts, merged_contact, raw_texts


# ---------------------------------------------------------------------------
# Pass 3: Synthesize + Validate
# ---------------------------------------------------------------------------

@observe(name="pass3-synthesize")
def _pass3_synthesize(
    profile_facts: list[Fact],
    raw_texts: list[str],
    request: PersonCreate,
) -> BattleCard:
    """Build battle card from identity-verified facts only."""
    logger.info("  Building battle card from %d verified facts", len(profile_facts))

    profiler = ProfileBuilder()
    facts_json = json.dumps([f.model_dump() for f in profile_facts], default=str)
    context_text = "\n---\n".join(raw_texts[:5])
    enriched_input = f"{facts_json}\n\n=== RAW SOURCE EXCERPTS ===\n{context_text}"

    profile_result = profiler(
        person_name=request.name,
        role=request.role,
        organization=request.organization,
        facts_json=enriched_input,
    )

    return BattleCard(
        summary=profile_result.summary,
        key_positions=profile_result.key_positions or [],
        contradictions=profile_result.contradictions or [],
        organizational_ties=profile_result.organizational_ties or [],
        action_items=profile_result.action_items or [],
        public_statements=[f for f in profile_facts if f.category in ("statement", "quote")],
        voting_record=[f for f in profile_facts if f.category == "vote"],
    )


@observe(name="pass3-validate")
def _pass3_validate(facts: list[Fact]):
    """Cross-check high-confidence facts against source text."""
    validator = FactValidator()
    validated = 0

    for fact in facts:
        if fact.confidence >= 0.7 and fact.source_title:
            try:
                vr = validator(claim=fact.content, source_text=fact.source_title)
                fact.verified = bool(vr.is_verified)
                fact.confidence = float(vr.confidence)
                validated += 1
            except Exception as e:
                logger.warning("  Validation failed: %s", e)

    logger.info("  Validated %d facts", validated)


# ---------------------------------------------------------------------------
# Negative anchor generation
# ---------------------------------------------------------------------------

def _build_negative_anchors(rejected_docs: list[dict]) -> list[str]:
    """Extract distinguishing identity info from rejected documents
    to prevent re-processing in future runs."""
    anchors = []
    for doc in rejected_docs:
        if doc.get("confidence", 0) >= 0.8:
            reason = doc.get("rejection_reason", "")
            if reason and len(reason) > 20:
                anchors.append(reason[:200])
    return anchors[:5]
