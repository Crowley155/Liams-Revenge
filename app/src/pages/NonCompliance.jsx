import { useState } from 'react';
import DocLink from '../components/DocLink';

const SECTIONS = [
  {
    id: 'lease',
    title: 'Lease Obligations',
    subtitle: 'What the USD 232-JCPRD lease requires — and what JCPRD actually does',
    color: 'var(--color-warning)',
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
        status: 'not_applied',
      },
      {
        rule: 'Anti-bullying policy applies on school property',
        source: 'USD 232 Policy JDDC / K.S.A. 72-6147',
        sourceId: 'AUTH-02',
        requires:
          'K.S.A. 72-6147 requires every school district to maintain an anti-bullying plan. USD 232\'s JDDC policy implements this. The statute and the policy apply on school property regardless of time of day. The lease requires JCPRD to follow this policy.',
        actual:
          'After a kindergartener was assaulted by a nine-year-old on school property, no bullying investigation was initiated under the JDDC policy by either JCPRD or USD 232, based on available records. Principal Balthazor referred to JCPRD as a "separate entity" (DOC-004). The after-school timing appears to have been treated as a jurisdictional boundary, though the policy text contains no such limitation.',
        evidenceIds: ['DOC-004', 'DOC-009'],
        status: 'not_applied',
      },
      {
        rule: 'Disciplinary authority is location-based, not time-based',
        source: 'K.S.A. 72-6114',
        sourceId: 'AUTH-01',
        requires:
          'Kansas statute gives school districts discipline authority based on where something happens (school property), not when it happens. The after-school timing does not eliminate the district\'s authority.',
        actual:
          'Based on available records, USD 232 took no disciplinary action. Alvie Cater\'s emails (DOC-012, DOC-014) redirect the parent to JCPRD, characterizing the incident as outside USD 232\'s purview, though it occurred on school grounds.',
        evidenceIds: ['DOC-012', 'DOC-014'],
        status: 'not_applied',
      },
    ],
  },
  {
    id: 'board-policy',
    title: 'Board Policy Compliance',
    subtitle:
      'Specific USD 232 board policies that JCPRD is contractually bound to follow under Lease §8(d), and what the evidence shows',
    color: '#c084fc',
    rules: [
      {
        rule: 'A school employee must be on duty when non-school groups use school facilities',
        source: 'USD 232 Board Policy KG',
        sourceId: 'BP-01',
        requires:
          'Policy KG states: "Whenever any school facility is used by non-school groups or individuals, a school employee shall be on duty to see that the building and equipment are properly used." JCPRD is a non-school group using school facilities. The policy requires a district employee present during their operation.',
        actual:
          'Based on available records, no USD 232 employee was on duty at Mize Elementary during the JCPRD OST program when the assault occurred. The district\'s position appears to be that the building is under JCPRD\'s control after school hours, though the policy text does not include that distinction.',
        evidenceIds: ['BP-01', 'DOC-021', 'DOC-004'],
        status: 'not_applied',
      },
      {
        rule: 'All school-sponsored activities must be supervised by an administration-approved adult',
        source: 'USD 232 Board Policy JGFB / JH',
        sourceId: 'BP-02',
        requires:
          'JGFB: "All school-sponsored activities shall be supervised by an adult approved by the administration." JH: "The principal shall be responsible for organizing and approving all student activities." The district\'s own website presents JCPRD OST as a service USD 232 "offers" — meeting the definition of school-sponsored. Under these policies, the principal should have approved supervisors.',
        actual:
          'Based on available records, JCPRD staff were not approved by the Mize Elementary principal or any USD 232 administrator. The district does not appear to play a role in organizing or supervising the program, though it presents the program to families as a service it "offers" on its website (BP-09).',
        evidenceIds: ['BP-02', 'BP-05', 'BP-09', 'DOC-004'],
        status: 'not_applied',
      },
      {
        rule: 'Administration must implement a bullying plan covering school property',
        source: 'USD 232 Board Policy JDDC',
        sourceId: 'BP-03',
        requires:
          'JDDC: "The administration shall implement a plan to address bullying on school property, in a school vehicle or at a school-sponsored activity or event." This applies "at school, on school property, and at all school-sponsored activities, programs, or events" with no time-of-day limitation.',
        actual:
          'Based on available records, no bullying investigation was initiated after a kindergartener was assaulted by a nine-year-old on school property. Principal Balthazor referred to JCPRD as a "separate entity" (DOC-004). The JDDC policy text contains no carve-out for after-school programs.',
        evidenceIds: ['BP-03', 'DOC-004', 'DOC-009'],
        status: 'not_applied',
      },
      {
        rule: 'Principal must report assaults on school property to law enforcement',
        source: 'USD 232 Board Policy JDDB',
        sourceId: 'BP-04',
        requires:
          'JDDB: "Whenever a student engages in conduct which constitutes the commission of any misdemeanor or felony, at school, on school property, or at a school supervised activity and/or has been found... to have engaged in behavior... which has resulted in or was substantially likely to have resulted in serious bodily injury to others, the principal shall report such act to the appropriate law enforcement agency." This is mandatory — "shall," not "may."',
        actual:
          'A six-year-old was physically assaulted on school property and required medical attention. Based on available records, there is no evidence that Principal Balthazor or any USD 232 administrator reported the incident to law enforcement as required by JDDB.',
        evidenceIds: ['BP-04', 'DOC-009', 'DOC-004'],
        status: 'not_applied',
      },
    ],
  },
  {
    id: 'kdhe',
    title: 'KDHE Licensing Obligations',
    subtitle: 'What Kansas law requires of JCPRD as a licensed child care facility',
    color: 'var(--color-danger)',
    rules: [
      {
        rule: 'Operate with strict regard to health, comfort, safety, and social welfare',
        source: 'K.S.A. 65-508',
        sourceId: 'AUTH-45',
        requires:
          'Every KDHE-licensed facility must operate "with strict regard to the health, comfort, safety, and social welfare of such children." This is not aspirational — it is a legal condition of the license JCPRD holds and prominently advertises.',
        actual:
          'According to the incident report (DOC-017), five staff were outside and none witnessed the assault on a six-year-old. The incident report appears to contradict medical evidence. Based on available records, no follow-up investigation was conducted. JCPRD Site Coordinator responded to the parent with: "I am sorry you feel [child] is being harmed" (DOC-009).',
        evidenceIds: ['DOC-009', 'DOC-017'],
        status: 'not_applied',
      },
      {
        rule: 'Staff must maintain active awareness of and responsibility for each child',
        source: 'K.A.R. 28-4-420',
        sourceId: 'AUTH-08',
        requires:
          'KDHE regulation requires staff to have "active awareness of and responsibility for each child\'s activity." This means knowing where each child is and what they are doing — not just being physically present in the area.',
        actual:
          'According to the incident report, five staff were outside during the assault and none observed it. JCPRD Manager Jennifer Anderson stated that the incident report "does not include later information" (DOC-017), indicating it was incomplete at the time of filing.',
        evidenceIds: ['DOC-017', 'AUTH-08'],
        status: 'not_applied',
      },
    ],
  },
  {
    id: 'district',
    title: 'District Obligations',
    subtitle:
      'What USD 232 owes through the lease it created, the statutes it operates under, and the authority available to it',
    color: 'var(--color-accent)',
    rules: [
      {
        rule: 'Lease §8(d) creates the obligation and §7(c) gives the district the remedy — neither was used',
        source: 'Lease Agreement §7(c) / §8(d)',
        sourceId: 'DOC-021',
        requires:
          'Section 8(d) requires JCPRD to "abide by... all rules, regulations, and policies adopted by the Board of Education" and "conform to such administrative orders as may be from time to time issued by the Superintendent." Section 7(c) provides the district\'s enforcement authority: if JCPRD materially breaches the lease — including the policy-compliance obligations in §8(d) — the district has the contractual right to remedy that breach. The district wrote both the obligation AND the enforcement mechanism into the same lease.',
        actual:
          'Based on available records, after the April 2026 assault, no enforcement action was taken under either §8(d) or §7(c). The parent cited the lease agreement directly. Alvie Cater proposed a meeting, then cancelled it the following morning (DOC-014). No administrative order appears to have been issued under §8(d). No breach remedy appears to have been pursued under §7(c). No audit of JCPRD\'s policy compliance is reflected in available records.',
        evidenceIds: ['DOC-021', 'DOC-014', 'DOC-012'],
        status: 'not_applied',
      },
      {
        rule: 'K.S.A. 72-1421(c) binds the district to the entire KDHE child care licensing chapter',
        source: 'K.S.A. 72-1421(c)',
        sourceId: 'AUTH-51',
        requiresIntro:
          'K.S.A. 72-1421(c): "Every school district which establishes, operates and maintains a child care facility shall be subject to the provisions contained in article 5 of chapter 65." This imports the full KDHE licensing framework: duty of care (65-508), mandatory inspections (65-512), record-keeping (65-507), license revocation (65-504), emergency suspension (65-524), civil fines up to $500/day (65-526), and criminal penalties (65-514).',
        requiresPoints: [
          {
            label: 'Identical Language',
            text: '72-1421(a)(3) authorizes contracting for "establishment, operation and maintenance" of child care. Subsection (c) applies to districts that "establish, operate and maintain." The legislature used the same operative words — contracting for it IS establishing it through a contractual vehicle.',
          },
          {
            label: 'Subsection (d) Broadens It',
            text: '"Child" includes children of districts that "establishes, operates and maintains, or cooperates in the establishment, operation and maintenance of" a facility. The "or cooperates in" language explicitly covers cooperative and contracted arrangements.',
          },
          {
            label: '72-3215 Comparison',
            text: 'The parallel preschool statute has the same (a)(1-4) structure but deliberately omits a subsection (c). The legislature intentionally added KDHE binding for child care and omitted it for preschool — proving (c) was purposeful.',
          },
          {
            label: 'Article 14 Placement',
            text: 'The statute sits in "Provisions Relating To The Use Of School District Property." It was designed for lease-based child care arrangements — exactly this situation.',
          },
          {
            label: 'Purposive Construction',
            text: 'If outsourcing under (a)(3) defeats the KDHE obligation in (c), the provision is nullified by the very mechanism the statute authorizes. The legislature did not write (c) to be defeated by (a)(3).',
          },
          {
            label: "District's Own Characterization",
            text: 'USD 232 "offers" this programming (website), calls it "invaluable childcare" (Schwanz memo), titled the consent agenda "School Age Childcare Programs," and Cater wrote it "operates as a licensed childcare provider." A district that "offers" childcare has "established" it.',
          },
        ],
        actualIntro:
          'USD 232 has not asserted an oversight role in this matter. Balthazor referred to JCPRD as a "separate entity." Cater stated JCPRD "operates independently." No Kansas court has ruled on this specific statutory question. The statutory text, structure, and the district\'s own characterizations appear to support the parent\'s reading.',
        actualPoints: [
          {
            label: '"Establishes, operates and maintains" is conjunctive',
            text: 'Defense will argue the district doesn\'t directly "operate" the program. Rebuttal: Subsection (d) already broadens this to include cooperative arrangements. The district\'s website says it "offers" the programming.',
          },
          {
            label: 'JCPRD holds its own KDHE license',
            text: 'Defense will argue the district is just a landlord. Rebuttal: A landlord doesn\'t title its board agenda "School Age Childcare Programs," call the arrangement "invaluable childcare," or present it on its website as a service it "offers."',
          },
          {
            label: 'Lease is under 72-1150, not 72-1421',
            text: 'Defense will argue the leasing statute controls. Rebuttal: The statutory authority under which the lease was drafted doesn\'t change the characterization of the arrangement. If the arrangement IS a child care facility on school property, 72-1421(c) applies by its own terms.',
          },
        ],
        evidenceIds: [
          'AUTH-51',
          'AUTH-43',
          'DOC-012',
          'DOC-004',
          'BP-09',
        ],
        status: 'not_applied',
      },
      {
        rule: 'KDHE complaint filing and parent notification of inspection rights',
        source: 'K.S.A. 65-512',
        sourceId: 'AUTH-59',
        requires:
          'K.S.A. 65-512 mandates that KDHE "shall conduct an inspection of any child care facility upon receiving a complaint." Any person — including a parent, a school district, or the facility itself — can trigger this inspection. Under 72-1421(c), the district is subject to this inspection regime. The parent of a child assaulted in a KDHE-licensed facility has the right to file a complaint and trigger a state inspection of supervision practices, incident reporting, and compliance with K.S.A. 65-508.',
        actual:
          'JCPRD did file a KDHE Critical Incident Report, though their own communication states it was filed after the parent disclosed seeking medical care (DOC-017: "Our report to KDHE and local licensing was made when you notified us that you sought medical care"). Based on available records, USD 232 did not file its own KDHE complaint. Neither entity appears to have informed the parent of their right to trigger a complaint-based inspection under 65-512. Alvie Cater referenced KDHE in the context of: "concerns regarding their actions or compliance would need to be addressed directly with JCPRD and, if necessary, KDHE" (DOC-012).',
        evidenceIds: ['AUTH-59', 'DOC-017', 'DOC-012', 'DOC-014'],
        status: 'not_applied',
      },
      {
        rule: 'Facility must maintain complete records of each child, including physician for injuries',
        source: 'K.S.A. 65-507',
        sourceId: 'AUTH-58',
        requires:
          'K.S.A. 65-507 requires child care facilities to keep records including "the name and age of each child received and cared for in the facility" and "the name of the physician who attended any sick children." This applies directly to JCPRD as a licensed facility.',
        actual:
          'JCPRD Manager Jennifer Anderson stated that the incident report "does not include later information" (DOC-017). The initial report appears to contradict subsequent medical evidence. An incomplete incident report for a child who required medical attention may raise questions under the statutory record-keeping requirement.',
        evidenceIds: ['AUTH-58', 'DOC-017', 'DOC-009'],
        status: 'not_applied',
      },
    ],
  },
];

