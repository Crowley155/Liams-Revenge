import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import {
  fetchProfile, fetchEntities, startResearch, resetResearch,
  startEnrichment, updateIdentity,
  confirmSocialProfile, dismissSocialProfile,
} from '../api/client';
import useResearchJob from '../hooks/useResearchJob';
import DocLink from '../components/DocLink';
import { printDocument } from '../utils/printPdf';
import EditableField from '../components/EditableField';
import ConfidenceBar from '../components/ConfidenceBar';
import SourceBadge from '../components/SourceBadge';

const CAT_LABELS = {
  statement: 'Statement',
  quote: 'Quote',
  vote: 'Vote',
  position: 'Position',
  action: 'Action',
  relationship: 'Relationship',
  bio: 'Bio',
  contact: 'Contact',
};

const CAT_COLORS = {
  statement: 'bg-accent/15 text-accent',
  quote: 'bg-info/15 text-info',
  vote: 'bg-warning/15 text-warning',
  position: 'bg-success/15 text-success',
  action: 'bg-danger/15 text-danger',
  relationship: 'bg-info/15 text-info',
  bio: 'bg-text-dim/15 text-text-dim',
  contact: 'bg-text-dim/15 text-text-dim',
};

const SOURCE_BADGE = {
  manual: { label: 'Curated', className: 'bg-info/15 text-info' },
  pipeline: { label: 'Researched', className: 'bg-accent/15 text-accent' },
  both: { label: 'Curated + Researched', className: 'bg-success/15 text-success' },
};

function FactCard({ fact }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 card-hover" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${CAT_COLORS[fact.category] || CAT_COLORS.bio}`}>
          {CAT_LABELS[fact.category] || fact.category}
        </span>
        {fact.date && (
          <span className="text-[11px] text-text-dim shrink-0">{fact.date}</span>
        )}
      </div>
      <p className="text-sm text-text leading-relaxed">{fact.content}</p>
      {fact.source_url && (
        <a
          href={fact.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-xs text-accent hover:text-accent-hover transition-colors truncate max-w-full"
        >
          {fact.source_title || fact.source_url}
        </a>
      )}
      <div className="flex items-center gap-3 mt-2">
        <span className="text-[10px] text-text-dim">
          Confidence: {Math.round(fact.confidence * 100)}%
        </span>
        {fact.verified && (
          <span className="text-[10px] text-success font-medium">Verified</span>
        )}
      </div>
    </div>
  );
}

