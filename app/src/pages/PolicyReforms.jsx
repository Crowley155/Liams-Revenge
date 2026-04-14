import { useState } from 'react';

const SECTIONS = [
  {
    id: 'jcprd',
    entity: 'JCPRD',
    label: 'Program Operations',
    color: 'var(--color-warning)',
    reforms: [
      {
        title: 'Affirm Compliance with All Board Policies',
        description:
          'Publicly acknowledge and operationalize the obligation under Lease §8(d) to follow all USD 232 board policies — including JDDC (bullying prevention), JDDB (crime reporting), JGFB (supervision), and KG (employee on duty). The current handbook statement that programs "function independently in both policy and procedure" directly contradicts the lease.',
        basis: 'Lease Agreement §8(d)',
        basisId: 'DOC-021',
      },
      {
        title: 'Enforce Age Separation During All Activities',
        description:
          'Establish and enforce a written policy prohibiting the intermingling of age groups during outdoor and indoor activities. A nine-year-old and a six-year-old should never be in unsupervised proximity. School staff previously guaranteed kindergarteners would remain in a separate area — the after-school program must meet the same standard.',
        basis: 'DOC-028 / K.A.R. 28-4-420',
        basisId: 'DOC-028',
      },
      {
        title: 'Prohibit Personal Cell Phone Use During Active Supervision',
        description:
          'Adopt an explicit policy prohibiting supervising staff from using personal cell phones while responsible for children. Five staff were outside during the assault and none witnessed it. Active supervision requires active attention. Kansas KDHE regulations require staff to maintain "active awareness of and responsibility for each child\'s activity" — a phone in hand undermines that obligation.',
        basis: 'K.A.R. 28-4-420',
        basisId: 'AUTH-08',
      },
      {
        title: 'Reform Medical Assessment Protocol',
        description:
          'Eliminate any policy that allows on-site staff to make medical judgments about whether treatment is necessary. When a nine-year-old — roughly twice the size of a kindergartener — physically assaults a smaller child, staff are not qualified to rule out internal injuries, concussion, or spinal damage. The default response must be immediate parent notification and a recommendation for medical evaluation. The incident report stated "no medical treatment was necessary." The child was under pediatric care for a week.',
        basis: 'DOC-017 / K.S.A. 65-508',
        basisId: 'DOC-017',
      },
      {
        title: 'Overhaul Incident Reporting Standards',
        description:
          'Require incident reports to be reviewed by a supervisor within 24 hours, include all known facts at the time of completion, and be updated as new information becomes available. The current report contradicted subsequent medical evidence and was acknowledged by the program manager as incomplete — "written the day the incident occurred; does not include later information." An incomplete report for a child who required medical attention is not acceptable under KDHE record-keeping requirements.',
        basis: 'DOC-017 / K.S.A. 65-507',
        basisId: 'AUTH-58',
      },
      {
        title: 'Mandatory Immediate Parent Notification',
        description:
          'Implement a policy requiring immediate, direct parent notification — by phone, not text — for any physical incident involving a child. Notification must include what happened, who was involved, what injuries were observed, and what actions were taken. Parents should never learn details about their child\'s assault piecemeal, days later, through follow-up questions they had to initiate themselves.',
        basis: 'K.S.A. 65-508',
        basisId: 'AUTH-45',
      },
    ],
  },
  {
    id: 'usd232',
    entity: 'USD 232',
    label: 'District Oversight',
    color: 'var(--color-accent)',
    reforms: [
      {
        title: 'Activate Lease Enforcement Authority',
        description:
          'Exercise the remediation authority granted under Lease §7(c). The district wrote this enforcement mechanism into the contract — it gives explicit power to cure any material breach. Based on available records, it has never been used. A lease obligation without enforcement is a suggestion, not a standard.',
        basis: 'Lease Agreement §7(c)',
        basisId: 'DOC-021',
      },
      {
        title: 'Conduct Annual Lease Compliance Audits',
        description:
          'Institute a formal annual audit verifying JCPRD\'s compliance with the policy obligations in §8(d). This audit should be documented, reported to the Board, and include direct observation of program operations — not just paperwork review. The district cannot delegate responsibility for children on its property and then never check whether the delegate is following the rules.',
        basis: 'Lease Agreement §8(d)',
        basisId: 'DOC-021',
      },
      {
        title: 'Enforce JDDB — Mandatory Crime Reporting',
        description:
          'Require the building principal to comply with JDDB by reporting physical assaults on school property to law enforcement, regardless of whether the assault occurred during school hours or during a third-party program. The policy says "shall report" — not "may," not "should," not "when convenient." Based on available records, no report was filed by any school administrator.',
        basis: 'USD 232 Policy JDDB',
        basisId: 'BP-04',
      },
      {
        title: 'Apply JDDC Bullying Prevention on School Property at All Hours',
        description:
          'Clarify in writing that JDDC applies to incidents on school property regardless of time of day or which entity is operating the program. The policy text contains no time-of-day limitation. The after-school timing was treated as a jurisdictional boundary — but the policy doesn\'t create one.',
        basis: 'USD 232 Policy JDDC / K.S.A. 72-6147',
        basisId: 'BP-03',
      },
      {
        title: 'Staff KG-Compliant Employee During Third-Party Programs',
        description:
          'Assign a USD 232 employee to be on duty whenever a non-school group uses district facilities for activities involving children — as Policy KG requires. This employee serves as the district\'s eyes on the ground and ensures board policies are being followed in real time, not just on paper.',
        basis: 'USD 232 Policy KG',
        basisId: 'BP-01',
      },
      {
        title: 'Transparent Enrollment Disclosure',
        description:
          'Require that all registration materials, website pages, and parent communications clearly and prominently disclose whether a program is operated by the district or by a third party. Parents must be told — before they enroll their child — who is responsible for supervision, who sets the safety standards, and who to contact if something goes wrong. This distinction was never communicated. It should have been the first thing parents saw.',
        basis: 'DOC-004 / AUTH-41',
        basisId: 'DOC-004',
      },
    ],
  },
  {
    id: 'joint',
    entity: 'Joint',
    label: 'Shared Accountability',
    color: 'var(--color-success)',
    reforms: [
      {
        title: 'Establish a Joint Incident Investigation Protocol',
        description:
          'Create a binding, written protocol requiring both entities to participate in a joint investigation of any incident involving injury to a child on school property. The current arrangement — where each entity tells the parent to contact the other — is not a policy gap. It is an accountability gap. No parent should have to file police reports, DCF complaints, and formal grievances unassisted because neither institution will own the problem.',
        basis: 'DOC-004 / DOC-012',
        basisId: 'DOC-004',
      },
      {
        title: 'Single Point of Contact for Parents After an Incident',
        description:
          'Designate a single named individual — from either entity — as the parent\'s point of contact following any incident. That person is responsible for providing updates, coordinating between entities, and ensuring the parent is not forced to navigate the bureaucracy alone. "That\'s not our department" is not an acceptable response to a parent whose child was harmed.',
        basis: 'DOC-004 / DOC-012 / DOC-014',
        basisId: 'DOC-012',
      },
      {
        title: 'Annual Safety Report to Parents',
        description:
          'Publish a joint annual report to enrolled families documenting: total incidents, types of incidents, staff-to-child ratios observed, policy compliance audit results, and any corrective actions taken. Transparency is the minimum standard. Parents who entrust their children to this program deserve to know whether it\'s working.',
        basis: 'K.S.A. 65-508 / Lease §8(d)',
        basisId: 'AUTH-45',
      },
    ],
  },
];

