"""
Shared contact extraction utilities.

Regex-based extraction of email addresses, phone numbers, and name-email
associations from raw text (email bodies, signatures, etc.).
Used by both the seed script and the internal evidence search worker.
"""
from __future__ import annotations

import re

EMAIL_RE = re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')
PHONE_RE = re.compile(r'\b(?:\d{3}[-.]?\d{3}[-.]?\d{4})\b')
PHONE_EXT_RE = re.compile(
    r'\b(\d{3}[-.]?\d{3}[-.]?\d{4}),?\s*(?:ext\.?\s*(\d+))?\b',
    re.IGNORECASE,
)
NAME_EMAIL_RE = re.compile(
    r'([A-Za-z][A-Za-z .,\'"]+?)\s*<\s*([\w.+-]+@[\w-]+\.[\w.-]+)\s*>',
)
SIGNATURE_RE = re.compile(
    r'\*([A-Z][a-z]+ [A-Z][a-z]+)\*.*?(\d{3}[-.]?\d{3}[-.]?\d{4})',
    re.DOTALL,
)

# Bidirectional nickname / formal-name equivalences.
# Each key maps to all known variants (including itself).
_NICKNAME_GROUPS: list[set[str]] = [
    {"william", "will", "bill", "billy", "willy", "liam"},
    {"robert", "rob", "bob", "bobby", "robbie"},
    {"michael", "mike", "mikey", "mick"},
    {"richard", "rick", "dick", "rich", "richie"},
    {"james", "jim", "jimmy", "jamie"},
    {"john", "jon", "johnny", "jack"},
    {"joseph", "joe", "joey"},
    {"thomas", "tom", "tommy"},
    {"charles", "charlie", "chuck"},
    {"daniel", "dan", "danny"},
    {"matthew", "matt", "matty"},
    {"christopher", "chris"},
    {"anthony", "tony"},
    {"edward", "ed", "eddie", "ted", "teddy"},
    {"kenneth", "ken", "kenny"},
    {"steven", "steve", "stephen"},
    {"timothy", "tim", "timmy"},
    {"lawrence", "larry"},
    {"benjamin", "ben", "benny"},
    {"samuel", "sam", "sammy"},
    {"nicholas", "nick", "nicky"},
    {"andrew", "andy", "drew"},
    {"patrick", "pat", "paddy"},
    {"alexander", "alex"},
    {"jennifer", "jen", "jenny"},
    {"elizabeth", "liz", "beth", "betty", "eliza"},
    {"katherine", "kate", "kathy", "katie", "cathy", "catherine"},
    {"margaret", "maggie", "meg", "peggy"},
    {"patricia", "pat", "patty", "trish"},
    {"susan", "sue", "suzy"},
    {"jessica", "jess", "jessie"},
    {"christina", "chris", "tina"},
    {"breanna", "bre"},
    {"geraldine", "gerri", "geri"},
    {"abigail", "abby", "abbie"},
    {"janine", "jan"},
]

# Build fast lookup: lowercase first-name -> frozenset of all equivalents
NICKNAME_MAP: dict[str, frozenset[str]] = {}
for _group in _NICKNAME_GROUPS:
    _frozen = frozenset(_group)
    for _name in _group:
        NICKNAME_MAP[_name] = _frozen


def are_names_equivalent(name_a: str, name_b: str) -> bool:
    """
    Check if two first names are equivalent via nickname mapping.
    E.g. are_names_equivalent("will", "william") -> True
    """
    a = name_a.lower().strip()
    b = name_b.lower().strip()
    if a == b:
        return True
    group_a = NICKNAME_MAP.get(a)
    if group_a and b in group_a:
        return True
    return False


def names_match(candidate: str, target: str) -> bool:
    """
    Smart name matching: exact, nickname-aware first name + same last name,
    or substring containment as fallback.
    """
    candidate = candidate.lower().strip()
    target = target.lower().strip()
    if candidate == target:
        return True

    cparts = candidate.split()
    tparts = target.split()

    if len(cparts) >= 2 and len(tparts) >= 2:
        if cparts[-1] == tparts[-1] and are_names_equivalent(cparts[0], tparts[0]):
            return True
        if cparts[-1] == tparts[-1]:
            return True

    if target in candidate or candidate in target:
        return True
    return False


# Known actor name patterns for fuzzy matching
NAME_PATTERNS: dict[str, list[str]] = {
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


def build_actor_name_map(actors: list[dict]) -> dict[str, str]:
    """Build a lowercase-name -> actor_id lookup from the actors list."""
    name_map: dict[str, str] = {}
    for actor in actors:
        actor_id = actor["id"]
        name_lower = actor["name"].lower()
        name_map[name_lower] = actor_id
        parts = name_lower.split()
        if len(parts) > 1:
            name_map[parts[-1]] = actor_id
        for pattern in NAME_PATTERNS.get(actor_id, []):
            name_map[pattern] = actor_id
    return name_map


def match_name_to_actor(name: str, actor_name_map: dict[str, str]) -> str | None:
    """Fuzzy match a name string to an actor ID."""
    name = name.lower().strip()
    if name in actor_name_map:
        return actor_name_map[name]
    for pattern, actor_id in actor_name_map.items():
        if pattern in name or name in pattern:
            return actor_id
    return None


def extract_name_email_pairs(text: str) -> list[tuple[str, str]]:
    """Extract (name, email) tuples from 'Name <email>' patterns."""
    return NAME_EMAIL_RE.findall(text)


def extract_phones(text: str) -> list[str]:
    """Extract phone numbers (with optional extension) from text."""
    results = []
    for phone, ext in PHONE_EXT_RE.findall(text):
        phone_str = phone.strip()
        if ext:
            phone_str = f"{phone_str} ext {ext}"
        results.append(phone_str)
    return results


def extract_signature_phones(text: str) -> list[tuple[str, str]]:
    """Extract (name, phone) from signature blocks like *Name*...*Phone*."""
    return SIGNATURE_RE.findall(text)


def extract_emails(text: str) -> list[str]:
    """Extract all standalone email addresses from text."""
    return EMAIL_RE.findall(text)


def extract_person_ids_from_text(text: str, actor_name_map: dict[str, str]) -> list[str]:
    """
    Find all actor IDs mentioned in a text block by scanning for
    name-email patterns and signature blocks.
    """
    person_ids: set[str] = set()

    for raw_name, _email in extract_name_email_pairs(text):
        clean = raw_name.strip().strip('*"\'').lower()
        aid = match_name_to_actor(clean, actor_name_map)
        if aid:
            person_ids.add(aid)

    for name_match, _phone in extract_signature_phones(text):
        aid = match_name_to_actor(name_match.lower(), actor_name_map)
        if aid:
            person_ids.add(aid)

    return list(person_ids)
