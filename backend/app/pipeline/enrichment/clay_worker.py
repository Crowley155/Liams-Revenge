"""
Worker 2: Clay person enrichment via webhook + callback.

Clay does NOT have a traditional REST API. The v3/tables endpoint requires
browser session cookies. The official integration path is:

  1. POST person data + _callback_url to Clay's inbound webhook URL
  2. Clay auto-creates a row and runs enrichment columns
  3. Clay's final HTTP API column POSTs enriched data back to _callback_url
  4. Our callback endpoint parses + stores the enriched data

This worker handles step 1 only (fire-and-forget).
Step 3-4 are handled by the /api/clay-callback/{person_id} endpoint.

Requires:
  CLAY_WEBHOOK_URL   — inbound webhook URL from Clay table setup
  BACKEND_PUBLIC_URL  — our backend's public URL for the callback
  CLAY_API_KEY        — optional, used as auth token in webhook header

Ref: https://university.clay.com/docs/using-clay-as-an-api
"""
from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.models import Person

logger = logging.getLogger(__name__)

_client = httpx.Client(timeout=15.0)


def enrich_from_clay(person: Person, callback_base_url: str | None = None) -> dict:
    """
    Fire a webhook to Clay with person data + callback URL.

    Returns immediately with status info. Actual enrichment data arrives
    async via the /api/clay-callback/{person_id} endpoint.
    """
    if not settings.clay_webhook_url:
        logger.info("Clay webhook URL not configured — skipping")
        return {"status": "skipped", "reason": "no_webhook_url"}

    base = callback_base_url or settings.backend_public_url
    if not base:
        logger.warning("No BACKEND_PUBLIC_URL configured — Clay can't call us back")
        return {"status": "skipped", "reason": "no_callback_url"}

    callback_url = f"{base.rstrip('/')}/api/clay-callback/{person.id}"
    payload = _build_payload(person, callback_url)

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.clay_api_key:
        headers["Authorization"] = f"Bearer {settings.clay_api_key}"

    try:
        resp = _client.post(
            settings.clay_webhook_url,
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        logger.info(
            "Clay webhook fired for %s (callback: %s) — status %d",
            person.name, callback_url, resp.status_code,
        )
        return {"status": "pending_callback", "callback_url": callback_url}

    except httpx.HTTPStatusError as e:
        logger.warning("Clay webhook HTTP error for %s: %s", person.name, e)
        return {"status": "error", "reason": str(e)}
    except Exception as e:
        logger.warning("Clay webhook failed for %s: %s", person.name, e)
        return {"status": "error", "reason": str(e)}


def _build_payload(person: Person, callback_url: str) -> dict:
    """Build the JSON payload for Clay's inbound webhook."""
    parts = person.name.strip().split()
    first_name = parts[0] if parts else ""
    last_name = " ".join(parts[1:]) if len(parts) > 1 else ""

    payload: dict = {
        "_callback_url": callback_url,
        "_person_id": person.id,
        "Full Name": person.name,
        "First Name": first_name,
        "Last Name": last_name,
        "Company": person.organization,
        "Title": person.role,
    }

    if person.city:
        payload["City"] = person.city
    if person.state:
        payload["State"] = person.state
    if person.county:
        payload["County"] = person.county

    # Email is one of Clay's best enrichment anchors
    if person.contact and person.contact.email:
        payload["Email"] = person.contact.email
    if person.contact and person.contact.phone:
        payload["Phone"] = person.contact.phone

    for sp in person.social_profiles:
        if sp.platform == "linkedin" and sp.url:
            payload["LinkedIn URL"] = sp.url
            break

    return payload


# ---------------------------------------------------------------------------
# Parsing helpers — used by the callback endpoint to parse Clay's response
# ---------------------------------------------------------------------------

def find_cell(cells: dict, key: str) -> str | None:
    """Case-insensitive cell lookup — Clay column names vary."""
    key_lower = key.lower().replace(" ", "_").replace("-", "_")
    for k, v in cells.items():
        k_normalized = k.lower().replace(" ", "_").replace("-", "_")
        if key_lower in k_normalized and v:
            return str(v) if not isinstance(v, (dict, list)) else None
    return None


def find_cell_list(cells: dict, key: str) -> list:
    """Find a cell value that's a list (e.g., experience, education)."""
    key_lower = key.lower().replace(" ", "_").replace("-", "_")
    for k, v in cells.items():
        k_normalized = k.lower().replace(" ", "_").replace("-", "_")
        if key_lower in k_normalized and isinstance(v, list):
            return v
    return []


def parse_clay_response(cells: dict) -> dict:
    """
    Parse enriched Clay row data into our model structure.
    Called by the /api/clay-callback endpoint.
    """
    from app.models import Address, SocialProfile, Employment, Education

    result: dict = {
        "social_profiles": [],
        "addresses": [],
        "employer_history": [],
        "education": [],
        "known_associates": [],
        "gender": None,
        "date_of_birth": None,
        "bio_snippet": None,
        "email": None,
        "photo_url": None,
    }

    # Social profiles
    linkedin = find_cell(cells, "linkedin_url") or find_cell(cells, "linkedin") or find_cell(cells, "url")
    slug = find_cell(cells, "slug")
    if linkedin and "linkedin.com" in linkedin:
        username = slug or (linkedin.rstrip("/").split("/")[-1] if "/" in linkedin else "")
        result["social_profiles"].append(SocialProfile(
            platform="linkedin", url=linkedin,
            username=username,
            confidence=0.8, source="clay",
        ))
    elif slug:
        result["social_profiles"].append(SocialProfile(
            platform="linkedin",
            url=f"https://www.linkedin.com/in/{slug}",
            username=slug,
            confidence=0.7, source="clay",
        ))

    facebook = find_cell(cells, "facebook_url") or find_cell(cells, "facebook")
    if facebook:
        result["social_profiles"].append(SocialProfile(
            platform="facebook", url=facebook,
            confidence=0.7, source="clay",
        ))

    twitter = find_cell(cells, "twitter_url") or find_cell(cells, "twitter")
    if twitter:
        result["social_profiles"].append(SocialProfile(
            platform="twitter", url=twitter,
            confidence=0.7, source="clay",
        ))

    github = find_cell(cells, "github_url") or find_cell(cells, "github")
    if github:
        result["social_profiles"].append(SocialProfile(
            platform="github", url=github,
            confidence=0.6, source="clay",
        ))

    # Addresses
    city = find_cell(cells, "city") or find_cell(cells, "location_city") or find_cell(cells, "location_name")
    state = find_cell(cells, "state") or find_cell(cells, "location_state") or find_cell(cells, "region")
    street = find_cell(cells, "street") or find_cell(cells, "address")
    zip_code = find_cell(cells, "zip") or find_cell(cells, "postal")
    country = find_cell(cells, "country")

    if city or state:
        result["addresses"].append(Address(
            street=street or "",
            city=city or "",
            state=state or (country or ""),
            zip_code=zip_code or "",
            current=True,
            source="clay",
        ))

    # Employment — structured experience array
    for exp in find_cell_list(cells, "experience"):
        if isinstance(exp, dict):
            result["employer_history"].append(Employment(
                organization=(
                    exp.get("company", {}).get("name", "")
                    if isinstance(exp.get("company"), dict)
                    else exp.get("company", "")
                ),
                title=(
                    exp.get("title", {}).get("name", "")
                    if isinstance(exp.get("title"), dict)
                    else exp.get("title", "")
                ),
                start_date=exp.get("start_date"),
                end_date=exp.get("end_date"),
                current=exp.get("is_primary", False) or exp.get("is_current", False),
                source="clay",
            ))

    # Fallback: scalar title + company fields
    # Title_Experience is more specific than Title (which may be a general honorific)
    job_title = (
        find_cell(cells, "title_experience")
        or find_cell(cells, "job_title")
        or find_cell(cells, "title")
        or find_cell(cells, "headline")
    )
    company = find_cell(cells, "company_name") or find_cell(cells, "company") or find_cell(cells, "org")
    start_date = find_cell(cells, "startdate") or find_cell(cells, "start_date")
    if job_title and company and not result["employer_history"]:
        result["employer_history"].append(Employment(
            organization=company, title=job_title, current=True,
            start_date=start_date, source="clay",
        ))

    # Education
    for edu in find_cell_list(cells, "education"):
        if isinstance(edu, dict):
            school = edu.get("school", {})
            result["education"].append(Education(
                institution=school.get("name", "") if isinstance(school, dict) else str(school),
                degree=(
                    ", ".join(edu.get("degrees", []))
                    if isinstance(edu.get("degrees"), list)
                    else edu.get("degree", "")
                ),
                field=(
                    ", ".join(edu.get("majors", []))
                    if isinstance(edu.get("majors"), list)
                    else edu.get("major", edu.get("field_of_study", ""))
                ),
                source="clay",
            ))

    # Scalar fields
    result["gender"] = find_cell(cells, "gender") or find_cell(cells, "sex")
    result["date_of_birth"] = find_cell(cells, "birth_date") or find_cell(cells, "dob") or find_cell(cells, "dateofbirth")
    result["email"] = find_cell(cells, "email") or find_cell(cells, "work_email") or find_cell(cells, "personal_email")
    result["bio_snippet"] = find_cell(cells, "summary") or find_cell(cells, "headline")
    result["photo_url"] = find_cell(cells, "picture_url") or find_cell(cells, "photo")

    return result
