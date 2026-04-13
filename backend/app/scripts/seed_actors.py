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


from app.pipeline.enrichment.contact_extractor import (
    PHONE_EXT_RE,
    build_actor_name_map,
    match_name_to_actor,
    extract_name_email_pairs,
    extract_signature_phones,
)


def _mine_evidence_contacts(evidence: list[dict], actors: list[dict]) -> dict[str, ContactInfo]:
    """
    Scan all evidence bodyText for email addresses and phone numbers.
    Match them to actor IDs by name patterns in email headers.
    Returns {actor_id: ContactInfo}.
    """
    actor_name_map = build_actor_name_map(actors)
    contacts: dict[str, ContactInfo] = {}

    for doc in evidence:
        body = doc.get("bodyText", "")
        if not body:
            continue

        for raw_name, email in extract_name_email_pairs(body):
            clean_name = raw_name.strip().strip('*"\'').lower()
            actor_id = match_name_to_actor(clean_name, actor_name_map)
            if actor_id:
                if actor_id not in contacts:
                    contacts[actor_id] = ContactInfo()
                if not contacts[actor_id].email:
                    contacts[actor_id].email = email.lower()

        for phone, ext in PHONE_EXT_RE.findall(body):
            phone_str = phone.strip()
            if ext:
                phone_str = f"{phone_str} ext {ext}"
            source_id = doc.get("source", "")
            if source_id and source_id in contacts:
                if not contacts[source_id].phone:
                    contacts[source_id].phone = phone_str
            elif source_id and source_id not in contacts:
                contacts[source_id] = ContactInfo(phone=phone_str)

        for name_match, phone_match in extract_signature_phones(body):
            actor_id = match_name_to_actor(name_match.lower(), actor_name_map)
            if actor_id:
                if actor_id not in contacts:
                    contacts[actor_id] = ContactInfo()
                if not contacts[actor_id].phone:
                    contacts[actor_id].phone = phone_match

    return contacts


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
