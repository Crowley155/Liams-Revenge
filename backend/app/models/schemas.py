from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class JobStatus(str, Enum):
    PENDING = "pending"
    SEARCHING = "searching"
    ENRICHING = "enriching"
    DISAMBIGUATING = "disambiguating"
    EXTRACTING = "extracting"
    BUILDING_PROFILE = "building_profile"
    VALIDATING = "validating"
    COMPLETE = "complete"
    FAILED = "failed"


class EntityType(str, Enum):
    DISTRICT = "district"
    DEPARTMENT = "department"
    BOARD = "board"
    AGENCY = "agency"
    PROGRAM = "program"
    COMMISSION = "commission"
    COUNTY = "county"


class PersonSource(str, Enum):
    MANUAL = "manual"
    PIPELINE = "pipeline"
    BOTH = "both"


class ConfidenceTier(str, Enum):
    A_CONFIRMED = "confirmed"
    B_PROBABLE = "probable"
    C_UNCERTAIN = "uncertain"
    D_REJECTED = "rejected"


# ---------------------------------------------------------------------------
# Identity enrichment models
# ---------------------------------------------------------------------------

class Address(BaseModel):
    street: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    type: str = "home"
    current: bool = True
    source: str = ""
    source_url: str = ""

class SocialProfile(BaseModel):
    platform: str
    url: str
    username: str = ""
    verified: bool = False
    confidence: float = 0.0
    source: str = ""
    status: str = "pending"

class Employment(BaseModel):
    organization: str
    title: str = ""
    start_date: str | None = None
    end_date: str | None = None
    current: bool = False
    source: str = ""
    source_url: str = ""

class Education(BaseModel):
    institution: str
    degree: str = ""
    field: str = ""
    year: str | None = None
    source: str = ""
    source_url: str = ""

class ProfileIntelItem(BaseModel):
    text: str
    source_url: str = ""


# ---------------------------------------------------------------------------
# Identity anchor
# ---------------------------------------------------------------------------

class IdentityAnchor(BaseModel):
    """Known facts about a target person used to disambiguate search results
    from other people who share the same name."""
    name: str
    known_aliases: list[str] = Field(default_factory=list)
    organization: str = ""
    role: str = ""
    state: str = "KS"
    city: str = ""
    county: str = ""
    known_associates: list[str] = Field(default_factory=list)
    known_events: list[str] = Field(default_factory=list)
    negative_anchors: list[str] = Field(
        default_factory=list,
        description="Distinguishing traits of DIFFERENT people with the same name, e.g. 'Will Crowley, attorney in NYC'",
    )
    social_urls: list[str] = Field(default_factory=list)
    addresses: list[str] = Field(default_factory=list, description="Known city+state combos")

    @classmethod
    def from_person(cls, person: "Person", entities: list["Entity"] | None = None) -> "IdentityAnchor":
        associates = []
        events = []
        if entities:
            for ent in entities:
                for m in ent.members:
                    if m.person_id != person.id:
                        associates.append(m.person_id)
        if person.curated_bio:
            events.append(person.curated_bio[:200])

        social_urls = [sp.url for sp in person.social_profiles if sp.verified]
        addr_strs = [f"{a.city}, {a.state}" for a in person.addresses if a.city]

        return cls(
            name=person.name,
            organization=person.organization,
            role=person.role,
            state=person.state,
            city=person.city,
            county=person.county,
            known_associates=associates + person.known_associates,
            known_events=events,
            negative_anchors=person.negative_anchors,
            social_urls=social_urls,
            addresses=addr_strs,
        )


class EntityAnchor(BaseModel):
    """Composite identity fingerprint for entity disambiguation.
    Parallel to IdentityAnchor for persons."""
    canonical_name: str
    aliases: list[str] = Field(default_factory=list)
    state: str = "KS"
    entity_type: EntityType = EntityType.DISTRICT
    website_domain: Optional[str] = None
    parent_jurisdiction: Optional[str] = None
    known_member_names: list[str] = Field(default_factory=list)

    @classmethod
    def from_entity(cls, entity: "Entity") -> "EntityAnchor":
        domain = None
        if entity.website:
            from urllib.parse import urlparse
            try:
                domain = urlparse(entity.website).netloc.replace("www.", "")
            except Exception:
                pass
        return cls(
            canonical_name=entity.name,
            aliases=[a.name for a in entity.aliases],
            state=entity.state,
            entity_type=entity.type,
            website_domain=domain,
            known_member_names=[
                m.discovered_name for m in entity.members if m.discovered_name
            ],
        )


