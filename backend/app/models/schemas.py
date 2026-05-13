from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from app.time import utc_now


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


class WorkspaceType(str, Enum):
    PERSONAL = "personal"
    ORGANIZATION = "organization"


class WorkspacePlan(str, Enum):
    FREE = "free"
    ORGANIZATION = "organization"
    PREMIUM = "premium"
    ADMIN = "admin"


class CaseShareRole(str, Enum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class CaseShareStatus(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"


class CaseInvitationStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REVOKED = "revoked"
    EXPIRED = "expired"


class CaseStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    DEMO = "demo"


class EvaluationStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


class EvidenceStrength(str, Enum):
    STRONG = "strong"
    MIXED = "mixed"
    THIN = "thin"
    UNKNOWN = "unknown"


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
# Multi-tenant case/product models
# ---------------------------------------------------------------------------

class Workspace(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str = "Personal workspace"
    type: WorkspaceType = WorkspaceType.PERSONAL
    plan: WorkspacePlan = WorkspacePlan.FREE
    owner_user_id: str = ""
    clerk_org_id: str = ""
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class AppUser(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    clerk_user_id: str
    email: str = ""
    role: str = "member"
    workspace_id: str
    org_workspace_id: str = ""
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class EntitlementSnapshot(BaseModel):
    plan: WorkspacePlan = WorkspacePlan.FREE
    max_active_cases: int = 1
    max_documents_per_case: int = 5
    evaluation_refresh_days: int = 30
    premium_review: bool = False
    organization_workspace: bool = False


class SupportConsent(BaseModel):
    attorney_contact_opt_in: bool = False
    advocacy_contact_opt_in: bool = False
    media_contact_opt_in: bool = False
    contact_preference: str = ""
    sensitivity_notes: str = ""
    share_summary_consent: bool = False
    consented_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None


class CaseIntake(BaseModel):
    state: str = "KS"
    district: str = ""
    school: str = ""
    issue_type: str = "special_education"
    issue_categories: list[str] = Field(default_factory=list)
    incident_date: Optional[str] = None
    narrative: str = ""
    desired_outcome: str = ""
    desired_outcomes: list[str] = Field(default_factory=list)
    student_age: Optional[int] = None
    impacted_party_age: Optional[int] = None
    grade_level: str = ""
    school_setting: str = ""
    relationship_to_child: str = ""
    iep_504_status: str = ""
    urgency_level: str = "routine"
    safety_risk: bool = False
    retaliation_concern: bool = False
    prior_actions: list[str] = Field(default_factory=list)
    urgent: bool = False


class CaseCreate(BaseModel):
    title: str = ""
    state: str = ""
    district: str = ""
    school: str = ""
    issue_type: str = "special_education"
    issue_categories: list[str] = Field(default_factory=list)
    incident_date: Optional[str] = None
    narrative: str = ""
    desired_outcome: str = ""
    desired_outcomes: list[str] = Field(default_factory=list)
    student_age: Optional[int] = None
    impacted_party_age: Optional[int] = None
    grade_level: str = ""
    school_setting: str = ""
    relationship_to_child: str = ""
    iep_504_status: str = ""
    urgency_level: str = "routine"
    safety_risk: bool = False
    retaliation_concern: bool = False
    prior_actions: list[str] = Field(default_factory=list)
    urgent: bool = False
    support_consent: SupportConsent = Field(default_factory=SupportConsent)


class CaseIntakeFacts(BaseModel):
    """Structured case facts extracted from the parent conversation."""
    title: str = ""
    state: str = ""
    district: str = ""
    school: str = ""
    issue_type: str = "other"
    issue_categories: list[str] = Field(default_factory=list)
    incident_date: Optional[str] = None
    narrative: str = ""
    desired_outcome: str = ""
    desired_outcomes: list[str] = Field(default_factory=list)
    student_age: Optional[int] = None
    impacted_party_age: Optional[int] = None
    grade_level: str = ""
    school_setting: str = ""
    relationship_to_child: str = ""
    iep_504_status: str = ""
    urgency_level: str = "routine"
    safety_risk: bool = False
    retaliation_concern: bool = False
    prior_actions: list[str] = Field(default_factory=list)
    urgent: bool = False


class CaseIntakeQuestion(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    field: str = ""
    label: str = ""
    question: str = ""
    why: str = ""
    input_type: str = Field(default="free_text", description="free_text | single_choice | multi_choice | yes_no")
    options: list[str] = Field(default_factory=list)
    priority: int = Field(default=1, ge=1, le=5)


class CaseIntakeAnalysis(BaseModel):
    facts: CaseIntakeFacts = Field(default_factory=CaseIntakeFacts)
    confidence: dict[str, float] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    issue_tags: list[str] = Field(default_factory=list)
    next_question: str = ""
    question_cards: list[CaseIntakeQuestion] = Field(default_factory=list)
    assistant_message: str = ""
    draft_title: str = ""
    family_narrative_patch: str = ""
    suggested_actions: list[str] = Field(default_factory=list)
    route_suggestion: str = ""
    agent_run_ids: list[str] = Field(default_factory=list)


class CaseIntakeMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    role: str = Field(default="user", description="user | assistant | system")
    content: str = ""
    structured: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


class CaseIntakeSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    workspace_id: str
    case_id: str = ""
    created_by: str = ""
    status: str = Field(default="active", description="active | case_created | abandoned")
    messages: list[CaseIntakeMessage] = Field(default_factory=list)
    facts: CaseIntakeFacts = Field(default_factory=CaseIntakeFacts)
    confidence: dict[str, float] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    issue_tags: list[str] = Field(default_factory=list)
    next_question: str = ""
    user_overrides: dict = Field(default_factory=dict)
    draft_case_id: str = ""
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CaseIntakeMessageCreate(BaseModel):
    content: str


class CaseIntakeFactsPatch(BaseModel):
    facts: dict = Field(default_factory=dict)


class CaseIntakeCreateCaseRequest(BaseModel):
    support_consent: SupportConsent = Field(default_factory=SupportConsent)


class CaseUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    family_narrative: Optional[str] = None
    desired_outcome: Optional[str] = None
    desired_outcomes: Optional[list[str]] = None
    intake: Optional[CaseIntake] = None
    advocate_state: Optional[dict] = None


class CaseRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    workspace_id: str
    title: str
    status: CaseStatus = CaseStatus.ACTIVE
    intake: CaseIntake = Field(default_factory=CaseIntake)
    support_consent: SupportConsent = Field(default_factory=SupportConsent)
    summary: str = ""
    family_narrative: str = ""
    advocate_state: dict = Field(default_factory=dict)
    created_by: str = ""
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CasePermissions(BaseModel):
    can_view: bool = False
    can_edit: bool = False
    can_upload_evidence: bool = False
    can_delete_evidence: bool = False
    can_run_case_read: bool = False
    can_manage_records: bool = False
    can_manage_sharing: bool = False
    can_manage_support: bool = False
    can_manage_gmail: bool = False


class CaseAccessSummary(BaseModel):
    case_id: str
    role: Optional[CaseShareRole] = None
    permissions: CasePermissions = Field(default_factory=CasePermissions)


class CaseShareGrant(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    workspace_id: str
    case_id: str
    user_id: str = ""
    clerk_user_id: str = ""
    email: str = ""
    role: CaseShareRole = CaseShareRole.VIEWER
    status: CaseShareStatus = CaseShareStatus.ACTIVE
    invited_by_user_id: str = ""
    invited_by_email: str = ""
    accepted_at: datetime = Field(default_factory=utc_now)
    revoked_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CaseInvitation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    workspace_id: str
    case_id: str
    email: str
    role: CaseShareRole = CaseShareRole.VIEWER
    status: CaseInvitationStatus = CaseInvitationStatus.PENDING
    token_hash: str = ""
    invited_by_user_id: str = ""
    invited_by_email: str = ""
    accepted_by_user_id: str = ""
    grant_id: str = ""
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CaseInviteCreate(BaseModel):
    email: str
    role: CaseShareRole = CaseShareRole.VIEWER


class CaseShareRoleUpdate(BaseModel):
    role: CaseShareRole


class EvaluationIssueArea(BaseModel):
    area: str
    severity: str = "medium"
    why_it_matters: str = ""
    policy_refs: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class EvaluationTimelineEvent(BaseModel):
    date: str = ""
    label: str
    detail: str = ""
    source_doc_id: str = ""
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class EvaluationGap(BaseModel):
    gap: str
    why_it_matters: str = ""
    suggested_source: str = ""
    priority: str = "medium"


class RecommendedRecord(BaseModel):
    title: str
    custodian: str = ""
    record_type: str = ""
    reason: str = ""
    request_language: str = ""
    priority: str = "medium"


class CaseEvaluationResult(BaseModel):
    executive_summary: str = ""
    likely_claims: list[str] = Field(default_factory=list)
    issue_areas: list[EvaluationIssueArea] = Field(default_factory=list)
    timeline: list[EvaluationTimelineEvent] = Field(default_factory=list)
    evidence_strength: EvidenceStrength = EvidenceStrength.UNKNOWN
    gaps: list[EvaluationGap] = Field(default_factory=list)
    recommended_records: list[RecommendedRecord] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    risk_flags: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class CaseEvaluation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    workspace_id: str
    case_id: str
    status: EvaluationStatus = EvaluationStatus.QUEUED
    model_tier: str = "free"
    workflow_steps: list[str] = Field(default_factory=list)
    result: Optional[CaseEvaluationResult] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class AgentRun(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    workspace_id: str
    case_id: str
    evaluation_id: str
    agent_id: str
    status: str = "queued"
    model_id: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cached: bool = False
    error: Optional[str] = None
    data: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    completed_at: Optional[datetime] = None


class UsageEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    workspace_id: str
    event_type: str
    case_id: str = ""
    quantity: int = 1
    data: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)


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
    case_id: str = "crowley-v-usd232"
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
    created_at: datetime = Field(default_factory=utc_now)


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
    workspace_id: str = "demo"
    case_id: str = "crowley-v-usd232"
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
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


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
    workspace_id: str = "demo"
    case_id: str = "crowley-v-usd232"
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

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ResearchJob(BaseModel):
    """Tracks async research pipeline execution."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    workspace_id: str = "demo"
    case_id: str = "crowley-v-usd232"
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
    workspace_id: str = "demo"
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
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


# ---------------------------------------------------------------------------
# Document intake
# ---------------------------------------------------------------------------

class CaseDocument(BaseModel):
    """An uploaded document (PDF, image, Word, email, etc.) ingested into Qdrant."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    workspace_id: str = "demo"
    case_id: str = "crowley-v-usd232"
    filename: str = ""
    file_type: str = Field(default="", description="pdf | image | docx | eml | txt")
    file_size: int = 0
    mime_type: str = ""
    evidence_type: str = ""
    inferred_category: str = ""
    category_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list)
    user_description: str = ""
    document_date: Optional[str] = None
    source_person: str = ""
    storage_path: str = ""
    preview_path: str = ""
    thumbnail_path: str = ""
    content_sha256: str = ""
    source_zip_path: str = ""
    source_zip_paths: list[str] = Field(default_factory=list)
    import_batch_id: str = ""
    page_count: int = 0
    ocr_status: str = Field(default="not_required", description="not_required | queued | completed | failed | skipped")
    duplicate_of_doc_id: str = ""
    duplicate_source_paths: list[str] = Field(default_factory=list)
    kora_response_source: str = ""
    analysis_flags: list[str] = Field(default_factory=list)
    entity_ids: list[str] = Field(default_factory=list)
    person_ids: list[str] = Field(default_factory=list)
    kora_request_id: str = ""
    source: str = Field(default="manual_upload", description="kora_response | manual_upload | email_export")
    email_message_id: str = ""
    email_thread_id: str = ""
    email_subject: str = ""
    email_from: str = ""
    email_to: list[str] = Field(default_factory=list)
    email_date: Optional[str] = None
    email_attachment_id: str = ""
    email_source_connection_id: str = ""
    email_import_run_id: str = ""
    parent_document_id: str = ""
    attachment_ids: list[str] = Field(default_factory=list)
    extracted_text: str = ""
    chunk_count: int = 0
    qdrant_point_ids: list[str] = Field(default_factory=list)
    facts_extracted: int = 0
    document_summary: str = ""
    case_relevance: str = ""
    relevance_score: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence_role: str = ""
    relevance_basis: str = ""
    relevance_factors: list[str] = Field(default_factory=list)
    relevance_model: str = ""
    legal_flags: list[str] = Field(default_factory=list)
    extraction_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    insight_status: str = Field(default="pending", description="pending | ready | failed | skipped")
    insight_error: str = ""
    insight_generated_at: Optional[datetime] = None
    insight_model: str = ""
    status: str = Field(default="processing", description="processing | indexed | failed")
    processing_status: str = Field(default="processing", description="uploaded | processing | indexed | needs_review | failed")
    failure_reason: Optional[str] = None
    error: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=utc_now)
    processed_at: Optional[datetime] = None


class CaseDocumentUpdate(BaseModel):
    evidence_type: Optional[str] = None
    inferred_category: Optional[str] = None
    tags: Optional[list[str]] = None
    user_description: Optional[str] = None
    document_date: Optional[str] = None
    source_person: Optional[str] = None


class GmailImportRule(BaseModel):
    domains: list[str] = Field(default_factory=list)
    email_addresses: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    include_attachments: bool = True
    auto_sync: bool = False


class GmailConnection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    workspace_id: str
    case_id: str = ""
    google_email: str = ""
    status: str = Field(default="setup_required", description="setup_required | connected | disconnected | error")
    scopes: list[str] = Field(default_factory=lambda: ["https://www.googleapis.com/auth/gmail.readonly"])
    rule: GmailImportRule = Field(default_factory=GmailImportRule)
    encrypted_refresh_token: str = ""
    oauth_state_hash: str = ""
    oauth_state_expires_at: Optional[datetime] = None
    last_history_id: str = ""
    watch_expires_at: Optional[datetime] = None
    last_sync_at: Optional[datetime] = None
    token_last_refreshed_at: Optional[datetime] = None
    connected_at: Optional[datetime] = None
    disconnected_at: Optional[datetime] = None
    error: str = ""
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class GmailImportRun(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    workspace_id: str
    case_id: str
    connection_id: str = ""
    status: str = Field(default="queued", description="queued | running | complete | failed | needs_oauth")
    rule: GmailImportRule = Field(default_factory=GmailImportRule)
    matched_messages: int = 0
    imported_messages: int = 0
    imported_attachments: int = 0
    query: str = ""
    message_ids: list[str] = Field(default_factory=list)
    imported_document_ids: list[str] = Field(default_factory=list)
    skipped_messages: int = 0
    error: str = ""
    started_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    completed_at: Optional[datetime] = None
