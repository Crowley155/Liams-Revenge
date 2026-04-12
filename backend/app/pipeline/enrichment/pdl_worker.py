"""
Worker 2: People Data Labs person enrichment.

100 free lookups/month. Returns structured identity data:
  - LinkedIn URL, social profiles
  - Employer history, education
  - Addresses, associated names
  - Gender, birth year

Requires PDL_API_KEY in env.
"""
from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.models import Person, Address, SocialProfile, Employment, Education

logger = logging.getLogger(__name__)

_client = httpx.Client(timeout=20.0)

PDL_ENRICH_URL = "https://api.peopledatalabs.com/v5/person/enrich"


def enrich_from_pdl(person: Person) -> dict:
    """
    Call People Data Labs Person Enrichment API.

    Returns a dict with keys:
      social_profiles, addresses, employer_history, education,
      known_associates, gender, date_of_birth, bio_snippet
    """
    if not settings.has_pdl:
        logger.info("PDL API key not configured — skipping")
        return _empty_result()

    params = _build_params(person)
    if not params:
        return _empty_result()

    try:
        resp = _client.get(
            PDL_ENRICH_URL,
            params=params,
            headers={"X-Api-Key": settings.pdl_api_key},
        )

        if resp.status_code == 404:
            logger.info("PDL: no match found for %s", person.name)
            return _empty_result()

        if resp.status_code == 402:
            logger.warning("PDL: quota exhausted (402)")
            return _empty_result()

        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning("PDL enrichment failed for %s: %s", person.name, e)
        return _empty_result()

    return _parse_response(data)


def _build_params(person: Person) -> dict:
    parts = person.name.strip().split()
    if len(parts) < 2:
        return {}

    params: dict = {
        "first_name": parts[0],
        "last_name": parts[-1],
    }

    if person.city and person.state:
        params["location"] = f"{person.city}, {person.state}"
    elif person.state:
        params["location"] = person.state

    if person.organization:
        params["company"] = person.organization

    params["min_likelihood"] = 4
    return params


def _parse_response(data: dict) -> dict:
    result = _empty_result()

    for profile in data.get("profiles", []):
        network = profile.get("network", "").lower()
        url = profile.get("url", "")
        username = profile.get("username", "")
        if url:
            result["social_profiles"].append(SocialProfile(
                platform=network,
                url=url,
                username=username,
                confidence=0.7,
                source="pdl",
            ))

    if data.get("linkedin_url"):
        if not any(sp.platform == "linkedin" for sp in result["social_profiles"]):
            result["social_profiles"].append(SocialProfile(
                platform="linkedin",
                url=data["linkedin_url"],
                username=data.get("linkedin_username", ""),
                confidence=0.8,
                source="pdl",
            ))

    if data.get("facebook_url"):
        if not any(sp.platform == "facebook" for sp in result["social_profiles"]):
            result["social_profiles"].append(SocialProfile(
                platform="facebook",
                url=data["facebook_url"],
                username=data.get("facebook_username", ""),
                confidence=0.7,
                source="pdl",
            ))

    if data.get("twitter_url"):
        if not any(sp.platform == "twitter" for sp in result["social_profiles"]):
            result["social_profiles"].append(SocialProfile(
                platform="twitter",
                url=data["twitter_url"],
                username=data.get("twitter_username", ""),
                confidence=0.7,
                source="pdl",
            ))

    for loc in data.get("location_names", [])[:5]:
        parts = [p.strip() for p in loc.split(",")]
        if len(parts) >= 2:
            result["addresses"].append(Address(
                city=parts[0],
                state=parts[1] if len(parts) > 1 else "",
                type="unknown",
                current=False,
                source="pdl",
            ))

    for exp in data.get("experience", [])[:10]:
        company = exp.get("company", {})
        result["employer_history"].append(Employment(
            organization=company.get("name", exp.get("title", {}).get("name", "")),
            title=exp.get("title", {}).get("name", ""),
            start_date=exp.get("start_date"),
            end_date=exp.get("end_date"),
            current=exp.get("is_primary", False),
            source="pdl",
        ))

    for edu in data.get("education", [])[:5]:
        school = edu.get("school", {})
        result["education"].append(Education(
            institution=school.get("name", ""),
            degree=", ".join(edu.get("degrees", [])),
            field=", ".join(edu.get("majors", [])),
            year=edu.get("end_date", "")[:4] if edu.get("end_date") else None,
            source="pdl",
        ))

    result["gender"] = data.get("sex")
    result["date_of_birth"] = data.get("birth_date")

    for name in data.get("possible_emails", [])[:3]:
        if isinstance(name, str) and "@" in name:
            result["known_associates"].append(name)

    return result


def _empty_result() -> dict:
    return {
        "social_profiles": [],
        "addresses": [],
        "employer_history": [],
        "education": [],
        "known_associates": [],
        "gender": None,
        "date_of_birth": None,
        "bio_snippet": None,
    }
