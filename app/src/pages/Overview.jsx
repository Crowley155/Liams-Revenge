import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCase } from '../data/useCase';
import DocLink from '../components/DocLink';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  generateKoraRequests, fetchKoraRequests, markKoraSent, updateKoraRequest,
  uploadDocument, fetchDocuments, fetchEntities, getJobStatus,
} from '../api/client';

export default function Overview() {
  const data = useCase();
  const { isAuthenticated } = useAuth();
  const ageLabel = data.meta?.studentAgeLabel || 'six-year-old';
  const videoUrl = data.meta?.videoUrl;
  const [showVideo, setShowVideo] = useState(false);

  return (
    <div className="space-y-10 animate-fade-up">
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
              className="w-full sm:w-auto shrink-0 px-5 py-3 sm:py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all animate-pulse-subtle text-center shadow-[0_0_20px_var(--color-accent-glow)]"
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
            According to the incident report, five JCPRD staff were outside. None witnessed
            the attack. The child sustained visible injuries and was kept home for a week on
            pediatrician's orders.
          </p>
          <p>
            Based on available records, neither JCPRD nor USD 232 conducted an investigation.
            Each entity directed the parent to the other. The parent filed police reports, a DCF
            complaint, and formal grievances independently.
          </p>
        </div>

        <div className="mt-6 bg-surface-alt border-l-4 border-accent rounded-r-lg p-5">
          <p className="text-sm font-semibold text-accent mb-2">The Core Problem</p>
          <p className="text-sm leading-relaxed">
            Every signal available to a parent, including the district's website, school staff
            communications, the registration process, and the lease itself, indicated this
            program adhered to district standards. The district's own board policies (KG, JGFB,
            JDDC, JDDB) require employee presence, approved supervision, bullying prevention,
            and crime reporting on school property. The lease binds JCPRD to all of them.
            K.S.A. 72-1421(c) binds the district to the entire KDHE child care licensing
            chapter. Based on available records, these policies do not appear to have been
            applied in this instance. The independent nature of JCPRD's operation was not
            communicated to parents during registration or in prior communications.
          </p>
          <Link
            to="/non-compliance"
            className="inline-block mt-3 text-xs text-accent hover:text-accent-hover font-medium"
          >
            See the full non-compliance breakdown →
          </Link>
        </div>
      </section>

      {/* Section 2: The Manufactured Trust */}
      <section className="animate-fade-up delay-2">
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
            The "separate entity" characterization appears in records only after the assault:
            Principal Balthazor used it in her response (DOC-004), and Alvie Cater used it
            in his reply to the parent's complaint (DOC-012). Based on available records,
            this distinction was not communicated during registration or in prior parent
            communications. JCPRD's own handbook states its programs "function independently"
            (<DocLink id="AUTH-41" />), though the lease agreement requires compliance with
            all board policies.
          </p>
          <p className="text-sm leading-relaxed">
            The incident report states "no medical treatment was necessary," though the child
            was subsequently under pediatric care and a DCF report was filed. The report lists
            witnesses who did not observe the assault, and JCPRD Manager Jennifer Anderson stated
            it was "written the day the incident occurred; does not include later information."
            <DocLink id="DOC-017" />
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
                      {req.status === 'draft' && (
                        <button
                          onClick={() => handleMarkSent(req)}
                          className="text-[11px] font-medium px-3 py-1 rounded bg-success/15 text-success hover:bg-success/30 transition-colors"
                        >
                          Mark as Sent
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

