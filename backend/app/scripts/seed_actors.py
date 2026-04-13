"""
Seed script: migrate case-data.json actors into backend Person + Entity records.

Re-runnable — skips records that already exist (matched by actor id).
If a pipeline-researched profile already exists for the same name+org,
it gets re-keyed to the canonical actor ID and merged with curated data.

Run inside the container: python -m app.scripts.seed_actors
"""
from __future__ import annotations

import json
import logging
import re
import sys
from datetime import datetime
from pathlib import Path

from app.models import (
    Person, PersonSource, CuratedQuote, ContactInfo,
    Entity, EntityMember,
)
from app.api._store import profiles, entities

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

CASE_DATA_PATH = Path("/app/case-data/case-data.json")

ORG_ENTITY_MAP: dict[str, dict] = {
    "USD 232": {
        "type": "district",
        "description": "De Soto USD 232 school district, Johnson County, Kansas",
        "website": "https://www.usd232.org",
    },
    "JCPRD": {
        "type": "department",
        "description": "Johnson County Park & Recreation District — operates before/after-school care programs in USD 232 buildings under a lease agreement",
        "website": "https://www.jcprd.com",
    },
    "Family": {
        "type": "program",
        "description": "Family members directly involved in the case",
    },
}

FEATURED_IDS = {
    "will-crowley",
    "gerri-balthazor",
    "alvie-cater",
    "brian-schwanz",
    "leigh-white",
    "jennifer-anderson",
}

# Pre-populated negative anchors for disambiguation of common names
NEGATIVE_ANCHORS: dict[str, list[str]] = {
    "will-crowley": [
        "Will Crowley, Denver-area business owner / entrepreneur",
        "Will Crowley, registered sex offender in Tallahassee, Florida",
        "William Crowley, attorney in New York City",
        "Will Crowley, musician / band member",
    ],
}

PERSON_CITY: dict[str, str] = {
    "will-crowley": "Lenexa",
}

PERSON_COUNTY: dict[str, str] = {
    "will-crowley": "Johnson",
}


_EMAIL_RE = re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')
_PHONE_RE = re.compile(r'\b(?:\d{3}[-.]?\d{3}[-.]?\d{4})\b')
_PHONE_EXT_RE = re.compile(r'\b(\d{3}[-.]?\d{3}[-.]?\d{4}),?\s*(?:ext\.?\s*(\d+))?\b', re.IGNORECASE)

# Name-to-email patterns extracted from case evidence headers
_NAME_PATTERNS: dict[str, list[str]] = {
    "gerri-balthazor": ["gerri balthazor", "gbalthazor"],
    "alvie-cater": ["alvie cater", "acater"],
    "janine-winters": ["janine winters", "janine.winters"],
    "breanna-burks": ["breanna burks", "bre burks", "bburks"],
    "jennifer-anderson": ["jennifer anderson", "jennifer.ander"],
    "amy-branson": ["amy branson", "amy.branson"],
    "leigh-white": ["leigh white"],
    "brian-schwanz": ["brian schwanz"],
    "will-crowley": ["william crowley", "will crowley", "william.crowley"],
}


def _mine_evidence_contacts(evidence: list[dict], actors: list[dict]) -> dict[str, ContactInfo]:
    """
    Scan all evidence bodyText for email addresses and phone numbers.
    Match them to actor IDs by name patterns in email headers.
    Returns {actor_id: ContactInfo}.
    """
    actor_name_map: dict[str, str] = {}
    for actor in actors:
        actor_id = actor["id"]
        name_lower = actor["name"].lower()
        actor_name_map[name_lower] = actor_id
        first = name_lower.split()[0]
        last = name_lower.split()[-1] if len(name_lower.split()) > 1 else ""
        if last:
            actor_name_map[last] = actor_id
        for pattern in _NAME_PATTERNS.get(actor_id, []):
            actor_name_map[pattern] = actor_id

    contacts: dict[str, ContactInfo] = {}

    for doc in evidence:
        body = doc.get("bodyText", "")
        if not body:
            continue

        # Extract "Name <email>" patterns from From/To/Cc lines
        name_email_pairs = re.findall(
            r'([A-Za-z][A-Za-z .,\'"]+?)\s*<\s*([\w.+-]+@[\w-]+\.[\w.-]+)\s*>',
            body,
        )
        for raw_name, email in name_email_pairs:
            clean_name = raw_name.strip().strip('*"\'').lower()
            actor_id = _match_name_to_actor(clean_name, actor_name_map)
            if actor_id:
                if actor_id not in contacts:
                    contacts[actor_id] = ContactInfo()
                if not contacts[actor_id].email:
                    contacts[actor_id].email = email.lower()

        # Extract phone numbers near actor signatures
        phone_blocks = _PHONE_EXT_RE.findall(body)
        for phone, ext in phone_blocks:
            phone_str = phone.strip()
            if ext:
                phone_str = f"{phone_str} ext {ext}"

            source_id = doc.get("source", "")
            if source_id and source_id in contacts:
                if not contacts[source_id].phone:
                    contacts[source_id].phone = phone_str
            elif source_id and source_id not in contacts:
                contacts[source_id] = ContactInfo(phone=phone_str)

        # Try matching signature blocks: "*Name*\n*Title*\n*Org*\nPhone"
        sig_pattern = re.compile(
            r'\*([A-Z][a-z]+ [A-Z][a-z]+)\*.*?(\d{3}[-.]?\d{3}[-.]?\d{4})',
            re.DOTALL,
        )
        for name_match, phone_match in sig_pattern.findall(body):
            actor_id = _match_name_to_actor(name_match.lower(), actor_name_map)
            if actor_id:
                if actor_id not in contacts:
                    contacts[actor_id] = ContactInfo()
                if not contacts[actor_id].phone:
                    contacts[actor_id].phone = phone_match

    return contacts