export default function NonCompliance() {
  const [activeSection, setActiveSection] = useState('lease');

  const totalIssues = SECTIONS.reduce(
    (sum, s) => sum + s.rules.filter((r) => r.status === 'not_applied').length,
    0,
  );

  return (
    <div className="space-y-8">
      <div className="relative -mx-4 sm:-mx-6 -mt-6 mb-4 overflow-hidden rounded-b-2xl">
        <img
          src="./images/non-compliance-header.png"
          alt=""
          className="w-full h-44 sm:h-56 object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-1">Policy & Compliance Review</h2>
        <p className="text-xs text-text-dim mb-2">
          Rules, contracts, and statutes that apply to this situation, compared against what the available evidence shows.
        </p>
        <p className="text-[11px] text-text-dim/70 italic mb-2">
          This analysis reflects one family's reading of publicly available policies, statutes, and records. It is not a legal finding or adjudication.
        </p>
        <div className="flex gap-3 items-center mt-3">
          <span className="text-sm font-medium text-warning">
            {totalIssues} policies appear not applied
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
              ({s.rules.filter((r) => r.status === 'not_applied').length})
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
        <div className="bg-surface-alt border border-border rounded-lg p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h4 className="text-sm font-bold mb-2">What the Records Show</h4>
          <p className="text-sm leading-relaxed text-text-dim">
            Across the lease, KDHE licensing, and district statutes, the available evidence
            shows a consistent pattern: policies and obligations exist, but based on the
            records available to this family, they do not appear to have been applied in this
            instance. Both entities directed the parent to the other party. The policies
            themselves are not ambiguous.
          </p>
        </div>
      </div>
    </div>
  );
}

