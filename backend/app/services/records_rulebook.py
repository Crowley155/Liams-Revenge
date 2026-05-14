from __future__ import annotations

from app.models import JurisdictionRulePack, LegalAuthoritySource

SOURCE_RETRIEVED_AT = "2026-05-14"
RULE_PACK_VERSION = "records_rulebook_v1_2026-05-14"


def _source(
    rule_id: str,
    title: str,
    url: str,
    summary: str,
    jurisdiction: str,
    source_type: str = "official_guidance",
    effective_date: str = "",
) -> LegalAuthoritySource:
    return LegalAuthoritySource(
        rule_id=rule_id,
        title=title,
        url=url,
        summary=summary,
        jurisdiction=jurisdiction,
        source_type=source_type,
        effective_date=effective_date,
        retrieved_at=SOURCE_RETRIEVED_AT,
    )


FEDERAL_FERPA_SOURCE = _source(
    "US_FERPA_PART_99",
    "Family Educational Rights and Privacy Act regulations, 34 CFR Part 99",
    "https://www.ecfr.gov/current/title-34/subtitle-A/part-99",
    "Federal education-records rules parents can use to request access to their child's education records.",
    "US",
    "regulation",
)

FEDERAL_IDEA_SOURCE = _source(
    "US_IDEA_PART_300_RECORDS",
    "IDEA Part B regulations, 34 CFR Part 300",
    "https://www.ecfr.gov/current/title-34/subtitle-B/chapter-III/part-300",
    "Federal special-education rules relevant to IEP, evaluation, placement, and procedural-safeguard records.",
    "US",
    "regulation",
)

FERPA_GUIDANCE_SOURCE = _source(
    "US_ED_FERPA_GUIDANCE",
    "U.S. Department of Education FERPA guidance",
    "https://studentprivacy.ed.gov/ferpa",
    "Official Department of Education parent-facing FERPA guidance.",
    "US",
    "official_guidance",
)

PILOT_STATE_RULE_PACKS: dict[str, JurisdictionRulePack] = {
    "KS": JurisdictionRulePack(
        rule_pack_id="KS_PUBLIC_RECORDS_KORA",
        jurisdiction="KS",
        name="Kansas public records",
        version=RULE_PACK_VERSION,
        public_records_law_code="KS_KORA",
        public_records_law_label="Kansas Open Records Act",
        public_records_citation="K.S.A. 45-215 et seq.",
        request_deadline="Kansas agencies generally respond within three business days.",
        sources=[
            _source(
                "KS_AG_KORA",
                "Kansas Attorney General Open Government - KORA",
                "https://www.ag.ks.gov/open-government/kora",
                "Official Kansas Attorney General guidance on the Kansas Open Records Act.",
                "KS",
            ),
        ],
        notes=["Use only for Kansas public agencies or Kansas public records requests."],
    ),
    "MO": JurisdictionRulePack(
        rule_pack_id="MO_PUBLIC_RECORDS_SUNSHINE",
        jurisdiction="MO",
        name="Missouri public records",
        version=RULE_PACK_VERSION,
        public_records_law_code="MO_SUNSHINE",
        public_records_law_label="Missouri Sunshine Law",
        public_records_citation="Chapter 610, RSMo",
        request_deadline="Missouri public governmental bodies should respond as soon as possible and no later than three business days unless additional time is needed.",
        sources=[
            _source(
                "MO_AG_SUNSHINE",
                "Missouri Attorney General Sunshine Law",
                "https://ago.mo.gov/missouri-law/sunshine-law/",
                "Official Missouri Attorney General guidance on Missouri's Sunshine Law.",
                "MO",
            ),
        ],
        notes=["Use for Missouri public governmental bodies."],
    ),
    "CA": JurisdictionRulePack(
        rule_pack_id="CA_PUBLIC_RECORDS_CPRA",
        jurisdiction="CA",
        name="California public records",
        version=RULE_PACK_VERSION,
        public_records_law_code="CA_PUBLIC_RECORDS",
        public_records_law_label="California Public Records Act",
        public_records_citation="California Government Code section 7920.000 et seq.",
        request_deadline="California agencies generally determine whether records are disclosable within 10 days, with limited extension rights.",
        sources=[
            _source(
                "CA_AG_PUBLIC_RECORDS",
                "California Department of Justice Public Records",
                "https://oag.ca.gov/public-records",
                "Official California Department of Justice page for Public Records Act requests.",
                "CA",
            ),
        ],
        notes=["Use for California state or local public agencies."],
    ),
    "TX": JurisdictionRulePack(
        rule_pack_id="TX_PUBLIC_INFORMATION_ACT",
        jurisdiction="TX",
        name="Texas public information",
        version=RULE_PACK_VERSION,
        public_records_law_code="TX_PUBLIC_INFORMATION",
        public_records_law_label="Texas Public Information Act",
        public_records_citation="Texas Government Code Chapter 552",
        request_deadline="Texas agencies generally must promptly produce records or seek an attorney general ruling when withholding information.",
        sources=[
            _source(
                "TX_AG_OPEN_GOVERNMENT",
                "Texas Attorney General Open Government",
                "https://www.texasattorneygeneral.gov/open-government/members-public",
                "Official Texas Attorney General public guidance on open government and the Public Information Act.",
                "TX",
            ),
        ],
        notes=["Use for Texas governmental bodies."],
    ),
    "FL": JurisdictionRulePack(
        rule_pack_id="FL_PUBLIC_RECORDS_CH119",
        jurisdiction="FL",
        name="Florida public records",
        version=RULE_PACK_VERSION,
        public_records_law_code="FL_PUBLIC_RECORDS",
        public_records_law_label="Florida Public Records Law",
        public_records_citation="Chapter 119, Florida Statutes",
        request_deadline="Florida public records should be made available within a reasonable time under Chapter 119.",
        sources=[
            _source(
                "FL_STATUTES_CH119",
                "Florida Statutes Chapter 119",
                "https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0100-0199/0119/0119.html",
                "Official Florida statutory text for public records.",
                "FL",
                "statute",
            ),
            _source(
                "FL_AG_OPEN_GOVERNMENT",
                "Florida Attorney General Open Government",
                "https://www.myfloridalegal.com/open-government/open-government-resources",
                "Official Florida Attorney General open government resources.",
                "FL",
            ),
        ],
        notes=["Use for Florida state and local public agencies."],
    ),
    "NY": JurisdictionRulePack(
        rule_pack_id="NY_FREEDOM_OF_INFORMATION_LAW",
        jurisdiction="NY",
        name="New York public records",
        version=RULE_PACK_VERSION,
        public_records_law_code="NY_FOIL",
        public_records_law_label="New York Freedom of Information Law",
        public_records_citation="Public Officers Law Article 6",
        request_deadline="New York agencies generally acknowledge receipt within five business days and provide a status or response path.",
        sources=[
            _source(
                "NY_COOG_FOIL",
                "New York Committee on Open Government FOIL",
                "https://opengovernment.ny.gov/freedom-information-law",
                "Official New York State Committee on Open Government FOIL resource.",
                "NY",
            ),
        ],
        notes=["Use for New York state or local agencies subject to FOIL."],
    ),
}


def normalize_state(value: str) -> str:
    return (value or "").strip().upper()


def get_rule_pack(state: str) -> JurisdictionRulePack | None:
    return PILOT_STATE_RULE_PACKS.get(normalize_state(state))


def list_rule_packs() -> list[JurisdictionRulePack]:
    return [PILOT_STATE_RULE_PACKS[key] for key in sorted(PILOT_STATE_RULE_PACKS)]
