"""
Worker 3: Maigret OSINT username enumeration.

Given a username discovered from SerpAPI or PDL, checks 3000+ sites for
matching profiles. Pure Python, MIT license, no API key needed.

If maigret is not installed, gracefully returns empty results.
We don't include it in Docker by default (heavy dep) — it's opt-in.
"""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from app.models import Person, SocialProfile

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=1)


def enrich_from_maigret(person: Person) -> dict:
    """
    Discover social accounts across 3000+ sites using known usernames.

    Returns dict with key: social_profiles
    """
    usernames = _extract_usernames(person)
    if not usernames:
        logger.info("Maigret: no usernames to check for %s", person.name)
        return {"social_profiles": []}

    try:
        import maigret  # noqa: F401
    except ImportError:
        logger.info("Maigret not installed — skipping OSINT username enumeration")
        return {"social_profiles": []}

    all_profiles: list[SocialProfile] = []
    seen: set[str] = set()

    for username in usernames[:3]:
        logger.info("Maigret: checking username '%s' for %s", username, person.name)
        try:
            results = _run_maigret(username)
            for r in results:
                url = r.get("url", "")
                if url and url not in seen:
                    seen.add(url)
                    all_profiles.append(SocialProfile(
                        platform=r.get("site", "unknown").lower(),
                        url=url,
                        username=username,
                        confidence=0.4,
                        source="maigret",
                    ))
        except Exception as e:
            logger.warning("Maigret failed for username '%s': %s", username, e)

    logger.info("Maigret: found %d profiles for %s", len(all_profiles), person.name)
    return {"social_profiles": all_profiles}


def _extract_usernames(person: Person) -> list[str]:
    """Pull usernames from existing social profiles."""
    usernames: set[str] = set()
    for sp in person.social_profiles:
        if sp.username and len(sp.username) >= 3:
            usernames.add(sp.username)
    return list(usernames)


def _run_maigret(username: str) -> list[dict]:
    """Run maigret synchronously (it has its own async internals)."""
    try:
        from maigret.maigret import maigret_check
        from maigret.sites import MaigretDatabase

        db = MaigretDatabase().load_from_http()
        sites = db.ranked_sites_dict(top=100)

        loop = asyncio.new_event_loop()
        try:
            results = loop.run_until_complete(
                maigret_check(username=username, sites_dict=sites, timeout=10)
            )
        finally:
            loop.close()

        found = []
        for site_name, site_result in results.items():
            if site_result and site_result.get("status") and "Claimed" in str(site_result.get("status")):
                found.append({
                    "site": site_name,
                    "url": site_result.get("url_user", ""),
                })
        return found
    except Exception as e:
        logger.warning("Maigret internal error: %s", e)
        return []
