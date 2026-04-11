import { useState } from 'react';
import DocLink from '../components/DocLink';

const SECTIONS = [
  {
    id: 'lease',
    title: 'Lease Obligations',
    subtitle: 'What the USD 232-JCPRD lease requires — and what JCPRD actually does',
    color: '#ffb347',
    rules: [
      {
        rule: 'Follow all Board of Education rules, regulations, and policies',
        source: 'Lease Agreement §8(d) / §7(c)',
        sourceId: 'DOC-021',
        requires:
          'Section 8(d) requires JCPRD to abide by every USD 232 board policy as a condition of operating on school property — including JDDC (bullying), JGFB (supervision), KG (employee on duty), JDDB (crime reporting), and all others. Section 7(c) gives the district enforcement authority to remedy any material breach of the lease, including failures to comply with §8(d).',
        actual:
          'JCPRD\'s own published handbook states: "our programs function independently in both policy and procedure. We are guests of the school." They explicitly disclaim the obligation the lease imposes. This is a material breach of §8(d) — and the district has the right under §7(c) to remedy it. Neither enforcement mechanism was used.',
        evidenceIds: ['AUTH-41', 'DOC-021'],
        status: 'violated',
      },
      {
        rule: 'Anti-bullying policy applies on school property',
        source: 'USD 232 Policy JDDC / K.S.A. 72-6147',
        sourceId: 'AUTH-02',
        requires:
          'K.S.A. 72-6147 requires every school district to maintain an anti-bullying plan. USD 232\'s JDDC policy implements this. The statute and the policy apply on school property regardless of time of day. The lease requires JCPRD to follow this policy.',
        actual:
          'After a kindergartener was assaulted by a nine-year-old on school property, neither JCPRD nor USD 232 initiated any bullying investigation or applied the JDDC policy. Principal Balthazor called JCPRD a "separate entity." The district treated the after-school timing as a jurisdictional shield despite its own policy containing no such limitation.',
        evidenceIds: ['DOC-004', 'DOC-009'],
        status: 'violated',
      },
      {
        rule: 'Disciplinary authority is location-based, not time-based',
        source: 'K.S.A. 72-6114',
        sourceId: 'AUTH-01',
        requires:
          'Kansas statute gives school districts discipline authority based on where something happens (school property), not when it happens. The after-school timing does not eliminate the district\'s authority.',
        actual:
          'USD 232 took no disciplinary action and disclaimed jurisdiction. Alvie Cater\'s emails redirect the parent to JCPRD, framing the incident as entirely outside USD 232\'s purview despite it occurring on school grounds.',
        evidenceIds: ['DOC-012', 'DOC-014'],
        status: 'violated',
      },
    ],
  },
  {
    id: 'board-policy',
    title: 'Board Policy Violations',
    subtitle:
      'Specific USD 232 board policies that JCPRD is contractually bound to follow under Lease §8(d) — and evidence none were applied',
    color: '#c084fc',
    rules: [
      {
        rule: 'A school employee must be on duty when non-school groups use school facilities',
        source: 'USD 232 Board Policy KG',
        sourceId: 'BP-01',
        requires:
          'Policy KG states: "Whenever any school facility is used by non-school groups or individuals, a school employee shall be on duty to see that the building and equipment are properly used." JCPRD is a non-school group using school facilities. The policy requires a district employee present during their operation.',
        actual:
          'No USD 232 employee was on duty at Mize Elementary during the JCPRD OST program when the assault occurred. The district takes the position that once the school day ends, the building belongs to JCPRD. Their own policy says otherwise.',
        evidenceIds: ['BP-01', 'DOC-021', 'DOC-004'],
        status: 'violated',
      },
      {
        rule: 'All school-sponsored activities must be supervised by an administration-approved adult',
        source: 'USD 232 Board Policy JGFB / JH',
        sourceId: 'BP-02',
        requires:
          'JGFB: "All school-sponsored activities shall be supervised by an adult approved by the administration." JH: "The principal shall be responsible for organizing and approving all student activities." The district\'s own website presents JCPRD OST as a service USD 232 "offers" — meeting the definition of school-sponsored. Under these policies, the principal should have approved supervisors.',
        actual:
          'JCPRD staff were never approved by the Mize Elementary principal or any USD 232 administrator. The district disclaims any role in organizing, approving, or supervising the program despite presenting it to families as a district service on their website.',
        evidenceIds: ['BP-02', 'BP-05', 'BP-09', 'DOC-004'],
        status: 'violated',
      },
      {
        rule: 'Administration must implement a bullying plan covering school property',
        source: 'USD 232 Board Policy JDDC',
        sourceId: 'BP-03',
        requires:
          'JDDC: "The administration shall implement a plan to address bullying on school property, in a school vehicle or at a school-sponsored activity or event." This applies "at school, on school property, and at all school-sponsored activities, programs, or events" with no time-of-day limitation.',
        actual:
          'No bullying investigation was initiated after a kindergartener was assaulted by a nine-year-old on school property. Principal Balthazor called JCPRD a "separate entity." The JDDC policy contains no carve-out for after-school programs — it applies to conduct on school property, period.',
        evidenceIds: ['BP-03', 'DOC-004', 'DOC-009'],
        status: 'violated',
      },
      {
        rule: 'Principal must report assaults on school property to law enforcement',
        source: 'USD 232 Board Policy JDDB',
        sourceId: 'BP-04',
        requires:
          'JDDB: "Whenever a student engages in conduct which constitutes the commission of any misdemeanor or felony, at school, on school property, or at a school supervised activity and/or has been found... to have engaged in behavior... which has resulted in or was substantially likely to have resulted in serious bodily injury to others, the principal shall report such act to the appropriate law enforcement agency." This is mandatory — "shall," not "may."',
        actual:
          'A six-year-old was physically assaulted on school property and required medical attention. No evidence that Principal Balthazor or any USD 232 administrator reported the incident to law enforcement. The mandatory duty under JDDB was not fulfilled.',
        evidenceIds: ['BP-04', 'DOC-009', 'DOC-004'],
        status: 'violated',
      },
    ],
  },
  {
    id: 'kdhe',
    title: 'KDHE Licensing Obligations',
    subtitle: 'What Kansas law requires of JCPRD as a licensed child care facility',
    color: '#ff6b6b',
    rules: [
      {
        rule: 'Operate with strict regard to health, comfort, safety, and social welfare',
        source: 'K.S.A. 65-508',
        sourceId: 'AUTH-45',
        requires:
          'Every KDHE-licensed facility must operate "with strict regard to the health, comfort, safety, and social welfare of such children." This is not aspirational — it is a legal condition of the license JCPRD holds and prominently advertises.',
        actual:
          'Five staff were outside and none witnessed the assault on a six-year-old. The incident report contradicted medical evidence. No follow-up investigation was conducted. JCPRD Site Coordinator responded to the parent with: "I am sorry you feel [child] is being harmed."',
        evidenceIds: ['DOC-009', 'DOC-017'],
        status: 'violated',
      },
      {
        rule: 'Staff must maintain active awareness of and responsibility for each child',
        source: 'K.A.R. 28-4-420',
        sourceId: 'AUTH-08',
        requires:
          'KDHE regulation requires staff to have "active awareness of and responsibility for each child\'s activity." This means knowing where each child is and what they are doing — not just being physically present in the area.',
        actual:
          'Five staff were outside during the assault and none saw it happen. Even if JCPRD\'s marketed 1:15 staff-to-child ratio was numerically met, five adults present and none witnessing a physical assault is a failure of active awareness — not a staffing shortage. JCPRD Manager Jennifer Anderson admitted the incident report "does not include later information," meaning it was knowingly incomplete.',
        evidenceIds: ['DOC-017', 'AUTH-08'],
        status: 'violated',
      },
    ],
  },
  {
    id: 'district',
    title: 'District Obligations',
    subtitle:
      'What USD 232 owes — through the lease it created, the statutes it operates under, and the authority it chose not to use',
    color: '#6c8aff',
    rules: [
      {
        rule: 'Lease §8(d) creates the obligation and §7(c) gives the district the remedy — neither was used',
        source: 'Lease Agreement §7(c) / §8(d)',
        sourceId: 'DOC-021',
        requires:
          'Section 8(d) requires JCPRD to "abide by... all rules, regulations, and policies adopted by the Board of Education" and "conform to such administrative orders as may be from time to time issued by the Superintendent." Section 7(c) provides the district\'s enforcement authority: if JCPRD materially breaches the lease — including the policy-compliance obligations in §8(d) — the district has the contractual right to remedy that breach. The district wrote both the obligation AND the enforcement mechanism into the same lease.',
        actual:
          'After the April 2026 assault, no enforcement action was taken under either §8(d) or §7(c). The parent cited the lease agreement directly. Alvie Cater proposed a meeting, then cancelled it the next morning. No administrative order was issued under §8(d). No breach remedy was pursued under §7(c). No audit of JCPRD\'s policy compliance was conducted. The district created a contract with two enforcement tools — the Superintendent\'s administrative order authority (§8(d)) and the lessor\'s right to remedy material breach (§7(c)) — and used neither.',
        evidenceIds: ['DOC-021', 'DOC-014', 'DOC-012'],
        status: 'violated',
      },
      {
        rule: 'K.S.A. 72-1421(c) binds the district to the entire KDHE child care licensing chapter',
        source: 'K.S.A. 72-1421(c)',
        sourceId: 'AUTH-51',
        requires:
          'K.S.A. 72-1421(c): "Every school district which establishes, operates and maintains a child care facility shall be subject to the provisions contained in article 5 of chapter 65." This imports the full KDHE licensing framework: duty of care (65-508), mandatory inspections (65-512), record-keeping (65-507), license revocation (65-504), emergency suspension (65-524), civil fines up to $500/day (65-526), and criminal penalties (65-514).\n\nSTATUTORY CONSTRUCTION — WHY THIS APPLIES:\n\n1. IDENTICAL LANGUAGE: 72-1421(a)(3) authorizes the board to "contract with... any public or private agency... for the establishment, operation and maintenance of a child care facility." Subsection (c) applies to districts that "establish, operate and maintain." The legislature used the same operative words in both provisions — contracting for "establishment, operation and maintenance" IS establishing, operating, and maintaining through a contractual vehicle.\n\n2. SUBSECTION (d) CONFIRMS IT: The definition section says "child" includes children of districts that "establishes, operates and maintains, or cooperates in the establishment, operation and maintenance of" a facility. The "or cooperates in" language explicitly broadens the statute beyond direct operation to cover cooperative/contracted arrangements.\n\n3. 72-3215 COMPARISON: The parallel preschool statute has the exact same (a)(1-4) structure but deliberately OMITS a subsection (c). The legislature intentionally added KDHE binding for child care and omitted it for preschool — proving subsection (c) was purposeful, not accidental.\n\n4. ARTICLE 14 PLACEMENT: The statute sits in "Provisions Relating To The Use Of School District Property." It was designed for arrangements where school property is used for child care — lease-based arrangements are the primary use case.\n\n5. PURPOSIVE CONSTRUCTION: If outsourcing under (a)(3) defeats the KDHE obligation in (c), then the provision is nullified by the very mechanism the statute authorizes. The legislature did not write (c) to be defeated by (a)(3).\n\n6. DISTRICT\'S OWN CHARACTERIZATION: USD 232 says it "offers" this programming (website), calls it "invaluable childcare" (Schwanz memo), titled the consent agenda "School Age Childcare Programs," and Cater wrote it "operates as a licensed childcare provider." A district that "offers" childcare has "established" it.',
        actual:
          'USD 232 disclaimed any oversight role. Balthazor called JCPRD a "separate entity." Cater stated JCPRD "operates independently."\n\nDEFENSE ARGUMENTS AND REBUTTALS:\n\nDefense will argue "establishes, operates and maintains" is conjunctive — the district doesn\'t directly "operate" the program. Rebuttal: Subsection (d) already broadens this to include cooperative arrangements. The district\'s own website says it "offers" the programming.\n\nDefense will argue JCPRD holds its own KDHE license — the district is just a landlord. Rebuttal: A landlord doesn\'t title its board agenda "School Age Childcare Programs," call the arrangement "invaluable childcare," or present it on its website under "Family and Student Services" as a service it "offers."\n\nDefense will argue the lease is under 72-1150 (general leasing), not 72-1421. Rebuttal: The statutory authority under which the lease was drafted doesn\'t change the characterization of the arrangement. If the arrangement IS a child care facility on school property, 72-1421(c) applies by its own terms.\n\nNo Kansas court has ruled on this specific question. But the statutory text, structure, and the district\'s own admissions all favor the parent.',
        evidenceIds: [
          'AUTH-51',
          'AUTH-43',
          'DOC-012',
          'DOC-004',
          'BP-09',
        ],
        status: 'violated',
      },
      {
        rule: 'Neither entity filed a KDHE complaint or informed the parent of the right to do so',
        source: 'K.S.A. 65-512',
        sourceId: 'AUTH-59',
        requires:
          'K.S.A. 65-512 mandates that KDHE "shall conduct an inspection of any child care facility upon receiving a complaint." The parent of a child assaulted in a KDHE-licensed facility has the right to trigger a complaint-based inspection. This right exists regardless of 72-1421 — it applies to any KDHE-licensed program.',
        actual:
          'After the April 2026 assault, no KDHE complaint was filed by JCPRD or USD 232. The parent was not informed of the complaint mechanism. Instead, both entities redirected the parent between each other. Alvie Cater\'s email references KDHE but only as a deflection ("concerns regarding their actions or compliance would need to be addressed directly with JCPRD and, if necessary, KDHE") — not as actionable guidance about the parent\'s right to trigger an inspection.',
        evidenceIds: ['AUTH-59', 'DOC-012', 'DOC-014'],
        status: 'violated',
      },
      {
        rule: 'Facility must maintain complete records of each child, including physician for injuries',
        source: 'K.S.A. 65-507',
        sourceId: 'AUTH-58',
        requires:
          'K.S.A. 65-507 requires child care facilities to keep records including "the name and age of each child received and cared for in the facility" and "the name of the physician who attended any sick children." This applies directly to JCPRD as a licensed facility.',
        actual:
          'JCPRD Manager Jennifer Anderson admitted the incident report "does not include later information," meaning it was knowingly incomplete. The initial report contradicted medical evidence. A knowingly incomplete incident report for a child who required medical attention may violate the statutory record-keeping requirement.',
        evidenceIds: ['AUTH-58', 'DOC-017', 'DOC-009'],
        status: 'violated',
      },
    ],
  },
];

