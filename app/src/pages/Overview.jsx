import { useCase } from '../data/useCase';
import DocLink from '../components/DocLink';
import { Link } from 'react-router-dom';

export default function Overview() {
  const data = useCase();
  const ageLabel = data.meta?.studentAgeLabel || 'six-year-old';

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-2xl font-bold mb-1">Duty of Care Briefing</h2>
        <p className="text-xs text-text-dim mb-6">
          Crowley v. USD 232 / JCPRD — What parents are told vs. what actually happens
        </p>

        <div className="prose-custom space-y-4 text-sm leading-relaxed">
          <p>
            On <strong>April 2, 2026</strong>, a {ageLabel} kindergartener was physically assaulted
            by a nine-year-old at Mize Elementary during JCPRD's Out-of-School-Time program.
            Five JCPRD staff were outside. Not a single adult witnessed the attack. The child
            sustained visible injuries and was kept home for a week on pediatrician's orders.
          </p>
          <p>
            Neither JCPRD nor USD 232 investigated. Neither accepted responsibility.
            Both pointed at the other. The parent was left to file police reports, DCF
            complaints, and formal grievances — all while being told it was someone else's
            problem.
          </p>
          <p>
            This briefing documents the gap between <strong>what parents are promised</strong> when
            they enroll their children and <strong>what actually happens</strong> inside the program.
          </p>
        </div>
      </section>

      {/* Section 1: What Parents Are Told */}
      <section>
        <h3 className="text-lg font-bold mb-4">What Parents Are Told</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <PromiseCard
            title="STEM Enrichment & Extended Learning"
            quote="The availability of this program within your child's school provides enhanced safety, convenience, and numerous opportunities to extend school day learning experiences."
            source="JCPRD OST Program Page"
            sourceId="AUTH-47"
          />
          <PromiseCard
            title="Safe, Licensed, Supervised"
            quote="Fully licensed by the Kansas Department of Health and Environment, our programs maintain a 1 to 15 staff to participant ratio."
            source="JCPRD OST Program Page"
            sourceId="AUTH-47"
          />
          <PromiseCard
            title="School-Integrated Program"
            quote="Search for your child's school name in the search bar. Click on 'OST: Olathe - School Name (2026-27)'"
            source="JCPRD Registration Page"
            sourceId="AUTH-48"
          />
          <PromiseCard
            title="Invaluable Childcare"
            quote="The programs JCPRD provides are invaluable to some of our families that need childcare during the summer and before and after school."
            source="Schwanz Memo to USD 232 Board"
            sourceId="AUTH-43"
          />
          <PromiseCard
            title="Bound by School Policies"
            quote="Lessee will abide by... all rules, regulations, and policies adopted by the Board of Education."
            source="Lease Agreement §8(d)"
            sourceId="DOC-021"
          />
          <PromiseCard
            title="Statutory Duty of Care"
            quote="Each facility shall be operated with strict regard to the health, comfort, safety, and social welfare of such children."
            source="K.S.A. 65-508"
            sourceId="AUTH-45"
          />
          <PromiseCard
            title="Marketed as Educational Enrichment"
            quote="Enrichment opportunities focused on creativity, environmental literacy, fitness, health, innovation, and STEM... extend school day learning experiences."
            source="JCPRD OST Program Page"
            sourceId="AUTH-47"
          />
          <PromiseCard
            title="Presented as a District Service"
            quote="USD 232 partners with Johnson County Parks & Recreation District to offer before/after school programming for elementary students."
            source="USD 232 Website — Before/After School Services"
            sourceId="BP-09"
          />
          <PromiseCard
            title="Kindergartners Kept Separate and Supervised"
            quote="Our policy is to not intermingle age groups at recess or any other time during the school day. Additionally, kindergarten students are required to remain within set parameters of the playground (the green turf area). We typically have 3–4 adults supervising."
            source="BreAnna Burks, Mize Elementary, Sep 18, 2025"
            sourceId="DOC-028"
          />
        </div>
      </section>

      {/* Section 2: What Actually Happens */}
      <section>
        <h3 className="text-lg font-bold mb-4 text-danger">What Actually Happens</h3>
        <div className="space-y-3">
          <RealityCard
            claim="Programs follow school board policies"
            reality="JCPRD's own published handbook states: 'our programs function independently in both policy and procedure. We are guests of the school.'"
            docId="AUTH-41"
          />
          <RealityCard
            claim="1:15 staff-to-participant ratio ensures supervision"
            reality="Five JCPRD staff were outside during the assault. Not a single adult witnessed the attack on a six-year-old."
            docId="DOC-009"
          />
          <RealityCard
            claim="Age groups are separated per school policy"
            reality="A nine-year-old attacked a kindergartener in a mixed-age outdoor setting. School staff had previously confirmed kindergartners 'never intermingle with other age groups' at recess."
            docId="DOC-028"
          />
          <RealityCard
            claim="Incidents are properly documented"
            reality="JCPRD's incident report listed witnesses who saw nothing, wrote 'no medical treatment necessary' when the child was under pediatric care, and was admitted to be 'written the day the incident occurred; does not include later information.'"
            docId="DOC-017"
          />
          <RealityCard
            claim="The district provides oversight"
            reality="Principal Balthazor called JCPRD a 'separate entity' — not her problem. Alvie Cater said JCPRD 'operates independently.' He cancelled the meeting the morning after the parent cited the lease."
            docId="DOC-012"
          />
          <RealityCard
            claim="Parents can seek accountability"
            reality="No investigation was conducted by either entity. The parent filed police reports, DCF complaints, and formal grievances — all while being told to talk to the other party."
          />
        </div>
      </section>

      {/* Section 3: Why No Parent Could Have Known */}
      <section>
        <h3 className="text-lg font-bold mb-2">Why No Reasonable Parent Could Have Known</h3>
        <p className="text-xs text-text-dim mb-4">
          Every signal available to a parent — the district's website, school staff communications, 
          registration process, and the lease itself — indicated this program adhered to district standards.
          The "separate entity" disclaimer appears only after a child is harmed.
        </p>
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          <RelianceItem
            label="The September Guarantee"
            detail={`On September 18, 2025, Mize Elementary kindergarten staff BreAnna Burks wrote to the parent: "Our policy is to not intermingle age groups at recess or any other time during the school day. Additionally, kindergarten students are required to remain within set parameters of the playground (the green turf area). We typically have 3–4 adults supervising to ensure students follow these expectations." A parent hearing this would reasonably believe the same standards apply to the after-school program operating on the same playground, at the same school, presented as a district service. Seven months later, a nine-year-old attacked a kindergartener in a mixed-age outdoor setting — on the same property.`}
            docId="DOC-028"
          />
          <RelianceItem
            label="The District's Website"
            detail={`USD 232's own "Before/After School Services" page states: "USD 232 partners with Johnson County Parks & Recreation District to offer before/after school programming for elementary students." This page lives under "Family Resources > Family and Student Services." The district doesn't say "a third party operates an independent program on our property." It says the district "offers" this programming. Any parent viewing this page would conclude this is a district-endorsed, district-supervised service.`}
            docId="BP-09"
          />
          <RelianceItem
            label="Registration During School Enrollment"
            detail={`Parents encounter JCPRD's OST program during the school registration process. JCPRD's own registration instructions direct parents to search by school name. The program is registered through JCPRD's site, but the entry point is school enrollment. This creates the unmistakable impression that the program is part of the school experience.`}
            docId="AUTH-48"
          />
          <RelianceItem
            label="The Lease Parents Never See"
            detail={`Lease §8(d) requires JCPRD to "abide by... all rules, regulations, and policies adopted by the Board of Education." Section 7(c) gives the district the right to remedy any material breach — including JCPRD's failure to comply with §8(d). Parents are never given a copy of this lease. But even if they were, the lease reinforces — not undermines — the expectation that district policies are followed. Board Policy KG requires a school employee on duty. Board Policy JDDC requires a bullying plan on school property. Board Policy JDDB requires the principal to report assaults to law enforcement. The lease created the obligation AND the remedy. Neither was used.`}
            docId="DOC-021"
          />
          <RelianceItem
            label="The Disclaimer That Comes After"
            detail={`JCPRD's own handbook states "our programs function independently in both policy and procedure. We are guests of the school." Parents never see this handbook before enrollment. Principal Balthazor's characterization of JCPRD as a "separate entity" came only after the assault. Alvie Cater's assertion that JCPRD "operates independently" was written in response to a parent complaint — not disclosed during registration. The "separate entity" framing is a post-hoc defense, not informed consent.`}
            docId="DOC-004"
          />
        </div>
      </section>

      {/* Section 4: Who Is Responsible */}
      <section>
        <h3 className="text-lg font-bold mb-4">Who Is Responsible</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <ResponsibilityCard
            entity="JCPRD"
            color="#ff6b6b"
            items={[
              { text: 'Holds a KDHE license — bound by K.S.A. 65-508 duty of care', id: 'AUTH-45' },
              { text: 'Lease §8(d) requires compliance with all board policies', id: 'DOC-021' },
              { text: 'Own handbook admits operating independently of those policies', id: 'AUTH-41' },
              { text: 'Markets STEM enrichment, safety, and qualified staff to parents', id: 'AUTH-47' },
              { text: 'Five staff present, zero witnessed the assault', id: 'DOC-009' },
            ]}
          />
          <ResponsibilityCard
            entity="USD 232"
            color="#6c8aff"
            items={[
              { text: 'Lease §8(d) requires JCPRD to follow all board policies; §7(c) gives the district the right to remedy material breaches — the district created both the obligation and the enforcement mechanism and used neither', id: 'DOC-021' },
              { text: 'Board Policy KG requires a school employee on duty when non-school groups use facilities — no one was present during JCPRD\'s program', id: 'BP-01' },
              { text: 'Board Policy JDDB requires the principal to report assaults on school property to law enforcement — no report was filed', id: 'BP-04' },
              { text: 'Board Policy JDDC requires a bullying plan on school property with no time-of-day limit — not applied to JCPRD program', id: 'BP-03' },
              { text: 'K.S.A. 72-1421(c) binds the district to KDHE licensing requirements. The district calls this "childcare" in its own board memo, consent agenda, and website', id: 'AUTH-51' },
              { text: 'District website presents JCPRD as a service USD 232 "offers" to families — not an independent third-party program', id: 'BP-09' },
              { text: 'Neither filed a KDHE complaint nor informed the parent of the right to trigger an inspection (K.S.A. 65-512)', id: 'AUTH-59' },
            ]}
          />
        </div>
        <div className="mt-4 p-4 bg-surface-alt border border-border rounded-lg">
          <p className="text-sm leading-relaxed">
            <strong>The core problem:</strong> Every signal available to a parent — the district's
            website, school staff communications, the registration process, and the lease itself —
            indicated this program adhered to district standards. The district's own board policies
            (KG, JGFB, JDDC, JDDB) require employee presence, approved supervision, bullying
            prevention, and crime reporting on school property. The lease binds JCPRD to all of them.
            K.S.A. 72-1421(c) binds the district to the entire KDHE child care licensing chapter.
            None of it was followed. No reasonable parent could have known JCPRD operated independently
            of district policy — because the district itself never disclosed it.
          </p>
          <Link
            to="/non-compliance"
            className="inline-block mt-3 text-xs text-accent hover:text-accent-hover font-medium"
          >
            See the full non-compliance breakdown →
          </Link>
        </div>
      </section>

      {/* Section 4: Key Players */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Key Players</h3>
          <Link to="/people" className="text-xs text-accent hover:text-accent-hover">
            View all →
          </Link>
        </div>
        <div className="flex gap-4 flex-wrap">
          {(data.actors || [])
            .filter((a) =>
              ['will-crowley', 'alvie-cater', 'leigh-white', 'brian-schwanz', 'gerri-balthazor', 'jennifer-anderson'].includes(a.id)
            )
            .map((a) => {
              const orgColor =
                a.org === 'USD 232' ? '#6c8aff' : a.org === 'JCPRD' ? '#ff6b6b' : '#69db7c';
              const initials = a.name.split(' ').map((w) => w[0]).join('').slice(0, 2);
              return (
                <Link
                  key={a.id}
                  to="/people"
                  className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-3 hover:border-accent/40 transition-colors"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: orgColor + '22', color: orgColor }}
                  >
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{a.name}</p>
                    <p className="text-xs text-text-dim">{a.role}</p>
                  </div>
                </Link>
              );
            })}
        </div>
      </section>
    </div>
  );
}

