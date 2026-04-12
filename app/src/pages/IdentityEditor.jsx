import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchProfile, startEnrichment, updateIdentity, confirmIdentity } from '../api/client';
import useResearchJob from '../hooks/useResearchJob';

const SOURCE_COLORS = {
  serpapi_kg: 'bg-blue-400/15 text-blue-400',
  serpapi_organic: 'bg-blue-300/15 text-blue-300',
  pdl: 'bg-purple-400/15 text-purple-400',
  maigret: 'bg-orange-400/15 text-orange-400',
  linkedin_scrape: 'bg-sky-400/15 text-sky-400',
  facebook_scrape: 'bg-indigo-400/15 text-indigo-400',
  twitter_scrape: 'bg-cyan-400/15 text-cyan-400',
  manual: 'bg-success/15 text-success',
};

function SourceBadge({ source }) {
  if (!source) return null;
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${SOURCE_COLORS[source] || 'bg-text-dim/15 text-text-dim'}`}>
      {source}
    </span>
  );
}

function ConfidenceBar({ value }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? 'bg-success' : pct >= 40 ? 'bg-warning' : 'bg-danger';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-surface-alt rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-text-dim">{pct}%</span>
    </div>
  );
}

function EditableField({ label, value, onSave, placeholder = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  useEffect(() => { setDraft(value || ''); }, [value]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-xs text-text-dim w-28 shrink-0">{label}</span>
        <span className="text-sm text-text flex-1 truncate">{value || <span className="italic text-text-dim/50">—</span>}</span>
        <button onClick={() => setEditing(true)} className="text-[10px] text-accent hover:text-accent-hover transition-colors">edit</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-text-dim w-28 shrink-0">{label}</span>
      <input
        autoFocus
        className="flex-1 text-sm bg-surface-alt border border-border rounded px-2 py-1 text-text focus:border-accent focus:outline-none"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { onSave(draft); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
      />
      <button onClick={() => { onSave(draft); setEditing(false); }} className="text-[10px] text-success hover:text-success/80">save</button>
      <button onClick={() => setEditing(false)} className="text-[10px] text-text-dim hover:text-danger">cancel</button>
    </div>
  );
}

export default function IdentityEditor() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);

  const reload = useCallback(() => {
    fetchProfile(id).then(setProfile).catch(() => {});
  }, [id]);

  const { job, isRunning, isDone, error: jobError, start: startJob } = useResearchJob({
    onComplete: reload,
  });

  useEffect(() => {
    setLoading(true);
    fetchProfile(id)
      .then(setProfile)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

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
        <Link to="/people" className="text-accent hover:text-accent-hover text-sm">&larr; Back to People</Link>
      </div>
    );
  }

  async function handleEnrich() {
    setLaunching(true);
    try {
      const j = await startEnrichment(id);
      startJob(j.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLaunching(false);
    }
  }

  async function handleConfirm() {
    try {
      const updated = await confirmIdentity(id);
      setProfile(updated);
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveField(field, value) {
    setSaving(true);
    try {
      const updated = await updateIdentity(id, { [field]: value });
      setProfile(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const {
    social_profiles = [],
    addresses = [],
    employer_history = [],
    education = [],
    known_associates = [],
    enrichment_sources = [],
  } = profile;

  const isConfirmed = profile.identity_confidence >= 1.0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-up">
      {/* Header */}
      <div>
        <Link to={`/people/${id}`} className="text-xs text-text-dim hover:text-accent transition-colors mb-4 inline-block">
          &larr; Back to Profile
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Identity Profile</h1>
            <p className="text-text-dim text-sm">{profile.name} — {profile.organization}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-right">
              <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1">Confidence</div>
              <ConfidenceBar value={profile.identity_confidence || 0} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={handleEnrich}
            disabled={launching || isRunning}
            className="text-xs font-medium px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {launching ? 'Starting...' : isRunning ? 'Enriching...' : profile.enriched_at ? 'Re-enrich' : 'Enrich Identity'}
          </button>
          {!isConfirmed && (
            <button
              onClick={handleConfirm}
              className="text-xs font-medium px-4 py-1.5 rounded-lg bg-success/20 text-success hover:bg-success/30 transition-colors"
            >
              Confirm Identity
            </button>
          )}
          {isConfirmed && (
            <span className="text-xs text-success font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              Identity Confirmed
            </span>
          )}
          {isRunning && job && (
            <span className="text-xs text-text-dim flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              {job.status}
            </span>
          )}
          {isDone && job?.status === 'complete' && <span className="text-xs text-success">Enrichment complete</span>}
          {isDone && job?.status === 'failed' && <span className="text-xs text-danger">Failed: {job.error || 'unknown'}</span>}
          {jobError && <span className="text-xs text-danger">{jobError}</span>}
        </div>

        {enrichment_sources.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-text-dim">Sources:</span>
            {enrichment_sources.map((s) => <SourceBadge key={s} source={s} />)}
          </div>
        )}
        {profile.enriched_at && (
          <p className="text-[10px] text-text-dim mt-1">Last enriched: {new Date(profile.enriched_at).toLocaleString()}</p>
        )}
      </div>

      {/* Basic Identity Fields */}
      <section className="bg-surface border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim mb-3">Basic Info</h2>
        <div className="space-y-0.5">
          <EditableField label="City" value={profile.city} onSave={(v) => saveField('city', v)} placeholder="e.g. Lenexa" />
          <EditableField label="County" value={profile.county} onSave={(v) => saveField('county', v)} placeholder="e.g. Johnson" />
          <EditableField label="Date of Birth" value={profile.date_of_birth} onSave={(v) => saveField('date_of_birth', v)} placeholder="YYYY-MM-DD" />
          <EditableField label="Gender" value={profile.gender} onSave={(v) => saveField('gender', v)} />
        </div>
      </section>

      {/* Social Profiles */}
      <section className="bg-surface border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim mb-3">
          Social Profiles
          <span className="text-text-dim/50 font-normal ml-2">({social_profiles.length})</span>
        </h2>
        {social_profiles.length === 0 ? (
          <p className="text-xs text-text-dim/50 italic">No social profiles discovered yet</p>
        ) : (
          <div className="space-y-2">
            {social_profiles.map((sp, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-text-dim w-20 shrink-0 capitalize">{sp.platform}</span>
                <a href={sp.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover transition-colors truncate flex-1">
                  {sp.username || sp.url}
                </a>
                <ConfidenceBar value={sp.confidence || 0} />
                <SourceBadge source={sp.source} />
                {sp.verified && <span className="text-[10px] text-success font-medium">Verified</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Addresses */}
      <section className="bg-surface border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim mb-3">
          Addresses
          <span className="text-text-dim/50 font-normal ml-2">({addresses.length})</span>
        </h2>
        {addresses.length === 0 ? (
          <p className="text-xs text-text-dim/50 italic">No addresses discovered yet</p>
        ) : (
          <div className="space-y-2">
            {addresses.map((a, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-text-dim w-16 shrink-0 capitalize">{a.type}</span>
                <span className="text-text flex-1">
                  {[a.street, a.city, a.state, a.zip_code].filter(Boolean).join(', ')}
                </span>
                {a.current && <span className="text-[10px] text-success">Current</span>}
                <SourceBadge source={a.source} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Employment History */}
      <section className="bg-surface border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim mb-3">
          Employment
          <span className="text-text-dim/50 font-normal ml-2">({employer_history.length})</span>
        </h2>
        {employer_history.length === 0 ? (
          <p className="text-xs text-text-dim/50 italic">No employment history discovered yet</p>
        ) : (
          <div className="space-y-2">
            {employer_history.map((e, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className="flex-1">
                  <span className="text-text font-medium">{e.organization}</span>
                  {e.title && <span className="text-text-dim ml-2">— {e.title}</span>}
                </div>
                <span className="text-[10px] text-text-dim shrink-0">
                  {e.start_date || '?'} → {e.current ? 'Present' : e.end_date || '?'}
                </span>
                <SourceBadge source={e.source} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Education */}
      <section className="bg-surface border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim mb-3">
          Education
          <span className="text-text-dim/50 font-normal ml-2">({education.length})</span>
        </h2>
        {education.length === 0 ? (
          <p className="text-xs text-text-dim/50 italic">No education history discovered yet</p>
        ) : (
          <div className="space-y-2">
            {education.map((e, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className="flex-1">
                  <span className="text-text font-medium">{e.institution}</span>
                  {e.degree && <span className="text-text-dim ml-2">— {e.degree}</span>}
                  {e.field && <span className="text-text-dim ml-1">({e.field})</span>}
                </div>
                {e.year && <span className="text-[10px] text-text-dim">{e.year}</span>}
                <SourceBadge source={e.source} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Known Associates */}
      {known_associates.length > 0 && (
        <section className="bg-surface border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim mb-3">Known Associates</h2>
          <div className="flex flex-wrap gap-2">
            {known_associates.map((name, i) => (
              <span key={i} className="text-xs bg-surface-alt border border-border rounded-full px-3 py-1 text-text-dim">
                {name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
