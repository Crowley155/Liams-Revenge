import { useState } from 'react';
import { useCase } from '../data/useCase';
import DocLink from '../components/DocLink';
import { Link } from 'react-router-dom';

export default function Overview() {
  const data = useCase();
  const ageLabel = data.meta?.studentAgeLabel || 'six-year-old';
  const videoUrl = data.meta?.videoUrl;
  const [showVideo, setShowVideo] = useState(false);

  return (
    <div className="space-y-10">
      {/* Section 1: The Incident + Core Problem */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-2xl font-bold mb-1">Duty of Care Briefing</h2>
            <p className="text-xs text-text-dim mb-4 sm:mb-6">
              Crowley v. USD 232 / JCPRD — What parents are told vs. what actually happens
            </p>
          </div>
          {videoUrl && (
            <button
              onClick={() => setShowVideo(true)}
              className="w-full sm:w-auto shrink-0 px-4 py-3 sm:py-2 rounded-lg text-sm font-semibold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors animate-pulse-subtle text-center"
            >
              ▶ Tell me why I care
            </button>
          )}
        </div>

        {showVideo && videoUrl && (
          <VideoModal url={videoUrl} onClose={() => setShowVideo(false)} />
        )}

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
        </div>

        <div className="mt-6 bg-surface-alt border-l-4 border-accent rounded-r-lg p-5">
          <p className="text-sm font-semibold text-accent mb-2">The Core Problem</p>
          <p className="text-sm leading-relaxed">
            Every signal available to a parent — the district's website, school staff
            communications, the registration process, and the lease itself — indicated this
            program adhered to district standards. The district's own board policies (KG, JGFB,
            JDDC, JDDB) require employee presence, approved supervision, bullying prevention,
            and crime reporting on school property. The lease binds JCPRD to all of them.
            K.S.A. 72-1421(c) binds the district to the entire KDHE child care licensing
            chapter. None of it was followed. No reasonable parent could have known JCPRD
            operated independently of district policy — because the district itself never
            disclosed it.
          </p>
          <Link
            to="/non-compliance"
            className="inline-block mt-3 text-xs text-accent hover:text-accent-hover font-medium"
          >
            See the full non-compliance breakdown →
          </Link>
        </div>
      </section>

      {/* Section 2: Key Players */}
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

      {/* Section 3: The Manufactured Trust */}
      <section>
        <h3 className="text-lg font-bold mb-2">The Manufactured Trust</h3>
        <p className="text-xs text-text-dim mb-6">
          Three layers of institutional messaging told parents this was a district-supervised
          program operating under school standards. The "separate entity" defense appeared only
          after a child was harmed.
        </p>

        <div className="space-y-6">
          <EvidenceCluster
            title="Presented as a District Service"
            intro="The district's own communications frame this as a program it offers — not an independent third party operating on its property."
            items={[
              {
                quote: 'USD 232 partners with Johnson County Parks & Recreation District to offer before/after school programming for elementary students.',
                source: 'USD 232 Website — Before/After School Services',
                sourceId: 'BP-09',
                detail: 'This page lives under "Family Resources > Family and Student Services." The district doesn\'t say a third party runs an independent program. It says the district "offers" this programming.',
              },
              {
                quote: 'Search for your child\'s school name in the search bar. Click on "OST: Olathe - School Name (2026-27)"',
                source: 'JCPRD Registration Page',
                sourceId: 'AUTH-48',
                detail: 'Parents encounter the program during school enrollment. Registration is organized by school name. The entry point is indistinguishable from a district service.',
              },
              {
                quote: 'The programs JCPRD provides are invaluable to some of our families that need childcare during the summer and before and after school.',
                source: 'Schwanz Memo to USD 232 Board',
                sourceId: 'AUTH-43',
                detail: 'The district\'s own Deputy Superintendent presented this to the Board as a district-endorsed service for "our families" — not an arms-length commercial arrangement.',
              },
            ]}
          />

          <EvidenceCluster
            title="School Standards Apply"
            intro="Parents are explicitly told — by the program, by the school, and by statute — that this program meets professional care standards."
            items={[
              {
                quote: 'Lessee will abide by... all rules, regulations, and policies adopted by the Board of Education.',
                source: 'Lease Agreement §8(d)',
                sourceId: 'DOC-021',
                detail: 'The lease isn\'t hidden. A parent who reads it finds a binding obligation to follow every district policy. This isn\'t aspirational language — it\'s a contractual term.',
              },
              {
                quote: 'Fully licensed by the Kansas Department of Health and Environment, our programs maintain a 1 to 15 staff to participant ratio. Enrichment opportunities focused on creativity, environmental literacy, fitness, health, innovation, and STEM.',
                source: 'JCPRD OST Program Page',
                sourceId: 'AUTH-47',
                detail: 'JCPRD markets KDHE licensure, professional ratios, and educational enrichment — the hallmarks of a regulated childcare program, not a casual rec activity.',
              },
              {
                quote: 'Each facility shall be operated with strict regard to the health, comfort, safety, and social welfare of such children.',
                source: 'K.S.A. 65-508',
                sourceId: 'AUTH-45',
                detail: 'Kansas statute imposes an affirmative duty of care on every licensed childcare facility. JCPRD holds that license.',
              },
              {
                quote: 'Our policy is to not intermingle age groups at recess or any other time during the school day. Additionally, kindergarten students are required to remain within set parameters of the playground (the green turf area). We typically have 3–4 adults supervising.',
                source: 'BreAnna Burks, Mize Elementary, Sep 18, 2025',
                sourceId: 'DOC-028',
                detail: 'Seven months before the assault, school staff gave the parent an explicit guarantee of age separation and direct supervision — on the same property where JCPRD operates. A parent hearing this would reasonably believe the after-school program follows the same rules.',
              },
            ]}
          />

          <EvidenceCluster
            title="The District Controls It"
            intro="The legal framework doesn't just permit oversight — it requires it. The district wrote the contract, retained enforcement power, and bound itself by statute."
            items={[
              {
                quote: 'The Lessor or its designee may take any action that may be necessary to cure... any material breach.',
                source: 'Lease Agreement §7(c)',
                sourceId: 'DOC-021',
                detail: 'Section 7(c) doesn\'t just allow the district to enforce compliance — it gives explicit authority to remedy material breaches. The district created the enforcement mechanism and never used it.',
              },
              {
                quote: null,
                source: 'Board Policies KG, JDDC, JDDB',
                sourceIds: ['BP-01', 'BP-03', 'BP-04'],
                detail: 'Policy KG requires a school employee on duty when non-school groups use facilities. JDDC requires a bullying prevention plan on school property with no time-of-day limit. JDDB requires the principal to report assaults to law enforcement. The lease binds JCPRD to all of them. None were followed.',
              },
              {
                quote: null,
                source: 'K.S.A. 72-1421(c)',
                sourceId: 'AUTH-51',
                detail: 'This statute binds the district to the entire KDHE childcare licensing chapter when it authorizes a childcare facility on school property. The district calls this "childcare" in its own board memo, consent agenda, and website.',
              },
            ]}
          />
        </div>

        <div className="mt-6 bg-surface border border-border rounded-lg p-5 space-y-4">
          <p className="text-sm leading-relaxed">
            The "separate entity" framing only surfaced after the assault: Principal Balthazor
            used it to deflect responsibility, Alvie Cater wrote it in response to a parent
            complaint. It was never disclosed during registration or any parent communication.
            JCPRD's own handbook admitting its programs "function independently" (<DocLink id="AUTH-41" />) is
            not a defense — a lessee cannot unilaterally disclaim obligations imposed by its
            lease. It is evidence of intent to ignore contractual obligations.
          </p>
          <p className="text-sm leading-relaxed">
            The incident report itself contradicts the medical evidence: JCPRD
            wrote "no medical treatment was necessary" while the child was under pediatric
            care with a mandatory DCF filing. The report listed witnesses who saw nothing
            and was admitted to be "written the day the incident occurred; does not include
            later information." <DocLink id="DOC-017" />
          </p>
        </div>
      </section>

    </div>
  );
}