def _match_name_to_actor(name: str, actor_name_map: dict[str, str]) -> str | None:
    """Fuzzy match a name string to an actor ID."""
    name = name.lower().strip()
    if name in actor_name_map:
        return actor_name_map[name]
    for pattern, actor_id in actor_name_map.items():
        if pattern in name or name in pattern:
            return actor_id
    return None


def _get_or_create_entity(org_name: str) -> Entity:
    """Find an existing entity by name or create one."""
    for ent in entities.values():
        if ent.name.lower() == org_name.lower():
            return ent

    info = ORG_ENTITY_MAP.get(org_name, {})
    ent = Entity(
        id=org_name.lower().replace(" ", "-"),
        name=org_name,
        type=info.get("type", "program"),
        description=info.get("description", ""),
        website=info.get("website"),
    )
    entities[ent.id] = ent
    logger.info("  Created entity: %s (%s)", ent.name, ent.id)
    return ent


def _find_existing_by_name(name: str, org: str) -> tuple[str, Person] | None:
    """Find an existing profile by name+org (case-insensitive). Returns (key, Person)."""
    name_lower = name.lower().strip()
    org_lower = org.lower().strip()
    for key, p in profiles.items():
        if p.name.lower().strip() == name_lower and p.organization.lower().strip() == org_lower:
            return (key, p)
    return None


def seed():
    if not CASE_DATA_PATH.exists():
        logger.warning("case-data.json not found at %s — skipping seed", CASE_DATA_PATH)
        return

    data = json.loads(CASE_DATA_PATH.read_text())
    actors = data.get("actors", [])
    evidence = data.get("evidence", [])
    logger.info("Found %d actors, %d evidence docs in case-data.json", len(actors), len(evidence))

    mined_contacts = _mine_evidence_contacts(evidence, actors)
    for aid, ci in mined_contacts.items():
        logger.info("  Mined contact for %s: email=%s, phone=%s", aid, ci.email, ci.phone)

    created = 0
    merged = 0
    skipped = 0

    for actor in actors:
        actor_id = actor["id"]
        org_name = actor.get("org", "")
        entity = _get_or_create_entity(org_name) if org_name else None

        quotes = [
            CuratedQuote(
                text=q["text"],
                doc_id=q.get("docId"),
                date=q.get("date"),
            )
            for q in actor.get("keyQuotes", [])
        ]

        if profiles.get(actor_id):
            existing = profiles[actor_id]
            existing.curated_bio = existing.curated_bio or actor.get("bio")
            if not existing.curated_quotes:
                existing.curated_quotes = quotes
            existing.featured = actor_id in FEATURED_IDS
            if entity and entity.id not in (existing.entity_ids or []):
                existing.entity_ids = (existing.entity_ids or []) + [entity.id]
            if existing.source == PersonSource.PIPELINE:
                existing.source = PersonSource.BOTH
            # Backfill contact info from evidence if missing
            mined = mined_contacts.get(actor_id)
            if mined:
                if not existing.contact:
                    existing.contact = mined
                else:
                    if mined.email and not existing.contact.email:
                        existing.contact.email = mined.email
                    if mined.phone and not existing.contact.phone:
                        existing.contact.phone = mined.phone
            existing.updated_at = datetime.utcnow()
            profiles[actor_id] = existing
            logger.info("  Updated existing: %s (%s)", actor["name"], actor_id)
            skipped += 1
            continue

        match = _find_existing_by_name(actor["name"], org_name)
        if match:
            old_key, existing = match
            logger.info("  Re-keying %s: %s -> %s", actor["name"], old_key, actor_id)

            existing.id = actor_id
            existing.role = actor.get("role", "") or existing.role
            existing.curated_bio = actor.get("bio")
            existing.curated_quotes = quotes
            existing.featured = actor_id in FEATURED_IDS
            existing.entity_ids = [entity.id] if entity else []
            if existing.facts or existing.battle_card:
                existing.source = PersonSource.BOTH
            else:
                existing.source = PersonSource.MANUAL
            existing.updated_at = datetime.utcnow()

            profiles.pop(old_key, None)
            profiles[actor_id] = existing
            merged += 1
        else:
            person = Person(
                id=actor_id,
                name=actor["name"],
                role=actor.get("role", ""),
                organization=org_name,
                state="KS",
                city=PERSON_CITY.get(actor_id, ""),
                county=PERSON_COUNTY.get(actor_id, ""),
                source=PersonSource.MANUAL,
                featured=actor_id in FEATURED_IDS,
                curated_bio=actor.get("bio"),
                curated_quotes=quotes,
                entity_ids=[entity.id] if entity else [],
                negative_anchors=NEGATIVE_ANCHORS.get(actor_id, []),
                contact=mined_contacts.get(actor_id),
            )
            profiles[actor_id] = person
            created += 1
            logger.info("  Created: %s (%s) -> %s", actor["name"], actor_id, org_name)

        if entity:
            if not any(m.person_id == actor_id for m in entity.members):
                entity.members.append(EntityMember(
                    person_id=actor_id,
                    role=actor.get("role", ""),
                    title=actor.get("role", ""),
                ))
                entities[entity.id] = entity

    logger.info("Seed complete: %d created, %d merged, %d updated", created, merged, skipped)


if __name__ == "__main__":
    seed()
