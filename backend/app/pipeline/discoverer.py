"""
EntityDiscoverer — finds active board members / leadership for an entity.

Uses targeted web search + page scraping to discover who currently serves
on a school board, agency, or organization. Returns structured member data
that the entities API turns into Person stubs.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime

import dspy

from app.models import Entity
from app.pipeline.tools.web_search import search_web, fetch_page

logger = logging.getLogger(__name__)


class ExtractMembers(dspy.Signature):
    """Extract the names and roles of current members/leadership from document text.

    Look for: board members, president, vice president, superintendent,
    directors, committee chairs, elected officials. Only include people
    who appear to be CURRENTLY active (not former members).
    """
    document_text: str = dspy.InputField(desc="Text from a web page about the organization")
    entity_name: str = dspy.InputField(desc="Name of the organization")
    entity_type: str = dspy.InputField(desc="Type: district, board, agency, department, program")

    members: list[dict] = dspy.OutputField(
        desc=(
            "List of members found. Each dict has keys: "
            "'name' (full name), "
            "'role' (their title/position, e.g. 'Board Member', 'President', 'Superintendent'), "
            "'active' (true if currently serving, false if former/unclear)"
        )
    )


class EntityDiscoverer(dspy.Module):
    """Discovers active members of an organization via web search."""

    def __init__(self):
        self.extractor = dspy.ChainOfThought(ExtractMembers)

    def forward(self, entity: Entity) -> list[dict]:
        return _discover(self.extractor, entity)


def _discover(extractor, entity: Entity) -> list[dict]:
    year = datetime.now().year
    queries = [
        f'"{entity.name}" board members {year}',
        f'"{entity.name}" board of education members',
        f'{entity.name} leadership staff directory',
    ]

    if entity.website:
        queries.append(f'site:{entity.website} board members')

    all_members: list[dict] = []
    seen_names: set[str] = set()
    seen_urls: set[str] = set()

    for query in queries:
        logger.info("Discovery search: %s", query)
        try:
            results = search_web(query)
        except Exception as e:
            logger.warning("Search failed: %s", e)
            continue

        for r in results[:5]:
            url = r.get("url", "")
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)

            try:
                page_text = fetch_page(url)
                if not page_text or page_text.startswith("Error") or len(page_text) < 100:
                    continue
            except Exception as e:
                logger.warning("Fetch failed for %s: %s", url, e)
                continue

            logger.info("  Extracting members from: %s", r.get("title", "")[:80])
            try:
                result = extractor(
                    document_text=page_text,
                    entity_name=entity.name,
                    entity_type=entity.type,
                )
                members = result.members or []
                if isinstance(members, str):
                    try:
                        members = json.loads(members)
                    except (json.JSONDecodeError, TypeError):
                        members = []

                for m in members:
                    if not isinstance(m, dict):
                        continue
                    name = m.get("name", "").strip()
                    if not name or len(name) < 3:
                        continue
                    name_key = name.lower()
                    if name_key in seen_names:
                        continue
                    if not m.get("active", True):
                        continue
                    seen_names.add(name_key)
                    all_members.append({
                        "name": name,
                        "role": m.get("role", "Member"),
                    })
                    logger.info("    Found: %s (%s)", name, m.get("role", "?"))

            except Exception as e:
                logger.warning("Extraction failed: %s", e)

    logger.info("Discovery complete: %d unique active members for %s", len(all_members), entity.name)
    return all_members


def discover_entity_members(entity: Entity) -> list[dict]:
    """Entry point called by the entities API. Configures DSPy and runs discovery.
    Langfuse tracing is initialized globally in main.py via DSPyInstrumentor."""
    from app.config import settings

    lm = dspy.LM(settings.collect_model, max_tokens=4096)
    dspy.configure(lm=lm)

    try:
        from langfuse import observe, propagate_attributes
        with propagate_attributes(
            tags=["entity-discovery"],
            metadata={"entity_id": entity.id, "entity_name": entity.name},
        ):
            discoverer = EntityDiscoverer()
            return discoverer(entity)
    except ImportError:
        discoverer = EntityDiscoverer()
        return discoverer(entity)
