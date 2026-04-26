import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCase } from '../data/useCase';
import DocLink from '../components/DocLink';
import { useAuth } from '../auth/AuthContext';
import {
  generateKoraRequests, fetchKoraRequests, markKoraSent, updateKoraRequest,
  uploadDocument, fetchDocuments, fetchEntities, getJobStatus,
} from '../api/client';
import { printDocument } from '../utils/printPdf';

export default function Overview() {
  const data = useCase();
  const { isAuthenticated } = useAuth();
  const ageLabel = data.meta?.studentAgeLabel || 'six-year-old';
  const videoUrl = data.meta?.videoUrl;
  const [showVideo, setShowVideo] = useState(false);

  return (
    <div className="space-y-14 sm:space-y-20 animate-fade-up">
      {/* Hero image */}
      <div className="relative -mx-4 sm:-mx-6 -mt-6 mb-6 overflow-hidden rounded-b-2xl">
        <img
          src="/images/hero-briefing.png"
          alt=""
          className="w-full h-56 sm:h-80 object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background from-10% via-background/70 via-50% to-transparent" />
      </div>

      {/* Section 1: The Incident + Core Problem */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent/70 mb-3">
              Crowley v. USD 232 / JCPRD
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
              You think your kids are safe at school.
            </h2>
            <p className="text-lg sm:text-xl text-text-dim/80 mb-6 sm:mb-8 font-light">
              So did I.
            </p>
          </div>
          {videoUrl && (
            <button
              onClick={() => setShowVideo(true)}
              className="w-full sm:w-auto shrink-0 px-5 py-3 sm:py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all animate-pulse-subtle text-center shadow-[0_0_20px_var(--color-accent-glow)]"
            >
              ▶ Tell me why I care
            </button>
          )}
        </div>

        {showVideo && videoUrl && (
          <VideoModal url={videoUrl} onClose={() => setShowVideo(false)} />
        )}

        <div className="prose-custom space-y-5 text-[15px] leading-[1.8] text-text/90">
          <p className="text-pretty">
            On <strong className="text-text">April 2, 2026</strong>, my {ageLabel} was
            assaulted by a nine-year-old at Mize Elementary — during what I was told was
            a supervised after-school program. According to the incident report, five staff
            were outside. None of them saw it happen. His pediatrician found the injuries
            concerning enough to keep him home for a week and — as a mandatory reporter —
            file a report with DCF. The program's incident report, filed the same day,
            concluded "no medical treatment was necessary."
          </p>
          <p className="text-pretty">
            The program filed an incident report the same day. It characterized my
            kindergartener as the instigator, listed staff as "witnesses" who by
            the report's own admission didn't see the event, concluded "no medical
            treatment was necessary" without consulting a medical professional, and
            never mentioned the other child's age, size, or grade. My son was
            questioned in the same room as his attacker. The report was sent to me
            as though it closed the matter.
          </p>
          <p className="text-pretty">
            It didn't. I went to the school. The principal told me JCPRD is a
            "separate entity" — not their program, not their responsibility. I went
            to the district. An administrator offered a meeting, then canceled it
            the next morning. I went back to the program. They directed me to the
            school. Every person I spoke to said they care about student safety.
            Not one of them said they'd look into what happened.
          </p>
          <p className="text-pretty">
            I filed a police report. I filed a DCF complaint. I filed formal
            grievances with both entities. I did every single thing the system
            tells a parent to do. And when none of it produced an investigation,
            an acknowledgment, or a single policy change — I started building this.
          </p>
          <p className="text-pretty font-medium text-text">
            I'm not going away. And this isn't about anger. It's about reform.
            Every document on this site is sourced. Every claim is grounded in
            publicly available records, statutes, and policies. The goal isn't
            punishment — it's to make sure the next family doesn't go through
            what mine did.
          </p>
        </div>

        <div className="mt-8 sm:mt-10 bg-surface-alt border-l-4 border-accent rounded-r-xl p-6 sm:p-8 relative overflow-hidden">
          <img
            src="/images/core-problem.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-[0.06] pointer-events-none"
          />
          <div className="relative space-y-4">
            <h3 className="text-lg sm:text-xl font-bold text-accent mb-3 tracking-tight">
              What No One Told Me
            </h3>
            <p className="text-[15px] leading-[1.8] text-text/85 text-pretty">
              Every signal I received as a parent — the district website, school staff,
              the registration process, the printed policies — told me my son was in a
              district-supervised program operating under school safety standards.
            </p>
            <p className="text-[15px] leading-[1.8] text-text/85 text-pretty">
              The lease agreement requires JCPRD to follow every USD 232 board policy.
              Those policies require an employee on duty, bullying prevention, and mandatory
              crime reporting on school property. Kansas statute binds the district to the
              entire KDHE childcare licensing chapter when they authorize a program on school
              grounds.
            </p>
            <p className="text-[15px] leading-[1.8] text-text text-pretty font-medium">
              None of it was enforced. And the phrase "separate entity" didn't appear in
              a single communication until after my child was hurt.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: The Manufactured Trust */}
      <section className="animate-fade-up delay-2">
        <div className="border-t border-border/60 mb-10 sm:mb-14" />
        <div className="mb-6 rounded-xl overflow-hidden">
          <img
            src="/images/manufactured-trust.png"
            alt=""
            className="w-full h-36 sm:h-48 object-cover opacity-25"
          />
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">The Manufactured Trust</h3>
        <p className="text-sm sm:text-base text-text-dim/80 leading-relaxed mb-8 sm:mb-10 max-w-2xl text-pretty">
          Every parent who enrolled their child received the same message: this is a school
          program, with school standards, under school supervision. Here's what we were told —
          in their own words.
        </p>

        <div className="space-y-8">
          <EvidenceCluster
            title="They Said It Was Their Program"
            intro="When you search the district website for childcare, this is what you find. Not a disclaimer. Not a third-party notice. A service the district says it offers."
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
                source: 'Deputy Superintendent Memo to USD 232 Board',
                sourceId: 'AUTH-43',
                detail: 'The district\'s own Deputy Superintendent presented this to the Board as a service for "our families" — not a third-party commercial arrangement. When the district calls it theirs, parents believe them.',
              },
            ]}
          />

          <EvidenceCluster
            title="They Said It Was Safe"
            intro="The program, the school, and Kansas law all told parents the same thing: professional standards, licensed care, direct supervision. Here's what that looked like in writing."
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
                source: 'Mize Elementary School Staff, Sep 18, 2025',
                sourceId: 'DOC-028',
                detail: 'Seven months before the assault, school staff gave me an explicit guarantee of age separation and direct supervision — on the same property where JCPRD operates. When you hear this from the school, you believe the after-school program follows the same rules.',
              },
            ]}
          />

          <EvidenceCluster
            title="The Law Says They're Responsible"
            intro="The district wrote the contract. They kept enforcement power. Kansas statute binds them to childcare licensing. This isn't ambiguous — it's just unenforced."
            items={[
              {
                quote: 'The Lessor or its designee may take any action that may be necessary to cure... any material breach.',
                source: 'Lease Agreement §7(c)',
                sourceId: 'DOC-021',
                detail: 'The district didn\'t just have the right to enforce compliance — they gave themselves explicit authority to remedy any material breach. They wrote the enforcement mechanism into the contract. They never used it.',
              },
              {
                quote: null,
                source: 'Board Policies KG, JDDC, JDDB',
                sourceIds: ['BP-01', 'BP-03', 'BP-04'],
                detail: 'An employee on duty when outside groups use the building. A bullying prevention plan that applies on school property — no time-of-day exception. Mandatory reporting of assaults to law enforcement. The lease binds JCPRD to every one of these. Based on available records, none were followed.',
              },
              {
                quote: null,
                source: 'K.S.A. 72-1421(c)',
                sourceId: 'AUTH-51',
                detail: 'When a district authorizes a childcare facility on school property, this statute binds them to the full KDHE licensing chapter. The district calls this "childcare" in its own board memo, consent agenda, and website. They can\'t have it both ways.',
              },
            ]}
          />
        </div>

        <div className="mt-10 sm:mt-12 bg-surface border border-border rounded-xl p-6 sm:p-8 space-y-5">
          <p className="text-[15px] leading-[1.8] text-text/85 text-pretty">
            After the assault, the school principal called JCPRD a "separate entity"
            (<DocLink id="DOC-004" />). A district administrator used the same phrase in
            his reply to my formal complaint (<DocLink id="DOC-012" />). JCPRD's own
            handbook says their programs "function independently"
            (<DocLink id="AUTH-41" />). That language appears nowhere in the materials
            parents receive before enrollment.
          </p>
          <p className="text-[15px] leading-[1.8] text-text/85 text-pretty">
            The incident report says "no medical treatment was necessary" — my son was
            under pediatric care for a week. The report lists witnesses who didn't witness
            anything. The program manager acknowledged it was "written the day the incident
            occurred; does not include later information." <DocLink id="DOC-017" />
          </p>
          <p className="text-[15px] leading-[1.8] text-text font-medium text-pretty">
            I did everything a parent is supposed to do. I checked the website. I read the
            policies. I asked about supervision. The system gave me every reason to trust
            it — then told me it wasn't responsible.
          </p>
        </div>
      </section>

      {/* Section 4: KORA Requests + Document Upload (auth-gated) */}
      {isAuthenticated && <KoraSection />}

    </div>
  );
}