function VideoModal({ url, onClose }) {
  const embedUrl = url + (url.includes('?') ? '&' : '?') + 'autoplay=1';

  return (
    <>
      <div className="fixed inset-0 bg-black/90 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6">
        <div className="relative w-full max-w-5xl">
          <div className="flex justify-end mb-2">
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white text-sm font-medium px-3 py-1"
            >
              Close &times;
            </button>
          </div>
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={embedUrl}
              title="Why you should care"
              className="absolute inset-0 w-full h-full rounded-lg"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </>
  );
}

function EvidenceCluster({ title, intro, items }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h4 className="text-sm font-bold mb-1">{title}</h4>
        <p className="text-xs text-text-dim leading-relaxed">{intro}</p>
      </div>
      <div className="divide-y divide-border/50">
        {items.map((item, i) => (
          <div key={i} className="px-5 py-4">
            {item.quote && (
              <blockquote className="text-xs italic text-text-dim leading-relaxed border-l-2 border-accent/30 pl-3 mb-2">
                "{item.quote}"
              </blockquote>
            )}
            <p className="text-sm leading-relaxed">{item.detail}</p>
            <div className="mt-2 text-[11px] text-text-dim flex flex-wrap gap-2">
              {item.sourceIds ? (
                item.sourceIds.map((sid) => (
                  <DocLink key={sid} id={sid}>{item.source}</DocLink>
                ))
              ) : (
                <DocLink id={item.sourceId}>{item.source}</DocLink>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

