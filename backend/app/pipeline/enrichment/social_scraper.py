"""
Worker 4: Direct social profile scraping + LLM intelligence extraction.

For confirmed social profile URLs, fetch the public page and extract
structured identity data (bio, headline, location, employer, education)
via regex, then run an LLM pass to extract profile intelligence bullets.
"""
from __future__ import annotations

import json
import logging
import re
from urllib.parse import urlparse

import dspy

from app.config import settings
from app.models import Person, SocialProfile, Employment, Education, Address, ProfileIntelItem
from app.pipeline.tools.web_search import fetch_page

logger = logging.getLogger(__name__)


class ExtractProfileIntel(dspy.Signature):
    """Extract intelligence from a social media profile page for a person.

    You are given the raw text of a public social profile page. Extract:
    1. Any structured data (employer, title, education, location)
    2. Short bullet points of notable findings useful for due diligence
       or opposition research — affiliations, public positions, notable
       connections, career moves, anything that reveals character or leverage.

    Return valid JSON with these fields:
    - bio: one-sentence headline/bio (null if not found)
    - employer: current employer name (null if not found)
    - title: current job title (null if not found)
    - location: city, state (null if not found)
    - education: list of institution names
    - intel: list of short bullet-point strings (max 10) — notable facts,
      affiliations, public positions, anything useful for oppo research.
      Each bullet should be a single concise sentence.
    """
    person_name: str = dspy.InputField(desc="Full name of the target person")
    platform: str = dspy.InputField(desc="Social platform: linkedin, facebook, twitter, etc.")
    profile_text: str = dspy.InputField(desc="Raw text content of the profile page")

    extracted_json: str = dspy.OutputField(
        desc='Valid JSON: {"bio", "employer", "title", "location", "education": [], "intel": []}'
    )


_intel_module: dspy.Module | None = None


def _get_intel_module() -> dspy.Module:
    global _intel_module
    if _intel_module is not None:
        return _intel_module

    lm = dspy.LM(settings.collect_model, max_tokens=1024, temperature=0.1)
    _intel_module = dspy.Predict(ExtractProfileIntel)
    dspy.configure(lm=lm)
    return _intel_module


def enrich_from_social_profiles(person: Person) -> dict:
    """
    Scrape public social profiles for identity data + LLM intelligence.

    Returns dict with keys:
      employer_history, education, addresses, bio_snippet, social_updates, profile_intel
    """
    result = {
        "employer_history": [],
        "education": [],
        "addresses": [],
        "bio_snippet": None,
        "social_updates": [],
        "profile_intel": [],
    }

    verified_or_likely = [
        sp for sp in person.social_profiles
        if sp.confidence >= 0.5 or sp.verified
    ]

    for sp in verified_or_likely[:5]:
        try:
            text = fetch_page(sp.url)
            if not text or text.startswith("Error"):
                continue

            regex_data = _scrape_profile_regex(sp, text, person.name)
            _merge_into(result, regex_data)

            intel_data = _llm_extract_profile_intel(text, person.name, sp.platform)
            _merge_intel(result, intel_data)

        except Exception as e:
            logger.warning("Failed to process %s: %s", sp.url, e)

    return result


def scrape_single_profile(person: Person, sp: SocialProfile) -> dict:
    """
    Scrape and extract data from a single confirmed social profile.
    Tags all extracted data with source_url = sp.url for cascade tracking.

    Returns dict with keys:
      employer_history, education, addresses, bio_snippet, profile_intel
    """
    result: dict = {
        "employer_history": [],
        "education": [],
        "addresses": [],
        "bio_snippet": None,
        "profile_intel": [],
    }

    text = fetch_page(sp.url)
    if not text or text.startswith("Error"):
        logger.warning("scrape_single_profile: no content from %s", sp.url)
        return result

    regex_data = _scrape_profile_regex(sp, text, person.name)
    _merge_into(result, regex_data)

    intel_data = _llm_extract_profile_intel(text, person.name, sp.platform)
    _merge_intel(result, intel_data, source_url=sp.url)

    for emp in result["employer_history"]:
        emp.source_url = sp.url
    for edu in result["education"]:
        edu.source_url = sp.url
    for addr in result["addresses"]:
        addr.source_url = sp.url

    return result


def _scrape_profile_regex(sp: SocialProfile, text: str, person_name: str) -> dict:
    """Regex-based extraction from a single social profile page."""
    if sp.platform == "linkedin":
        return _parse_linkedin_text(text, person_name)
    elif sp.platform == "facebook":
        return _parse_facebook_text(text, person_name)
    elif sp.platform == "twitter":
        return _parse_twitter_text(text, person_name)
    return {}


def _llm_extract_profile_intel(text: str, person_name: str, platform: str) -> dict:
    """Run LLM to extract structured intel from a profile page."""
    truncated = text[:3000]
    if len(truncated) < 50:
        return {}

    try:
        module = _get_intel_module()
        result = module(
            person_name=person_name,
            platform=platform,
            profile_text=truncated,
        )

        raw = result.extracted_json
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0]

        parsed = json.loads(raw)

        logger.info(
            "LLM profile intel for %s (%s): %d bullets, employer=%s",
            person_name, platform,
            len(parsed.get("intel", [])),
            parsed.get("employer"),
        )
        return parsed

    except json.JSONDecodeError as e:
        logger.warning("LLM profile intel returned invalid JSON: %s", e)
        return {}
    except Exception as e:
        logger.warning("LLM profile intel failed (non-fatal): %s", e)
        return {}


def _merge_intel(target: dict, llm_data: dict, source_url: str = ""):
    """Merge LLM extraction results into the worker result dict."""
    if not llm_data:
        return

    if llm_data.get("bio") and not target.get("bio_snippet"):
        target["bio_snippet"] = llm_data["bio"]

    if llm_data.get("employer") and llm_data.get("title"):
        target.setdefault("employer_history", []).append(Employment(
            organization=llm_data["employer"],
            title=llm_data.get("title", ""),
            current=True,
            source="llm_profile_intel",
            source_url=source_url,
        ))

    if llm_data.get("location"):
        parts = llm_data["location"].split(",")
        if len(parts) >= 2:
            target.setdefault("addresses", []).append(Address(
                city=parts[0].strip(),
                state=parts[-1].strip(),
                source="llm_profile_intel",
                source_url=source_url,
            ))

    for inst in llm_data.get("education", []):
        if isinstance(inst, str) and inst.strip():
            target.setdefault("education", []).append(Education(
                institution=inst.strip()[:100],
                source="llm_profile_intel",
                source_url=source_url,
            ))

    for bullet in llm_data.get("intel", [])[:10]:
        if isinstance(bullet, str) and bullet.strip():
            target.setdefault("profile_intel", []).append(
                ProfileIntelItem(text=bullet.strip(), source_url=source_url)
            )


def _parse_linkedin_text(text: str, name: str) -> dict:
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