export default function NonCompliance() {
  const [activeSection, setActiveSection] = useState('lease');

  const totalViolations = SECTIONS.reduce(
    (sum, s) => sum + s.rules.filter((r) => r.status === 'violated').length,
    0,
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-1">Non-Compliance Breakdown</h2>
        <p className="text-xs text-text-dim mb-2">
          Rules, contracts, and statutes JCPRD and USD 232 are obligated to follow — and evidence they don't.
        </p>
        <div className="flex gap-3 items-center mt-3">
          <span className="text-sm font-medium text-danger">
            {totalViolations} documented violations
          </span>
          <span className="text-xs text-text-dim">across {SECTIONS.length} categories</span>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-border pb-px overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`px-4 py-2 text-xs font-medium rounded-t-md transition-colors whitespace-nowrap border-b-2 ${
              activeSection === s.id
                ? 'border-current text-accent bg-accent/5'
                : 'border-transparent text-text-dim hover:text-text'
            }`}
            style={activeSection === s.id ? { borderColor: s.color, color: s.color } : {}}
          >
            {s.title}
            <span className="ml-2 text-[10px] opacity-60">
              ({s.rules.filter((r) => r.status === 'violated').length})
            </span>
          </button>
        ))}
      </div>

      {/* Active Section Content */}
      {SECTIONS.filter((s) => s.id === activeSection).map((section) => (
        <div key={section.id} className="space-y-4">
          <div className="mb-2">
            <h3 className="text-lg font-bold" style={{ color: section.color }}>
              {section.title}
            </h3>
            <p className="text-xs text-text-dim">{section.subtitle}</p>
          </div>

          {section.rules.map((rule, ri) => (
            <RuleCard key={ri} rule={rule} color={section.color} />
          ))}
        </div>
      ))}

      {/* Summary */}
      <div className="border-t border-border pt-6 mt-8">
        <div className="bg-surface-alt border border-border rounded-lg p-5">
          <h4 className="text-sm font-bold mb-2">The Pattern</h4>
          <p className="text-sm leading-relaxed text-text-dim">
            Across every category — the lease, KDHE licensing, and district statutes — the pattern
            is the same. Rules exist. Obligations are clear. Marketing promises safety and
            integration. But when a child is harmed, both entities disclaim responsibility, refuse to
            investigate, and redirect the parent to the other party. The rules aren't ambiguous.
            They're just not followed.
          </p>
        </div>
      </div>
    </div>
  );
}