class PersonCreate(BaseModel):
    """Input to kick off research on a person."""
    name: str
    role: str
    organization: str
    state: str = "KS"
    city: str = ""
    county: str = ""
    context: str = Field(
        default="",
        description="Freeform context about this person's involvement in the case",
    )
    person_id: Optional[str] = Field(
        default=None,
        description="If set, enrich this existing person instead of creating a new one",
    )


class CuratedQuote(BaseModel):
    """A hand-curated quote from case evidence."""
    text: str
    doc_id: Optional[str] = None
    date: Optional[str] = None


class Fact(BaseModel):
    """A single verified or candidate fact about a person."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    category: str = Field(
        description="statement | vote | position | action | relationship | quote | bio | contact"
    )
    content: str
    date: Optional[str] = None
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    verified: bool = False
    identity_verified: bool = Field(default=False, description="Passed document/fact-level identity check")
    tier: ConfidenceTier = Field(default=ConfidenceTier.C_UNCERTAIN)


class ElectionInfo(BaseModel):
    """Election-related data for an elected official."""
    office: Optional[str] = None
    district: Optional[str] = None
    term_start: Optional[str] = None
    term_end: Optional[str] = None
    next_election: Optional[str] = None
    party: Optional[str] = None
    campaign_finance_url: Optional[str] = None


class BattleCard(BaseModel):
    """The synthesized profile output — the whole point."""
    summary: str = Field(description="2-3 sentence overview of who this person is and why they matter")
    key_positions: list[str] = Field(default_factory=list, description="Notable stances or policy positions")
    public_statements: list[Fact] = Field(default_factory=list)
    voting_record: list[Fact] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list, description="Where their actions contradict their words")
    organizational_ties: list[str] = Field(default_factory=list)
    election_info: Optional[ElectionInfo] = None
    action_items: list[str] = Field(
        default_factory=list,
        description="Concrete things a parent can do (attend meeting, file complaint, etc.)",
    )


class ContactInfo(BaseModel):
    """Public contact and social media information."""
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    linkedin_url: Optional[str] = None
    twitter_handle: Optional[str] = None
    facebook_url: Optional[str] = None
    other_urls: list[str] = Field(default_factory=list)


class EntityMember(BaseModel):
    """A person's membership in an entity."""
    person_id: str = ""
    role: str = ""
    title: str = ""
    active: bool = True
    status: str = "accepted"
    discovered_name: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    preview_data: Optional[dict] = None


class RecordsCustodian(BaseModel):
    """Contact info for an agency's KORA records custodian."""
    name: str = ""
    title: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    submission_url: str = ""
    notes: str = ""


class EntityAlias(BaseModel):
    """Alternative name for an entity (acronym, abbreviation, former name, colloquial)."""
    name: str
    alias_type: str = Field(
        default="acronym",
        description="acronym | abbreviation | former_name | colloquial | legal_name",
    )


class EntityFact(BaseModel):
    """A discovered piece of intelligence about an entity."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    category: str = Field(
        description="meeting_schedule | news | social_complaint | public_commitment | oversight | regulatory_action | records_info",
    )
    title: str
    summary: str
    source_url: Optional[str] = None
    source_date: Optional[str] = None
    raw_text: Optional[str] = None
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    verified: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class EntityRelationship(BaseModel):
    """A directed relationship between two entities."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    target_entity_id: str
    relationship_type: str = Field(
        description="oversees | leases_to | funds | regulates | parent_of | contracts_with",
    )
    description: str = ""
    source_url: Optional[str] = None
    verified: bool = False