function StructuredContent({ intro, points }) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed">{intro}</p>
      {points?.length > 0 && (
        <dl className="space-y-2 mt-2">
          {points.map((pt, i) => (
            <div key={i} className="pl-3 border-l-2 border-border">
              <dt className="text-[11px] font-semibold text-text">{pt.label}</dt>
              <dd className="text-xs leading-relaxed text-text-dim mt-0.5">{pt.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function RuleCard({ rule, color }) {
  const [expanded, setExpanded] = useState(false);
  const hasStructured = rule.requiresIntro || rule.actualIntro;

  return (
    <div
      className="bg-surface border border-border rounded-lg overflow-hidden card-hover"
      style={{ borderLeftColor: color, borderLeftWidth: 3, boxShadow: 'var(--shadow-card)' }}
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
              {hasStructured ? (
                <StructuredContent
                  intro={rule.requiresIntro}
                  points={rule.requiresPoints}
                />
              ) : (
                <p className="text-xs leading-relaxed">{rule.requires}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-warning mb-1.5">
                What the evidence shows
              </p>
              {hasStructured ? (
                <StructuredContent
                  intro={rule.actualIntro}
                  points={rule.actualPoints}
                />
              ) : (
                <p className="text-xs leading-relaxed">{rule.actual}</p>
              )}
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
  if (status === 'not_applied') {
    return (
      <span className="w-6 h-6 rounded-full bg-warning/15 text-warning flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
        ○
      </span>
    );
  }
  return (
    <span className="w-6 h-6 rounded-full bg-yellow-500/15 text-yellow-500 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
      ?
    </span>
  );
}