function KoraSection() {
  const [entities, setEntities] = useState([]);
  const [koraRequests, setKoraRequests] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genJobId, setGenJobId] = useState(null);
  const [filterEntity, setFilterEntity] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [copied, setCopied] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const pollRef = useRef(null);

  const loadData = useCallback(() => {
    fetchEntities().then(setEntities).catch(() => {});
    fetchKoraRequests().then(setKoraRequests).catch(() => {});
    fetchDocuments().then(setDocuments).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!genJobId) return;
    let cancelled = false;
    async function poll() {
      try {
        const job = await getJobStatus(genJobId);
        if (cancelled) return;
        if (job.status === 'complete' || job.status === 'failed') {
          setGenerating(false);
          setGenJobId(null);
          if (job.status === 'complete') {
            setError(null);
            loadData();
          } else {
            setError(job.error || 'KORA generation failed — check backend logs');
          }
          return;
        }
        pollRef.current = setTimeout(poll, 2000);
      } catch (err) {
        if (!cancelled) {
          setGenerating(false);
          setGenJobId(null);
          setError(`Polling failed: ${err.message}`);
        }
      }
    }
    poll();
    return () => { cancelled = true; clearTimeout(pollRef.current); };
  }, [genJobId, loadData]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const job = await generateKoraRequests();
      setGenJobId(job.id);
    } catch (err) {
      console.error(err);
      setError(`Failed to start generation: ${err.message}`);
      setGenerating(false);
    }
  }

  async function handleCopy(req) {
    await navigator.clipboard.writeText(req.letter_text);
    setCopied(req.id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleMarkSent(req) {
    try {
      const updated = await markKoraSent(req.id);
      setKoraRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocument(file, { entityIds: filterEntity ? [filterEntity] : [] });
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const filtered = filterEntity
    ? koraRequests.filter((r) => r.entity_ids.includes(filterEntity))
    : koraRequests;

  const CATEGORY_LABELS = {
    incident_reports: 'Incident Reports',
    communications: 'Communications',
    training: 'Training',
    policy: 'Policy',
    meeting_minutes: 'Meeting Minutes',
    inspection: 'Inspection',
    personnel: 'Personnel',
    financial: 'Financial',
  };

  const STATUS_COLORS = {
    draft: 'bg-text-dim/10 text-text-dim',
    sent: 'bg-accent/15 text-accent',
    fulfilled: 'bg-success/15 text-success',
    denied: 'bg-danger/15 text-danger',
    partial: 'bg-warning/15 text-warning',
  };

  return (
    <section className="animate-fade-up delay-3 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-bold">Records Requests</h3>
          <p className="text-xs text-text-dim">
            KORA requests generated from case evidence gaps and LLM analysis. Copy the letter, send it yourself.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="text-xs font-medium px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {generating ? 'Generating...' : koraRequests.length > 0 ? 'Regenerate KORA Requests' : 'Generate KORA Requests'}
          </button>
          {generating && (
            <span className="text-xs text-text-dim flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              Running LLM analysis...
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-xs text-danger leading-relaxed">{error}</p>
          <button onClick={() => setError(null)} className="text-danger/60 hover:text-danger text-sm shrink-0">&times;</button>
        </div>
      )}

      {/* Status pipeline summary */}
      {koraRequests.length > 0 && (
        <div className="flex items-center gap-1 text-[11px]">
          {['draft', 'sent', 'partial', 'fulfilled', 'denied'].map((s, i) => {
            const count = koraRequests.filter((r) => r.status === s).length;
            if (count === 0 && s !== 'draft' && s !== 'sent') return null;
            return (
              <span key={s} className="flex items-center gap-1">
                {i > 0 && <span className="text-text-dim/30 mx-1">&rarr;</span>}
                <span className={`px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[s]}`}>
                  {s} ({count})
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Entity filter chips */}
      {entities.length > 0 && koraRequests.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterEntity('')}
            className={`text-[11px] px-3 py-1 rounded-full border transition-colors ${
              !filterEntity ? 'bg-accent/15 text-accent border-accent/30' : 'text-text-dim border-border hover:border-accent/30'
            }`}
          >
            All ({koraRequests.length})
          </button>
          {entities.map((ent) => {
            const count = koraRequests.filter((r) => r.entity_ids.includes(ent.id)).length;
            if (count === 0) return null;
            return (
              <button
                key={ent.id}
                onClick={() => setFilterEntity(ent.id === filterEntity ? '' : ent.id)}
                className={`text-[11px] px-3 py-1 rounded-full border transition-colors ${
                  filterEntity === ent.id ? 'bg-accent/15 text-accent border-accent/30' : 'text-text-dim border-border hover:border-accent/30'
                }`}
              >
                {ent.name} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Request cards */}
      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((req) => {
            const isExpanded = expandedId === req.id;
            const entityNames = req.entity_ids
              .map((eid) => entities.find((e) => e.id === eid)?.name)
              .filter(Boolean);
            return (
              <div
                key={req.id}
                className="bg-surface border border-border rounded-lg overflow-hidden"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : req.id)}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-surface-alt/50 transition-colors"
                >
                  <span className="text-xs mt-0.5 shrink-0" style={{ transform: isExpanded ? 'rotate(90deg)' : '', transition: 'transform 0.15s' }}>
                    ▸
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text">{req.subject || 'Untitled Request'}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {entityNames.map((n) => (
                        <span key={n} className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                          {n}
                        </span>
                      ))}
                      {req.record_category && (
                        <span className="text-[10px] text-text-dim">
                          {CATEGORY_LABELS[req.record_category] || req.record_category}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[req.status] || STATUS_COLORS.draft}`}>
                    {req.status}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border/50 space-y-3">
                    {req.relevance && (
                      <p className="text-xs text-text-dim leading-relaxed mt-3">{req.relevance}</p>
                    )}
                    <div className="bg-bg rounded-lg p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap text-text-dim max-h-80 overflow-y-auto">
                      {req.letter_text || req.records_description}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleCopy(req)}
                        className="text-[11px] font-medium px-3 py-1 rounded bg-accent/15 text-accent hover:bg-accent/30 transition-colors"
                      >
                        {copied === req.id ? 'Copied!' : 'Copy Letter'}
                      </button>
                      <button
                        onClick={() => printDocument({
                          title: req.subject || 'KORA Request',
                          body: (req.letter_text || req.records_description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'),
                          meta: {
                            'Status': req.status,
                            'Category': CATEGORY_LABELS[req.record_category] || req.record_category,
                            'Entity': entityNames.join(', '),
                            ...(req.sent_at ? { 'Sent': new Date(req.sent_at).toLocaleDateString() } : {}),
                          },
                        })}
                        className="text-[11px] font-medium px-3 py-1 rounded bg-surface-alt text-text-dim hover:text-text hover:bg-border/40 transition-colors"
                      >
                        Download PDF
                      </button>
                      {req.status === 'draft' && (
                        <button
                          onClick={() => handleMarkSent(req)}
                          className="text-[11px] font-medium px-3 py-1 rounded bg-success/15 text-success hover:bg-success/30 transition-colors"
                        >
                          Mark as Sent
                        </button>
                      )}
                      {req.status === 'sent' && (
                        <button
                          onClick={async () => {
                            const updated = await updateKoraRequest(req.id, { status: 'fulfilled' });
                            setKoraRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
                          }}
                          className="text-[11px] font-medium px-3 py-1 rounded bg-success/15 text-success hover:bg-success/30 transition-colors"
                        >
                          Mark Fulfilled
                        </button>
                      )}
                      {req.status === 'sent' && (
                        <button
                          onClick={async () => {
                            const updated = await updateKoraRequest(req.id, { status: 'denied' });
                            setKoraRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
                          }}
                          className="text-[11px] font-medium px-3 py-1 rounded bg-danger/15 text-danger hover:bg-danger/30 transition-colors"
                        >
                          Mark Denied
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {koraRequests.length === 0 && !generating && (
        <div className="text-center py-8 bg-surface border border-border rounded-lg">
          <p className="text-sm text-text-dim">No KORA requests generated yet.</p>
          <p className="text-xs text-text-dim/60 mt-1">
            Click "Generate KORA Requests" to analyze the case and produce records request letters.
          </p>
        </div>
      )}

      {/* Document Upload */}
      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h4 className="text-sm font-bold">Uploaded Documents</h4>
            <p className="text-xs text-text-dim">
              Upload KORA responses, evidence files, or any document to index in the case intelligence system.
            </p>
          </div>
          <label className="text-xs font-medium px-4 py-1.5 rounded-lg bg-surface border border-border hover:border-accent/30 text-text-dim hover:text-accent transition-colors cursor-pointer">
            {uploading ? 'Uploading...' : 'Upload File'}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.docx,.eml,.txt,.md"
            />
          </label>
        </div>

        {documents.length > 0 && (
          <div className="space-y-2">
            {documents.slice(0, 10).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-2.5"
              >
                <span className="text-xs font-mono text-accent shrink-0">
                  {doc.file_type?.toUpperCase() || 'FILE'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text truncate">{doc.filename}</p>
                  <p className="text-[11px] text-text-dim">
                    {doc.chunk_count > 0 ? `${doc.chunk_count} chunks indexed` : doc.status}
                    {doc.file_size > 0 && ` · ${(doc.file_size / 1024).toFixed(0)} KB`}
                  </p>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                  doc.status === 'indexed' ? 'bg-success/15 text-success'
                    : doc.status === 'failed' ? 'bg-danger/15 text-danger'
                    : 'bg-text-dim/10 text-text-dim'
                }`}>
                  {doc.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function VideoModal({ url, onClose }) {
  const embedUrl = url + (url.includes('?') ? '&' : '?') + 'autoplay=1&badge=0&autopause=0&player_id=0&app_id=58479';

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/90 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        <div className="w-full" style={{ maxWidth: '420px' }}>
          <div className="flex justify-end mb-2">
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white text-sm font-medium px-3 py-2"
            >
              Close &times;
            </button>
          </div>
          <div style={{ padding: '177.78% 0 0 0', position: 'relative' }}>
            <iframe
              src={embedUrl}
              title="Why You Care"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
              frameBorder="0"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

function EvidenceCluster({ title, intro, items }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="px-6 pt-6 pb-4">
        <h4 className="text-base font-bold tracking-tight mb-1.5">{title}</h4>
        <p className="text-sm text-text-dim/80 leading-relaxed">{intro}</p>
      </div>
      <div className="divide-y divide-border/50">
        {items.map((item, i) => (
          <div key={i} className="px-6 py-5">
            {item.quote && (
              <blockquote className="text-sm italic text-text-dim/90 leading-relaxed border-l-2 border-accent/40 pl-4 mb-3">
                "{item.quote}"
              </blockquote>
            )}
            <p className="text-[15px] leading-[1.75] text-text/90 text-pretty">{item.detail}</p>
            <div className="mt-3 text-xs text-text-dim/70 flex flex-wrap gap-2">
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