class Entity(BaseModel):
    """An organization/board/agency — like a CRM Account record."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str
    type: EntityType = EntityType.DISTRICT
    state: str = "KS"
    website: Optional[str] = None
    description: str = ""
    aliases: list[EntityAlias] = Field(default_factory=list)
    members: list[EntityMember] = Field(default_factory=list)
    key_policies: list[str] = Field(default_factory=list)
    records_custodian: Optional[RecordsCustodian] = None
    facts: list[EntityFact] = Field(default_factory=list)
    relationships: list[EntityRelationship] = Field(default_factory=list)
    meeting_url: Optional[str] = None
    news_summary: Optional[str] = None
    last_researched: Optional[datetime] = None
    metadata: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class EntityCreate(BaseModel):
    """Input to create an entity."""
    name: str
    type: EntityType = EntityType.DISTRICT
    state: str = "KS"
    website: Optional[str] = None
    description: str = ""
    aliases: list[EntityAlias] = Field(default_factory=list)
    meeting_url: Optional[str] = None


class EntityUpdate(BaseModel):
    """Partial update for an entity."""
    name: Optional[str] = None
    type: Optional[EntityType] = None
    state: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    aliases: Optional[list[EntityAlias]] = None
    meeting_url: Optional[str] = None
    key_policies: Optional[list[str]] = None
    records_custodian: Optional[RecordsCustodian] = None


class Person(BaseModel):
    """A fully researched person with their battle card."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str
    role: str
    organization: str
    state: str = "KS"
    city: str = ""
    county: str = ""
    source: PersonSource = PersonSource.MANUAL
    featured: bool = False
    photo_url: Optional[str] = None
    contact: Optional[ContactInfo] = None
    curated_bio: Optional[str] = None
    curated_quotes: list[CuratedQuote] = Field(default_factory=list)
    entity_ids: list[str] = Field(default_factory=list)
    facts: list[Fact] = Field(default_factory=list)
    rejected_facts: list[Fact] = Field(default_factory=list)
    negative_anchors: list[str] = Field(default_factory=list)
    battle_card: Optional[BattleCard] = None

    # Identity enrichment fields
    addresses: list[Address] = Field(default_factory=list)
    social_profiles: list[SocialProfile] = Field(default_factory=list)
    employer_history: list[Employment] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    known_associates: list[str] = Field(default_factory=list)
    profile_intel: list[ProfileIntelItem] = Field(default_factory=list, description="LLM-extracted intelligence bullets from social profiles")
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    identity_confidence: float = Field(default=0.0, description="0-1 how sure we are this profile is unified correctly")
    enrichment_sources: list[str] = Field(default_factory=list)
    enriched_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ResearchJob(BaseModel):
    """Tracks async research pipeline execution."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    person_id: str
    status: JobStatus = JobStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    facts_found: int = 0
    sources_searched: int = 0
    trace_url: Optional[str] = Field(
        default=None, description="Langfuse trace URL for debugging"
    )


# ---------------------------------------------------------------------------
# KORA requests
# ---------------------------------------------------------------------------

class KoraRequest(BaseModel):
    """A generated KORA (Kansas Open Records Act) request."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    case_id: str = "crowley-v-usd232"
    entity_ids: list[str] = Field(default_factory=list, description="Target agencies — plural, e.g. lease involves both USD 232 + JCPRD")
    custodian: Optional[RecordsCustodian] = None
    subject: str = ""
    records_description: str = ""
    legal_basis: str = ""
    relevance: str = ""
    evidence_gap_ids: list[str] = Field(default_factory=list)
    person_ids: list[str] = Field(default_factory=list)
    record_category: str = Field(
        default="",
        description="incident_reports | communications | training | policy | meeting_minutes | inspection | personnel | financial",
    )
    status: str = Field(default="draft", description="draft | sent | fulfilled | denied | partial")
    letter_text: str = ""
    sent_at: Optional[datetime] = None
    response_notes: str = ""
    response_doc_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Document intake
# ---------------------------------------------------------------------------

class CaseDocument(BaseModel):
    """An uploaded document (PDF, image, Word, email, etc.) ingested into Qdrant."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    case_id: str = "crowley-v-usd232"
    filename: str = ""
    file_type: str = Field(default="", description="pdf | image | docx | eml | txt")
    file_size: int = 0
    entity_ids: list[str] = Field(default_factory=list)
    person_ids: list[str] = Field(default_factory=list)
    kora_request_id: str = ""
    source: str = Field(default="manual_upload", description="kora_response | manual_upload | email_export")
    extracted_text: str = ""
    chunk_count: int = 0
    qdrant_point_ids: list[str] = Field(default_factory=list)
    facts_extracted: int = 0
    status: str = Field(default="processing", description="processing | indexed | failed")
    error: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    processed_at: Optional[datetime] = None
