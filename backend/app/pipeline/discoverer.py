"""
EntityDiscoverer — finds members / leadership for an entity.

Uses a user-provided prompt (e.g. "all active board members") to build
targeted web searches, then runs LLM extraction on the results. Returns
structured member data (with preview enrichment) that the entities API
stores as pending candidates.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from urllib.parse import urlparse

import dspy
import httpx

from app.models import Entity
from app.pipeline.tools.web_search import search_web, fetch_page

logger = logging.getLogger(__name__)

_SOCIAL_DOMAINS = {
    "linkedin.com": "linkedin",
    "facebook.com": "facebook",
    "twitter.com": "twitter",
    "x.com": "twitter",
    "instagram.com": "instagram",
    "youtube.com": "youtube",
    "github.com": "github",
    "tiktok.com": "tiktok",
}

_JUNK_PATH_SEGMENTS = {
    "linkedin": {
        "search", "results", "posts", "pulse", "feed", "jobs", "groups",
        "company", "school", "showcase", "learning", "sales", "talent",
        "messaging", "notifications", "mynetwork", "dir", "pub",
        "help", "legal", "safety", "about", "accessibility",
    },
    "facebook": {
        "search", "posts", "watch", "groups", "events", "marketplace",
        "gaming", "pages", "stories", "reels", "hashtag", "photo",
        "photo.php", "permalink.php", "notes", "help", "policies",
        "login", "recover", "ads",
    },
    "twitter": {"search", "explore", "hashtag", "i", "lists", "settings", "tos", "privacy"},
    "instagram": {"explore", "reels", "stories", "p", "accounts"},
    "youtube": {"results", "playlist", "feed", "shorts", "channel"},
    "tiktok": {"search", "discover"},
}


class ExtractMembers(dspy.Signature):
    """Extract the names and roles of members/leadership from document text.

    Use the member_criteria field to decide WHICH people to extract.
    Only include people who match the criteria and appear currently active
    (not former members) unless the criteria explicitly asks for former ones.
    """
    document_text: str = dspy.InputField(desc="Text from a web page about the organization")
    entity_name: str = dspy.InputField(desc="Name of the organization")
    entity_type: str = dspy.InputField(desc="Type: district, board, agency, department, program")
    member_criteria: str = dspy.InputField(
        desc="What type of members to extract, e.g. 'all active board members', 'superintendent and assistant superintendents'"
    )

    members: list[dict] = dspy.OutputField(
        desc=(
            "List of members found matching the criteria. Each dict has keys: "
            "'name' (full name), "
            "'role' (their title/position, e.g. 'Board Member', 'President', 'Superintendent'), "
            "'active' (true if currently serving, false if former/unclear)"
        )
    )


class EntityDiscoverer(dspy.Module):
    """Discovers members of an organization via web search + LLM extraction."""

    def __init__(self):
        self.extractor = dspy.ChainOfThought(ExtractMembers)

    def forward(self, entity: Entity, prompt: str = "") -> list[dict]:
        return _discover(self.extractor, entity, prompt)


def _detect_social_platform(url: str) -> str | None:
    try:
        host = urlparse(url).netloc.lower().replace("www.", "")
    except Exception:
        return None
    for domain, platform in _SOCIAL_DOMAINS.items():
        if domain in host:
            return platform
    return None


def _is_profile_url(url: str, platform: str) -> bool:
    try:
        path_parts = set(urlparse(url).path.strip("/").lower().split("/"))
    except Exception:
        return False
    junk = _JUNK_PATH_SEGMENTS.get(platform, set())
    if path_parts & junk:
        return False
    clean = path_parts - {"", "in", "pub", "people"}
    return bool(clean)


def _extract_username(url: str) -> str:
    try:
        path = urlparse(url).path.strip("/").split("/")
        if path and path[0] not in ("in", "pub", "company", "pages", "groups"):
            return path[0]
        elif len(path) > 1:
            return path[1]
    except Exception:
        pass
    return ""


def _preview_search(name: str, entity: Entity) -> dict:
    """Run a single SerpAPI query for a discovered member to gather preview data."""
    from app.config import settings

    if not settings.serpapi_key:
        return {}

    query = f'"{name}" "{entity.name}" {entity.state}'
    try:
        from app.services.redis_client import get_cached_search, set_cached_search

        cache_key = f"preview:{query}"
        cached = get_cached_search(cache_key)
        if cached:
            logger.info("Preview cache hit: %s", name)
            return cached

        client = httpx.Client(timeout=15.0, follow_redirects=True)
        resp = client.get(
            "https://serpapi.com/search",
            params={
                "q": query,
                "api_key": settings.serpapi_key,
                "engine": "google",
                "num": 10,
            },
        )
        resp.raise_for_status()
        data = resp.json()

        bio_snippet = None
        social_profiles = []
        seen_urls: set[str] = set()
        kg_data = {}

        kg = data.get("knowledge_graph", {})
        if kg:
            kg_data = {
                k: v for k, v in kg.items()
                if k in ("title", "description", "type", "thumbnail", "website")
            }
            bio_snippet = kg.get("description")
            for profile in kg.get("profiles", []):
                url = profile.get("link", "")
                plat_name = profile.get("name", "").lower()
                if url and url not in seen_urls and _is_profile_url(url, plat_name):
                    seen_urls.add(url)
                    social_profiles.append({
                        "platform": plat_name,
                        "url": url,
                        "username": _extract_username(url),
                        "source": "knowledge_graph",
                    })

        search_results = []
        for result in data.get("organic_results", [])[:8]:
            url = result.get("link", "")
            search_results.append({
                "title": result.get("title", ""),
                "snippet": result.get("snippet", ""),
                "url": url,
            })
            platform = _detect_social_platform(url)
            if platform and url not in seen_urls and _is_profile_url(url, platform):
                seen_urls.add(url)
                title = result.get("title", "").lower()
                name_in_title = name.lower().split()[0] in title
                social_profiles.append({
                    "platform": platform,
                    "url": url,
                    "username": _extract_username(url),
                    "source": "organic",
                    "confidence": 0.6 if name_in_title else 0.3,
                })

        preview = {
            "bio_snippet": bio_snippet,
            "search_results": search_results,
            "social_profiles": social_profiles,
            "knowledge_graph": kg_data,
        }
        set_cached_search(cache_key, preview)
        return preview

    except Exception as e:
        logger.warning("Preview search failed for %s: %s", name, e)
        return {}


def _discover(extractor, entity: Entity, prompt: str = "") -> list[dict]:
    year = datetime.now().year
    search_terms = prompt or "board members leadership"
    queries = [
        f'"{entity.name}" {search_terms} {year}',
        f'"{entity.name}" {search_terms}',
    ]

    if entity.website:
        queries.append(f'site:{entity.website} {search_terms}')

    all_members: list[dict] = []
    seen_names: set[str] = set()
    seen_urls: set[str] = set()
    member_source_urls: dict[str, list[str]] = {}

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
                    member_criteria=prompt or "all current members and leadership",
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
                    if name_key not in seen_names:
                        if not m.get("active", True):
                            continue
                        seen_names.add(name_key)
                        all_members.append({
                            "name": name,
                            "role": m.get("role") or "Member",
                        })
                        member_source_urls[name_key] = [url]
                        logger.info("    Found: %s (%s)", name, m.get("role", "?"))
                    else:
                        if url not in member_source_urls.get(name_key, []):
                            member_source_urls.setdefault(name_key, []).append(url)

            except Exception as e:
                logger.warning("Extraction failed: %s", e)

    for member in all_members:
        name_key = member["name"].lower()
        source_urls = member_source_urls.get(name_key, [])
        logger.info("  Enriching preview for: %s", member["name"])
        preview = _preview_search(member["name"], entity)
        preview["source_urls"] = source_urls
        member["preview_data"] = preview

    logger.info("Discovery complete: %d unique active members for %s", len(all_members), entity.name)
    return all_members


def discover_entity_members(entity: Entity, prompt: str = "") -> list[dict]:
    """Entry point called by the entities API. Configures DSPy and runs discovery.
    Langfuse tracing is initialized globally in main.py via DSPyInstrumentor."""
    from app.config import settings

    lm = dspy.LM(settings.collect_model, max_tokens=4096)
    dspy.configure(lm=lm)

    try:
        from langfuse import observe, propagate_attributes
        with propagate_attributes(
            tags=["entity-discovery"],
            metadata={"entity_id": entity.id, "entity_name": entity.name, "prompt": prompt},
        ):
            discoverer = EntityDiscoverer()
            return discoverer(entity, prompt=prompt)
    except ImportError:
        discoverer = EntityDiscoverer()
        return discoverer(entity, prompt=prompt)
