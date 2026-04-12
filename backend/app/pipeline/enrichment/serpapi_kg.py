"""
Worker 1: SerpAPI Knowledge Graph + social link discovery.

Queries SerpAPI with the person's name + location/org context and extracts:
  - Knowledge Graph panel (bio, description, social profiles)
  - Organic result social profile links (LinkedIn, Facebook, Twitter)
"""
from __future__ import annotations

import logging
from urllib.parse import urlparse

import httpx

from app.config import settings
from app.models import Person, SocialProfile

logger = logging.getLogger(__name__)

_client = httpx.Client(timeout=15.0, follow_redirects=True)

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


def enrich_from_serpapi(person: Person) -> dict:
    """
    Search SerpAPI for knowledge graph + social links.

    Returns a dict with keys: social_profiles, bio_snippet, knowledge_graph.
    """
    if not settings.serpapi_key:
        logger.warning("SerpAPI key not configured — skipping")
        return {"social_profiles": [], "bio_snippet": None, "knowledge_graph": {}}

    queries = _build_queries(person)
    social_profiles: list[SocialProfile] = []
    seen_urls: set[str] = set()
    bio_snippet = None
    kg_data = {}

    for query in queries:
        try:
            data = _search(query)
        except Exception as e:
            logger.warning("SerpAPI search failed for '%s': %s", query, e)
            continue

        kg = data.get("knowledge_graph", {})
        if kg:
            kg_data = kg
            if not bio_snippet and kg.get("description"):
                bio_snippet = kg["description"]

            for profile in kg.get("profiles", []):
                url = profile.get("link", "")
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    social_profiles.append(SocialProfile(
                        platform=profile.get("name", "").lower(),
                        url=url,
                        username=_extract_username(url),
                        confidence=0.7,
                        source="serpapi_kg",
                    ))

        for result in data.get("organic_results", [])[:10]:
            url = result.get("link", "")
            platform = _detect_social_platform(url)
            if platform and url not in seen_urls:
                seen_urls.add(url)
                title = result.get("title", "").lower()
                name_in_title = person.name.lower().split()[0] in title
                social_profiles.append(SocialProfile(
                    platform=platform,
                    url=url,
                    username=_extract_username(url),
                    confidence=0.6 if name_in_title else 0.3,
                    source="serpapi_organic",
                ))

    return {
        "social_profiles": social_profiles,
        "bio_snippet": bio_snippet,
        "knowledge_graph": kg_data,
    }


def _build_queries(person: Person) -> list[str]:
    queries = [f'"{person.name}" "{person.organization}" {person.state}']

    if person.city:
        queries.append(f'"{person.name}" "{person.city}" {person.state}')

    queries.append(f'"{person.name}" {person.organization} {person.role}')
    queries.append(f'"{person.name}" LinkedIn {person.state}')

    return queries


def _search(query: str) -> dict:
    from app.services.redis_client import get_cached_search, set_cached_search

    cache_key = f"serpapi_full:{query}"
    cached = get_cached_search(cache_key)
    if cached:
        logger.info("SerpAPI KG cache hit: %s", query[:60])
        return cached

    resp = _client.get(
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
    set_cached_search(cache_key, data)
    return data


def _detect_social_platform(url: str) -> str | None:
    try:
        host = urlparse(url).netloc.lower().replace("www.", "")
    except Exception:
        return None
    for domain, platform in _SOCIAL_DOMAINS.items():
        if domain in host:
            return platform
    return None


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