function RuleCard({ rule, color }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="bg-surface border border-border rounded-lg overflow-hidden"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-surface-alt/50 transition-colors"
      >
        <StatusIcon status={rule.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{rule.rule}</p>
          <p className="text-[11px] text-text-dim mt-0.5">
            {rule.source}{' '}
            <span className="ml-1 text-accent">
              <DocLink id={rule.sourceId}>{rule.sourceId}</DocLink>
            </span>
          </p>
        </div>
        <span className="text-text-dim text-xs mt-1 shrink-0">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-0 space-y-4 border-t border-border/50">
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-dim mb-1.5">
                What the rule requires
              </p>
              <p className="text-xs leading-relaxed">{rule.requires}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-danger mb-1.5">
                What actually happened
              </p>
              <p className="text-xs leading-relaxed">{rule.actual}</p>
            </div>
          </div>
          {rule.evidenceIds?.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="text-[10px] text-text-dim uppercase tracking-wider self-center mr-1">
                Evidence:
              </span>
              {rule.evidenceIds.map((id) => (
                <DocLink key={id} id={id} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }) {
  if (status === 'violated') {
    return (
      <span className="w-6 h-6 rounded-full bg-danger/15 text-danger flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
        ✕
      </span>
    );
  }
  return (
    <span className="w-6 h-6 rounded-full bg-yellow-500/15 text-yellow-500 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
      ?
    </span>
  );
}