function InfoTip({ tip }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);

  function handleEnter() {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setShow(true);
  }

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
        className="inline-flex items-center justify-center cursor-help select-none text-text-dim/30 hover:text-text-dim/60 transition-colors text-[0.65em] font-normal ml-1 align-middle"
        aria-label="More info"
      >
        ?
      </span>
      {show && createPortal(
        <div
          style={{ left: pos.x, top: pos.y }}
          className="fixed z-[9999] -translate-x-1/2 -translate-y-full pointer-events-none"
        >
          <div className="mb-2 px-3 py-2 text-[11px] leading-relaxed text-text bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg max-w-[260px] text-center"
            style={{ boxShadow: '0 4px 24px rgba(0,0,0,.45)' }}
          >
            {tip}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Section({ title, children, count, tip }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <section className="animate-fade-up">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        {title}
        {tip && <InfoTip tip={tip} />}
        {count != null && (
          <span className="text-xs font-normal text-text-dim bg-surface-alt px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

export default function ProfileDetail() {
  const { caseId, personId } = useParams();
  const [profile, setProfile] = useState(null);
  const [entities, setEntities] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [_saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    fetchProfile(personId).then(setProfile).catch(() => {});
  }, [personId]);

  const { job, isRunning, isDone, error: jobError, start: startJob, cancel: cancelJob } = useResearchJob({
    onPoll: reload,
    onComplete: reload,
  });

  const { job: enrichJob, isRunning: enrichRunning, isDone: enrichDone, error: enrichJobError, start: startEnrichJob, cancel: cancelEnrich } = useResearchJob({
    onPoll: reload,
    onComplete: reload,
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchProfile(personId),
      fetchEntities(caseId).catch(() => []),
    ])
      .then(([p, e]) => { setProfile(p); setEntities(e); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [caseId, personId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-danger text-sm">{error || 'Profile not found'}</p>
        <Link to={`/cases/${caseId}/people`} className="text-accent hover:text-accent-hover text-sm">
          &larr; Back to People
        </Link>
      </div>
    );
  }

  async function handleResearch() {
    setLaunching(true);
    try {
      const j = await startResearch({
        name: profile.name,
        role: profile.role,
        organization: profile.organization,
        state: profile.state || 'KS',
        case_id: caseId,
        person_id: profile.id,
      });
      startJob(j.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLaunching(false);
    }
  }

  async function handleEnrich() {
    setEnriching(true);
    try {
      const j = await startEnrichment(personId);
      startEnrichJob(j.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnriching(false);
    }
  }

  async function saveField(field, value) {
    setSaving(true);
    try {
      const updated = await updateIdentity(personId, { [field]: value });
      setProfile(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetResearch() {
    setResetting(true);
    try {
      const updated = await resetResearch(profile.id);
      setProfile(updated);
      setConfirmReset(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setResetting(false);
    }
  }

  const { battle_card: bc, facts = [], contact, curated_bio, curated_quotes = [], entity_ids = [] } = profile;
  const badge = SOURCE_BADGE[profile.source] || SOURCE_BADGE.manual;
  const hasResearch = facts.length > 0 || !!bc;
  const hasPipelineData = hasResearch
    || (profile.social_profiles?.length > 0)
    || (profile.employer_history?.length > 0)
    || (profile.education?.length > 0)
    || (profile.addresses?.length > 0)
    || (profile.enrichment_sources?.length > 0);

  const affiliatedEntities = entities.filter((e) => entity_ids.includes(e.id));

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-up">
      {/* Header */}
      <div>
        <Link to={`/cases/${caseId}/people`} className="text-xs text-text-dim hover:text-accent transition-colors mb-4 inline-block">
          &larr; Back to People
        </Link>
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center text-xl font-bold text-accent shrink-0">
            {profile.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{profile.name}</h1>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badge.className}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-text-dim text-sm">{profile.role} — {profile.organization}</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {facts.length > 0 && (
                <span className="text-text-dim text-xs">{facts.length} facts</span>
              )}
              {profile.created_at && (
                <span className="text-text-dim text-xs">
                  Since {new Date(profile.created_at).toLocaleDateString()}
                </span>
              )}
            </div>
            {affiliatedEntities.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {affiliatedEntities.map((ent) => (
                  <Link
                    key={ent.id}
                    to={`/cases/${caseId}/entities/${ent.id}`}
                    className="text-[11px] bg-surface-alt border border-border rounded-full px-3 py-1 text-text-dim hover:text-accent hover:border-accent/30 transition-colors"
                  >
                    {ent.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Research + Enrichment triggers */}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button
                onClick={handleResearch}
                disabled={launching || isRunning}
                className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-xs font-semibold text-background transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:cursor-not-allowed disabled:opacity-50"
                title="Searches the web for public statements, votes, positions, and other facts about this person"
              >
                {launching ? 'Starting...' : isRunning ? 'Researching...' : hasResearch ? 'Re-scan Web' : 'Find Facts'}
              </button>
              <button
                onClick={handleEnrich}
                disabled={enriching || enrichRunning}
                className="inline-flex min-h-11 items-center rounded-md border border-info/35 bg-info/15 px-4 text-xs font-semibold text-info transition-colors hover:bg-info/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-info/35 disabled:cursor-not-allowed disabled:opacity-50"
                title="Searches for social media profiles, employment history, and public records for this person"
              >
                {enriching ? 'Starting...' : enrichRunning ? 'Enriching...' : profile.enriched_at ? 'Re-discover Profiles' : 'Find Profiles'}
              </button>
              {isRunning && (
                <button
                  onClick={cancelJob}
                  className="inline-flex min-h-11 items-center rounded-md border border-danger/35 bg-danger/15 px-4 text-xs font-semibold text-danger transition-colors hover:bg-danger/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/35"
                >
                  Cancel
                </button>
              )}
              {isRunning && job && (
                <span className="text-xs text-text-dim flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  {job.status} {job.facts_found > 0 && `\u2014 ${job.facts_found} facts`}
                </span>
              )}
              {isDone && job?.status === 'complete' && (
                <span className="text-xs text-success">Done — {job.facts_found} facts found</span>
              )}
              {isDone && job?.status === 'failed' && (
                <span className="text-xs text-danger">Failed: {job.error || 'unknown error'}</span>
              )}
              {jobError && <span className="text-xs text-danger">{jobError}</span>}
              {enrichRunning && (
                <button
                  onClick={cancelEnrich}
                  className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-danger/15 text-danger hover:bg-danger/25 transition-colors"
                >
                  Cancel
                </button>
              )}
              {enrichRunning && enrichJob && (
                <span className="text-xs text-text-dim flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  {enrichJob.status}
                </span>
              )}
              {enrichDone && enrichJob?.status === 'complete' && <span className="text-xs text-success">Enrichment complete</span>}
              {enrichDone && enrichJob?.status === 'failed' && <span className="text-xs text-danger">Enrich failed: {enrichJob.error || 'unknown'}</span>}
              {enrichJobError && <span className="text-xs text-danger">{enrichJobError}</span>}
            </div>
            {profile.enrichment_sources?.length > 0 && (
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-text-dim">Sources:</span>
                {profile.enrichment_sources.map((src, i) => (
                  <SourceBadge key={i} source={src} />
                ))}
                {profile.enriched_at && (
                  <span className="text-[10px] text-text-dim ml-1">
                    (last {new Date(profile.enriched_at).toLocaleDateString()})
                  </span>
                )}
              </div>
            )}

            {/* Reset / Delete actions */}
            {hasPipelineData && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {!confirmReset ? (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="text-[11px] font-medium px-3 py-1 rounded-lg bg-warning/15 text-warning hover:bg-warning/25 transition-colors"
                  >
                    Reset Research
                  </button>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] text-warning">Clear all research + enrichment data?</span>
                    <button
                      onClick={handleResetResearch}
                      disabled={resetting}
                      className="text-[11px] font-bold px-3 py-1 rounded-lg bg-warning text-white hover:bg-warning/80 disabled:opacity-50 transition-colors"
                    >
                      {resetting ? 'Clearing...' : 'Yes, reset'}
                    </button>
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="text-[11px] px-2 py-1 text-text-dim hover:text-text transition-colors"
                    >
                      Cancel
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Curated Bio */}
      {curated_bio && (
        <div className="bg-surface border border-info/30 rounded-xl p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-info mb-3">Case Background <InfoTip tip="Hand-written summary of this person's role in the case. Set during initial data seeding." /></h2>
          <p className="text-sm text-text leading-relaxed">{curated_bio}</p>
        </div>
      )}

      {/* Curated Quotes */}
      {curated_quotes.length > 0 && (
        <Section title="Key Quotes from Evidence" count={curated_quotes.length} tip="Direct quotes pulled from uploaded case documents and evidence files.">
          <div className="space-y-3">
            {curated_quotes.map((q, i) => (
              <div key={i} className="rounded-md border border-border bg-background/45 px-3 py-2">
                <p className="text-sm italic text-text leading-relaxed">"{q.text}"</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-text-dim">
                  {q.date && <span>{q.date}</span>}
                  {q.doc_id && <DocLink id={q.doc_id}>{q.doc_id}</DocLink>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Contact & Identity — editable */}
      <div className="bg-surface border border-accent/20 rounded-xl p-5 animate-fade-up" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-xs font-bold uppercase tracking-wider text-accent mb-3">Contact &amp; Identity <InfoTip tip="Editable contact info and identity anchors. Click 'edit' to change any field. Used as seed data for enrichment and research." /></h2>
        <div className="space-y-0.5">
          <EditableField label="Email" value={contact?.email} onSave={(v) => saveField('email', v)} placeholder="name@example.com" />
          <EditableField label="Phone" value={contact?.phone} onSave={(v) => saveField('phone', v)} placeholder="913-555-1234" />
          <EditableField label="LinkedIn URL" value={contact?.linkedin_url} onSave={(v) => saveField('linkedin_url', v)} placeholder="https://linkedin.com/in/username" />
          <EditableField label="Address" value={contact?.address} onSave={(v) => saveField('address', v)} placeholder="123 Main St, City, ST" />
        </div>
        {(contact?.twitter_handle || contact?.facebook_url || contact?.other_urls?.length > 0) && (
          <div className="mt-3 pt-3 border-t border-border grid gap-2 sm:grid-cols-2">
            {contact.twitter_handle && (
              <a href={`https://twitter.com/${contact.twitter_handle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors">
                <span className="text-text-dim">X/Twitter</span> {contact.twitter_handle}
              </a>
            )}
            {contact.facebook_url && (
              <a href={contact.facebook_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors">
                <span className="text-text-dim">Facebook</span> Profile &rarr;
              </a>
            )}
            {contact.other_urls?.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent-hover transition-colors truncate">
                {url}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Basic Identity Fields — editable */}
      <div className="bg-surface border border-border rounded-xl p-5 animate-fade-up" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim mb-3">Basic Info <InfoTip tip="Location and demographic fields. Used to disambiguate this person from others with the same name during research." /></h2>
        <div className="space-y-0.5">
          <EditableField label="City" value={profile.city} onSave={(v) => saveField('city', v)} placeholder="e.g. Lenexa" />
          <EditableField label="County" value={profile.county} onSave={(v) => saveField('county', v)} placeholder="e.g. Johnson" />
          <EditableField label="Date of Birth" value={profile.date_of_birth} onSave={(v) => saveField('date_of_birth', v)} placeholder="YYYY-MM-DD" />
          <EditableField label="Gender" value={profile.gender} onSave={(v) => saveField('gender', v)} />
        </div>
      </div>

      {/* Social Profiles — with confirm / dismiss */}
      {profile.social_profiles?.filter((sp) => sp.status !== 'dismissed').length > 0 && (
        <Section
          title="Social Profiles"
          count={profile.social_profiles.filter((sp) => sp.status !== 'dismissed').length}
          tip="Discovered social media profiles. Confirm a profile to scrape it for data (employment, education, intel). Dismiss to remove it and any data it contributed."
        >
          <div className="space-y-2">
            {profile.social_profiles
              .filter((sp) => sp.status !== 'dismissed')
              .map((sp, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 bg-surface border rounded-lg p-3 transition-colors ${
                  sp.status === 'confirmed'
                    ? 'border-success/40'
                    : 'border-border hover:border-accent/40'
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider text-accent w-20 shrink-0">
                  {sp.platform}
                </span>
                <a
                  href={sp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:text-accent-hover transition-colors truncate flex-1"
                >
                  {sp.username || sp.url}
                </a>
                <ConfidenceBar value={sp.confidence || 0} />
                <SourceBadge source={sp.source} />
                {sp.status === 'confirmed' ? (
                  <span className="text-[10px] text-success font-medium flex items-center gap-1 shrink-0">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    Confirmed
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={async () => {
                        try {
                          const updated = await confirmSocialProfile(personId, sp.url);
                          setProfile(updated);
                        } catch (e) { setError(e.message); }
                      }}
                      className="text-[10px] font-medium px-2.5 py-1 rounded bg-success/15 text-success hover:bg-success/30 transition-colors"
                      title="Confirm this is the right person — triggers scraping and data extraction from this profile"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const updated = await dismissSocialProfile(personId, sp.url);
                          setProfile(updated);
                        } catch (e) { setError(e.message); }
                      }}
                      className="text-[10px] font-medium px-2.5 py-1 rounded bg-text-dim/10 text-text-dim hover:bg-danger/15 hover:text-danger transition-colors"
                      title="Not this person — removes this profile and any data extracted from it"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Profile Intelligence */}
      {profile.profile_intel?.length > 0 && (
        <div className="bg-surface border border-info/30 rounded-xl p-5 animate-fade-up" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-info mb-3">Profile Notes <InfoTip tip="Findings from confirmed public profile sources, including affiliations, connections, career moves, and other due diligence details." /></h2>
          <div className="space-y-2">
            {profile.profile_intel.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-text">
                <span className="text-info mt-0.5 shrink-0">&#x2022;</span>
                <p className="leading-relaxed">{typeof item === 'string' ? item : item.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employment History */}
      {profile.employer_history?.length > 0 && (
        <Section title="Employment History" count={profile.employer_history.length} tip="Jobs and roles found from enrichment sources (LinkedIn, Clay, public records). Source badge shows where each entry came from.">
          <div className="space-y-2">
            {profile.employer_history.map((emp, i) => (
              <div key={i} className="flex items-start gap-3 bg-surface border border-border rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text">{emp.title || 'Unknown title'}</p>
                  <p className="text-xs text-text-dim">{emp.organization}</p>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <SourceBadge source={emp.source} />
                  {emp.current && <span className="text-[10px] text-success font-medium">Current</span>}
                  {(emp.start_date || emp.end_date) && (
                    <p className="text-[11px] text-text-dim">
                      {emp.start_date || '?'} — {emp.current ? 'Present' : (emp.end_date || '?')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Education */}
      {profile.education?.length > 0 && (
        <Section title="Education" count={profile.education.length} tip="Schools, degrees, and programs found from enrichment sources.">
          <div className="space-y-2">
            {profile.education.map((edu, i) => (
              <div key={i} className="flex items-start gap-3 bg-surface border border-border rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text">{edu.institution}</p>
                  {(edu.degree || edu.field) && (
                    <p className="text-xs text-text-dim">
                      {[edu.degree, edu.field].filter(Boolean).join(' — ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <SourceBadge source={edu.source} />
                  {edu.year && <span className="text-[11px] text-text-dim">{edu.year}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Addresses */}
      {profile.addresses?.length > 0 && (
        <Section title="Known Locations" count={profile.addresses.length} tip="Physical addresses and cities associated with this person from enrichment sources and public records.">
          <div className="space-y-2">
            {profile.addresses.map((addr, i) => (
              <div key={i} className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3">
                <span className="text-xs text-text-dim w-16 shrink-0 capitalize">{addr.type}</span>
                <span className="text-sm text-text flex-1">
                  {[addr.street, addr.city, addr.state, addr.zip_code].filter(Boolean).join(', ')}
                </span>
                {addr.current && <span className="text-[10px] text-success">Current</span>}
                <SourceBadge source={addr.source} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Known Associates */}
      {profile.known_associates?.length > 0 && (
        <Section title="Known Associates" count={profile.known_associates.length} tip="Other people connected to this person, found from enrichment or case evidence.">
          <div className="flex flex-wrap gap-2">
            {profile.known_associates.map((name, i) => (
              <span key={i} className="text-xs bg-surface-alt border border-border rounded-full px-3 py-1 text-text-dim">
                {name}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Battle Card Summary */}
      {bc && (
        <div className="bg-surface border border-accent/30 rounded-xl p-6" style={{ boxShadow: 'var(--shadow-elevated)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-accent">Battle Card <InfoTip tip="AI-synthesized summary of this person based on all researched facts. The 'so what' of everything we know." /></h2>
            <button
              onClick={() => {
                const sections = [];
                if (bc.summary) sections.push(bc.summary);
                if (bc.key_positions?.length) sections.push('\n\nKEY POSITIONS:\n' + bc.key_positions.map((p) => `• ${p}`).join('\n'));
                if (bc.contradictions?.length) sections.push('\n\nCONTRADICTIONS:\n' + bc.contradictions.map((c) => `• ${c}`).join('\n'));
                if (bc.organizational_ties?.length) sections.push('\n\nORGANIZATIONAL TIES:\n' + bc.organizational_ties.join(', '));
                if (bc.action_items?.length) sections.push('\n\nACTION ITEMS:\n' + bc.action_items.map((a) => `• ${a}`).join('\n'));
                if (facts.length) sections.push(`\n\nFACTS (${facts.length}):\n` + facts.map((f) => `[${f.category}] ${f.content} (conf: ${Math.round(f.confidence * 100)}%)`).join('\n'));
                printDocument({
                  title: `Battle Card — ${profile.name}`,
                  body: sections.join('').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'),
                  meta: {
                    'Name': profile.name,
                    'Role': `${profile.role} — ${profile.organization}`,
                    'Facts': `${facts.length}`,
                    'Generated': new Date().toLocaleDateString(),
                  },
                });
              }}
              className="text-[10px] font-medium px-3 py-1 rounded bg-surface-alt text-text-dim hover:text-text hover:bg-border/40 transition-colors"
            >
              Download PDF
            </button>
          </div>
          <p className="text-sm text-text leading-relaxed">{bc.summary}</p>
        </div>
      )}

      {/* Key Positions */}
      <Section title="Key Positions" count={bc?.key_positions?.length} tip="Notable stances, policy positions, or public commitments found in research sources. Review the underlying sources before relying on them.">
        <div className="space-y-2">
          {bc?.key_positions?.map((pos, i) => (
            <div key={i} className="rounded-md border border-border bg-background/45 px-3 py-2">
              <p className="text-sm text-text leading-relaxed">{pos}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Contradictions */}
      <Section title="Contradictions" count={bc?.contradictions?.length} tip="Places where this person's actions contradict their public statements or stated positions.">
        <div className="space-y-2">
          {bc?.contradictions?.map((c, i) => (
            <div key={i} className="rounded-md border border-border bg-background/45 px-3 py-2">
              <p className="text-sm text-text leading-relaxed">{c}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Organizational Ties */}
      <Section title="Organizational Ties" count={bc?.organizational_ties?.length} tip="Organizations, boards, committees, or groups this person is affiliated with.">
        <div className="flex flex-wrap gap-2">
          {bc?.organizational_ties?.map((org, i) => (
            <span key={i} className="text-xs bg-surface-alt border border-border rounded-full px-3 py-1 text-text-dim">
              {org}
            </span>
          ))}
        </div>
      </Section>

      {/* All Facts by Category */}
      {facts.length > 0 && (
        <Section title="All Facts" count={facts.length} tip="Every individual fact found about this person from web research. Each has a confidence score and source link.">
          <div className="grid gap-3 sm:grid-cols-2">
            {facts.map((f) => (
              <FactCard key={f.id} fact={f} />
            ))}
          </div>
        </Section>
      )}

      {/* Action Items */}
      <Section title="Action Items" count={bc?.action_items?.length} tip="Concrete next steps suggested by the research — meetings to attend, records to request, complaints to file, etc.">
        <div className="space-y-2">
          {bc?.action_items?.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-text">
              <span className="text-accent mt-0.5 shrink-0">&#x2022;</span>
              <p className="leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
