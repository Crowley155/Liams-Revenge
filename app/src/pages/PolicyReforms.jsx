import { useState } from 'react';
import DocLink from '../components/DocLink';

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
          'Commit to fulfilling the obligations of the lease. Section 8(d) requires JCPRD to follow all USD 232 board policies, rules, and standards. That clause exists for a reason — it\'s how the district ensures children on its property are protected to its standards, regardless of who runs the program. JCPRD\'s own handbook states that its programs "function independently in both policy and procedure." That directly contradicts the lease they signed.',
        basis: 'Lease Agreement §8(d)',
        basisId: 'DOC-021',
      },
      {
        title: 'Enforce Age-Appropriate Grouping and Active Supervision',
        description: (
          <>
            <p>
              Five staff were outside when a nine-year-old attacked a six-year-old on the playground. None saw it. The child's account — consistent with what was later reported to the pediatrician — is that staff were sitting on a bench, not circulating, not watching.
            </p>

            <p className="font-semibold mt-4 mb-1">The supervision standard that was violated</p>
            <p>
              <a href="https://www.law.cornell.edu/regulations/kansas/K-A-R-28-4-437" target="_blank" rel="noreferrer" className="underline decoration-accent/40 hover:decoration-accent">K.A.R. 28-4-437(l)–(m)</a> requires
              the play area be arranged so staff can <em>"actively supervise each child at all times"</em> and
              that staff <em>"shall actively engage in the supervision of children."</em>{' '}
              <a href="https://www.law.cornell.edu/regulations/kansas/K-A-R-28-4-115a" target="_blank" rel="noreferrer" className="underline decoration-accent/40 hover:decoration-accent">K.A.R. 28-4-115a(b)(3)</a> prohibits
              providers from engaging in <em>"business, social, or personal activities that interfere with the care and supervision of children."</em> Sitting on a bench in conversation — or on a phone — while children play unsupervised is the textbook violation of both.
            </p>

            <p className="font-semibold mt-4 mb-1">The hearing distance standard</p>
            <p>
              For a six-year-old outdoors, <a href="https://www.law.cornell.edu/regulations/kansas/K-A-R-28-4-115a" target="_blank" rel="noreferrer" className="underline decoration-accent/40 hover:decoration-accent">K.A.R. 28-4-115a(d)(2)</a> requires
              staff to remain within hearing distance and visually check on each child. "Hearing distance" in regulatory practice means audible range without electronic equipment — close enough to hear and respond immediately. That standard is incompatible with passive bench supervision of a mixed-age group spread across a playground.
            </p>

            <p className="font-semibold mt-4 mb-1">The case for age separation</p>
            <p>
              The <a href="https://www.cpsc.gov/safety-education/safety-guides/playgrounds/public-playground-safety-handbook" target="_blank" rel="noreferrer" className="underline decoration-accent/40 hover:decoration-accent">CPSC Public Playground Safety Handbook</a> (Publication 325, §2.2.2) is not a mandate — it is the federal standard for playground safety design, and it directly addresses this risk. It recommends age-separated play areas specifically to <em>"reduce the chance of injury from older, more active children running through areas filled with younger children with generally slower movement and reaction times."</em> The Kansas State Fire Marshal's office, in{' '}
              <a href="https://www.firemarshal.ks.gov/DocumentCenter/View/378/Fire-Fact-030---1st-and-2nd-grade-PDF" target="_blank" rel="noreferrer" className="underline decoration-accent/40 hover:decoration-accent">Fire Fact 030</a>, explains that K–2 floor restrictions exist to <em>"avoid the danger of older (and larger) children overrunning the very young"</em> — the same physics applies on a playground.
            </p>
            <p className="mt-2">
              And USD 232's own kindergarten staff confirmed in writing that the school's policy is to <em>"not intermingle age groups at recess or any other time during the school day"</em> (DOC-028).
            </p>

            <p className="mt-4 font-medium text-text">
              JCPRD is the only entity in this picture that claims mixed-age, unsupervised outdoor play is acceptable — and the result was a physical assault with five staff and zero witnesses. These are the standards that should be adopted to ensure it doesn't happen again.
            </p>
          </>
        ),
        basis: 'K.A.R. 28-4-437(l)–(m) / K.A.R. 28-4-115a(b)(3), (d)(2) / CPSC Pub. 325 §2.2.2 / Fire Fact 030 / DOC-028',
        basisId: 'DOC-028',
      },
      {
        title: 'Prohibit Personal Cell Phone Use During Active Supervision',
        description:
          'On March 19, 2026 — fourteen days before this assault — Governor Kelly signed HB 2299, banning student cell phones in Kansas schools bell-to-bell. The basis: phones are so cognitively disruptive that children cannot be expected to learn in their presence. The University of Texas "Brain Drain" study (Ward et al., 2017) found that the mere presence of a smartphone — even silenced and face-down — measurably reduces available working memory and cognitive capacity. If the State of Kansas recognizes that a phone degrades a child\'s ability to pay attention in a classroom, the same science applies to an adult\'s ability to supervise children on a playground. Five staff were outside during the assault. None witnessed it. K.A.R. 28-4-420 requires staff to maintain "active awareness of and responsibility for each child\'s activity." Adopt an explicit policy: no personal cell phone use while on active supervision duty.',
        basis: 'HB 2299 / Ward et al., 2017 / K.A.R. 28-4-420',
        basisId: 'AUTH-08',
      },
      {
        title: 'Reform Medical Assessment Protocol for Physical Assaults',
        description:
          'K.A.R. 28-4-592(g)(1)(E) triggers the critical incident protocol for any injury "that requires medical attention" — but the regulation places that determination in the hands of staff whose highest qualification is a first aid/CPR certification (K.A.R. 28-4-592(c)(1)). That training does not equip staff to rule out internal injuries, concussion, or spinal damage — especially when a nine-year-old, roughly twice the size of a kindergartener, physically assaults a smaller child. For any incident involving a physical assault or significant age/size disparity, the default must be immediate parent notification and a recommendation for professional medical evaluation. Staff should not be in the position of gate-keeping a determination they are not trained to make. Separately, K.A.R. 28-4-592(g)(1)(G) defines "any other incident that jeopardizes the safety of any child" as a critical incident — a physical assault qualifies on its own, regardless of the medical judgment. The incident report in this case stated "no medical treatment was necessary." The child was under pediatric care for a week.',
        basis: 'K.A.R. 28-4-592(g)(1)(E), (G), (c)(1)',
        basisId: 'DOC-017',
      },
      {
        title: 'Overhaul Incident Report Standards',
        description:
          'The incident report in this case was not a factual account — it was a defensive narrative. Despite the form\'s own instruction to "State only facts," the report was built primarily on the older child\'s account, characterized the six-year-old victim as the primary aggressor, made no mention of the other child\'s age, size, or grade, listed staff as "witnesses" who by the report\'s own admission did not see the event, presented disputed claims as settled fact, included an unsupported medical determination ("no medical treatment was necessary"), and was later acknowledged by the program manager as incomplete. Incident reports must: (1) document only firsthand observations, clearly labeled; (2) identify all children involved by age and grade; (3) distinguish between witnessed facts and secondhand accounts; (4) never include medical determinations by non-medical staff; and (5) be reviewed by a supervisor before being shared with families. K.S.A. 65-507 requires licensed facilities to maintain accurate records. A report designed to close a conversation rather than document an incident does not meet that standard.',
        basis: 'DOC-017 / K.S.A. 65-507',
        basisId: 'DOC-017',
      },
      {
        title: 'Adopt Protective Interview Procedures for Minor Children',
        description:
          'After the assault, staff questioned the six-year-old victim in the same room as the older child who attacked him. A kindergartener being interviewed in the physical presence of a larger, older aggressor is inherently coercive — the child will say whatever ends the stress of the situation. This is not a theoretical concern; it is a recognized principle in child forensic interviewing. Adopt a written policy requiring: (1) children involved in a physical incident are separated immediately and interviewed individually; (2) no child is questioned in the presence of the other child involved; (3) a parent or guardian is notified before any substantive interview of a child under age eight; and (4) interview notes distinguish between a child\'s spontaneous statements and responses to staff questioning. The current process produced a report that relied on the older child\'s account to characterize the victim as the aggressor — exactly the outcome a proper interview protocol is designed to prevent.',
        basis: 'DOC-017',
        basisId: 'DOC-017',
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
        title: 'Enforce JDDB and JDDC on School Property at All Hours',
        description:
          'Both policies use mandatory language. JDDB says the principal "shall report" physical assaults on school property to law enforcement. JDDC applies bullying prevention protections on school property. Neither policy contains a time-of-day limitation or a carve-out for third-party programs. The after-school timing was treated as a jurisdictional boundary — but the policies don\'t create one. Enforce them as written. No report was filed under JDDB. No JDDC investigation was initiated. The policies aren\'t ambiguous — they were simply not applied.',
        basis: 'USD 232 Policy JDDB / JDDC / K.S.A. 72-6147',
        basisId: 'BP-04',
      },
      {
        title: 'Prohibit Contractual Disclaimers in Program Materials',
        description:
          'JCPRD\'s handbook states that its programs "function independently in both policy and procedure." That is not a disclosure — it is a repudiation of the lease. Section 8(d) requires JCPRD to follow all USD 232 board policies, rules, and standards while operating on district property. No handbook, enrollment form, or parent communication can disclaim an obligation the lease imposes. Any materials suggesting that district safety standards do not apply to JCPRD programs must be corrected — not because transparency is optional, but because the underlying claim is false.',
        basis: 'Lease Agreement §8(d) / DOC-004',
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
        title: 'Establish a Joint Investigation Protocol for Critical Incidents',
        description:
          'Create a binding, written protocol requiring both entities to participate in a joint investigation of critical incidents on school property — specifically those involving physical assault, significant age or size disparity between children, or injuries that trigger K.A.R. 28-4-592(g)(1) reporting. Not every scraped knee needs a task force. But when a nine-year-old assaults a kindergartener and the pediatrician files a mandatory DCF report, someone needs to own it. The protocol must designate a single point of contact for the affected family — one person responsible for coordinating between entities and providing updates. The current arrangement, where each entity tells the parent to contact the other, is not a policy gap. It is an accountability gap. No parent should have to file police reports, DCF complaints, and formal grievances unassisted because neither institution will take responsibility.',
        basis: 'DOC-004 / DOC-012 / K.A.R. 28-4-592(g)(1)',
        basisId: 'DOC-004',
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
                    <p className="text-xs text-text-dim/70 mt-1">
                      {reform.basisId ? <DocLink id={reform.basisId}>{reform.basis}</DocLink> : reform.basis}
                    </p>
                  </div>
                  <span className="text-text-dim text-xs mt-1 shrink-0">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-0 border-t border-border/50">
                    {typeof reform.description === 'string' ? (
                      <p className="text-[15px] leading-[1.8] text-text/85 mt-4 text-pretty">
                        {reform.description}
                      </p>
                    ) : (
                      <div className="text-[15px] leading-[1.8] text-text/85 mt-4 text-pretty">
                        {reform.description}
                      </div>
                    )}
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