function PromiseCard({ title, quote, source, sourceId }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <h4 className="text-sm font-bold mb-2">{title}</h4>
      <blockquote className="text-xs text-text-dim italic leading-relaxed border-l-2 border-accent/30 pl-3 mb-2">
        "{quote}"
      </blockquote>
      <div className="text-[11px] text-text-dim">
        Source: <DocLink id={sourceId}>{source}</DocLink>
      </div>
    </div>
  );
}

function RealityCard({ claim, reality, docId }) {
  return (
    <div className="bg-danger/5 border border-danger/20 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <span className="text-danger text-lg leading-none mt-0.5">✕</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-dim mb-1">
            <span className="line-through">{claim}</span>
          </p>
          <p className="text-sm leading-relaxed">{reality}</p>
          {docId && (
            <div className="mt-2 text-[11px]">
              <DocLink id={docId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RelianceItem({ label, detail, docId }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="text-accent text-sm leading-none mt-1 shrink-0">&#9654;</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-1">{label}</p>
          <p className="text-xs text-text-dim leading-relaxed">{detail}</p>
          {docId && (
            <div className="mt-2 text-[11px]">
              <DocLink id={docId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResponsibilityCard({ entity, color, items }) {
  return (
    <div
      className="bg-surface border border-border rounded-lg p-4"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <h4 className="text-sm font-bold mb-3" style={{ color }}>{entity}</h4>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-text-dim leading-relaxed flex items-start gap-2">
            <span style={{ color }} className="mt-0.5">•</span>
            <span className="flex-1">
              {item.text}
              {item.id && (
                <span className="ml-1">
                  <DocLink id={item.id} />
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