export default function PolicyReforms() {
  const [activeSection, setActiveSection] = useState('jcprd');
  const [expandedId, setExpandedId] = useState(null);

  const totalReforms = SECTIONS.reduce((sum, s) => sum + s.reforms.length, 0);

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent/70 mb-3">
          Crowley v. USD 232 / JCPRD
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          What We're Asking For
        </h2>
        <p className="text-[15px] leading-[1.8] text-text/80 max-w-2xl text-pretty">
          These aren't radical proposals. They're the policies that should already exist — based
          on the lease both entities signed, the statutes already on the books, and the standards
          every parent was told applied. {totalReforms} specific reforms, grounded in evidence.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border pb-px overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors whitespace-nowrap border-b-2 ${
              activeSection === s.id
                ? 'border-current bg-accent/5'
                : 'border-transparent text-text-dim hover:text-text'
            }`}
            style={activeSection === s.id ? { borderColor: s.color, color: s.color } : {}}
          >
            {s.label}
            <span className="ml-2 text-xs opacity-60">({s.reforms.length})</span>
          </button>
        ))}
      </div>

      {SECTIONS.filter((s) => s.id === activeSection).map((section) => (
        <div key={section.id} className="space-y-4">
          <div className="mb-2">
            <h3 className="text-xl font-bold" style={{ color: section.color }}>
              {section.entity} — {section.label}
            </h3>
          </div>

          {section.reforms.map((reform, i) => {
            const key = `${section.id}-${i}`;
            const isExpanded = expandedId === key;
            return (
              <div
                key={key}
                className="bg-surface border border-border rounded-lg overflow-hidden card-hover"
                style={{
                  borderLeftColor: section.color,
                  borderLeftWidth: 3,
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : key)}
                  className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-surface-alt/50 transition-colors"
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                    style={{ background: `color-mix(in srgb, ${section.color} 15%, transparent)`, color: section.color }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold">{reform.title}</p>
                    <p className="text-xs text-text-dim/70 mt-1">{reform.basis}</p>
                  </div>
                  <span className="text-text-dim text-xs mt-1 shrink-0">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-0 border-t border-border/50">
                    <p className="text-[15px] leading-[1.8] text-text/85 mt-4 text-pretty">
                      {reform.description}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="border-t border-border pt-8 mt-8">
        <div
          className="bg-surface-alt border border-border rounded-xl p-6 sm:p-8"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <p className="text-[15px] leading-[1.8] text-text/85 text-pretty">
            None of these reforms require new legislation. They require the institutions
            to follow the contracts they signed, enforce the policies they wrote, and apply
            the statutes already on the books. Every one of these changes protects the next
            family — not just mine.
          </p>
          <p className="text-base font-medium text-accent mt-4">
            The policies aren't the problem. The problem is that nobody enforced them.
          </p>
        </div>
      </div>
    </div>
  );
}
