"""
Worker 4: Direct social profile scraping.

For confirmed social profile URLs, fetch the public page and extract
structured identity data (bio, headline, location, employer, education).
Uses SerpAPI's google cache or direct fetch.
"""
from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

from app.config import settings
from app.models import Person, SocialProfile, Employment, Education, Address
from app.pipeline.tools.web_search import fetch_page

logger = logging.getLogger(__name__)


def enrich_from_social_profiles(person: Person) -> dict:
    """
    Scrape public social profiles for identity data.

    Returns dict with keys:
      employer_history, education, addresses, bio_snippet, social_updates
    """
    result = {
        "employer_history": [],
        "education": [],
        "addresses": [],
        "bio_snippet": None,
        "social_updates": [],
    }

    verified_or_likely = [
        sp for sp in person.social_profiles
        if sp.confidence >= 0.5 or sp.verified
    ]

    for sp in verified_or_likely[:5]:
        try:
            data = _scrape_profile(sp, person.name)
            _merge_into(result, data)
        except Exception as e:
            logger.warning("Failed to scrape %s: %s", sp.url, e)

    return result


def _scrape_profile(sp: SocialProfile, person_name: str) -> dict:
    """Fetch and parse a single social profile page."""
    text = fetch_page(sp.url)
    if not text or text.startswith("Error"):
        return {}

    data: dict = {}

    if sp.platform == "linkedin":
        data = _parse_linkedin_text(text, person_name)
    elif sp.platform == "facebook":
        data = _parse_facebook_text(text, person_name)
    elif sp.platform == "twitter":
        data = _parse_twitter_text(text, person_name)

    return data


def _parse_linkedin_text(text: str, name: str) -> dict:
    """Extract structured data from LinkedIn's public profile text."""
    result: dict = {"employer_history": [], "education": [], "addresses": [], "bio_snippet": None}

    lines = text.split("\n")
    for i, line in enumerate(lines):
        lower = line.lower().strip()
        if name.lower().split()[0] in lower and "experience" not in lower:
            if i + 1 < len(lines) and len(lines[i + 1].strip()) > 10:
                result["bio_snippet"] = lines[i + 1].strip()[:200]
                break

    loc_pattern = re.compile(r"(?:location|located in|based in)[:\s]*([A-Za-z\s]+,\s*[A-Z]{2})", re.IGNORECASE)
    m = loc_pattern.search(text)
    if m:
        parts = m.group(1).split(",")
        result["addresses"].append(Address(
            city=parts[0].strip(),
            state=parts[1].strip() if len(parts) > 1 else "",
            source="linkedin_scrape",
        ))

    return result


def _parse_facebook_text(text: str, name: str) -> dict:
    """Best-effort extraction from Facebook public profile text."""
    result: dict = {"employer_history": [], "education": [], "addresses": [], "bio_snippet": None}

    loc_patterns = [
        re.compile(r"(?:Lives in|From)\s+([A-Za-z\s]+,\s*[A-Za-z\s]+)", re.IGNORECASE),
        re.compile(r"(?:Current city|Hometown)[:\s]*([A-Za-z\s]+,\s*[A-Z]{2})", re.IGNORECASE),
    ]
    for pat in loc_patterns:
        m = pat.search(text)
        if m:
            parts = m.group(1).split(",")
            result["addresses"].append(Address(
                city=parts[0].strip(),
                state=parts[1].strip() if len(parts) > 1 else "",
                source="facebook_scrape",
            ))
            break

    edu_pat = re.compile(r"(?:Studied at|Went to)\s+(.+?)(?:\n|$)", re.IGNORECASE)
    for m in edu_pat.finditer(text):
        result["education"].append(Education(
            institution=m.group(1).strip()[:100],
            source="facebook_scrape",
        ))

    work_pat = re.compile(r"(?:Works at|Worked at)\s+(.+?)(?:\n|$)", re.IGNORECASE)
    for m in work_pat.finditer(text):
        result["employer_history"].append(Employment(
            organization=m.group(1).strip()[:100],
            source="facebook_scrape",
        ))

    return result


def _parse_twitter_text(text: str, name: str) -> dict:
    result: dict = {"bio_snippet": None, "addresses": []}

    lines = text.split("\n")
    for line in lines[:20]:
        if len(line.strip()) > 20 and name.lower().split()[0] in line.lower():
            result["bio_snippet"] = line.strip()[:200]
            break

    loc_pat = re.compile(r"(?:📍|Location:?)\s*([A-Za-z\s]+,\s*[A-Z]{2})", re.IGNORECASE)
    m = loc_pat.search(text)
    if m:
        parts = m.group(1).split(",")
        result["addresses"].append(Address(
            city=parts[0].strip(),
            state=parts[1].strip() if len(parts) > 1 else "",
            source="twitter_scrape",
        ))

    return result


def _merge_into(target: dict, source: dict):
    for key in ("employer_history", "education", "addresses", "social_updates"):
        if key in source and isinstance(source[key], list):
            target.setdefault(key, []).extend(source[key])
    if source.get("bio_snippet") and not target.get("bio_snippet"):
        target["bio_snippet"] = source["bio_snippet"]
