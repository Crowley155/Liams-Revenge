import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchProfile, fetchEntities, startResearch } from '../api/client';
import useResearchJob from '../hooks/useResearchJob';
import DocLink from '../components/DocLink';

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
  relationship: 'bg-purple-400/15 text-purple-400',
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

function Section({ title, children, count }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <section className="animate-fade-up">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        {title}
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
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [entities, setEntities] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchProfile(id),
      fetchEntities().catch(() => []),
    ])
      .then(([p, e]) => { setProfile(p); setEntities(e); })
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
        <Link to="/people" className="text-accent hover:text-accent-hover text-sm">
          &larr; Back to People
        </Link>
      </div>
    );
  }

  const reload = useCallback(() => {
    fetchProfile(id).then(setProfile).catch(() => {});
  }, [id]);

  const { job, isRunning, isDone, error: jobError, start: startJob } = useResearchJob({
    onComplete: reload,
  });

  const [launching, setLaunching] = useState(false);

  async function handleResearch() {
    setLaunching(true);
    try {
      const j = await startResearch({
        name: profile.name,
        role: profile.role,
        organization: profile.organization,
        state: profile.state || 'KS',
        person_id: profile.id,
      });
      startJob(j.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLaunching(false);
    }
  }

  const { battle_card: bc, facts = [], contact, curated_bio, curated_quotes = [], entity_ids = [] } = profile;
  const badge = SOURCE_BADGE[profile.source] || SOURCE_BADGE.manual;
  const hasResearch = facts.length > 0 || !!bc;

  const affiliatedEntities = entities.filter((e) => entity_ids.includes(e.id));

  const hasContact = contact && Object.values(contact).some(v =>
    v && (Array.isArray(v) ? v.length > 0 : true)
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-up">
      {/* Header */}
      <div>
        <Link to="/people" className="text-xs text-text-dim hover:text-accent transition-colors mb-4 inline-block">
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
                    to={`/entities/${ent.id}`}
                    className="text-[11px] bg-surface-alt border border-border rounded-full px-3 py-1 text-text-dim hover:text-accent hover:border-accent/30 transition-colors"
                  >
                    {ent.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Research trigger */}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button
                onClick={handleResearch}
                disabled={launching || isRunning}
                className="text-xs font-medium px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {launching ? 'Starting...' : isRunning ? 'Researching...' : hasResearch ? 'Re-research' : 'Research this person'}
              </button>
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
            </div>
          </div>
        </div>
      </div>

      {/* Curated Bio */}
      {curated_bio && (
        <div className="bg-surface border border-info/30 rounded-xl p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-info mb-3">Case Background</h2>
          <p className="text-sm text-text leading-relaxed">{curated_bio}</p>
        </div>
      )}

      {/* Curated Quotes */}
      {curated_quotes.length > 0 && (
        <Section title="Key Quotes from Evidence" count={curated_quotes.length}>
          <div className="space-y-3">
            {curated_quotes.map((q, i) => (
              <div key={i} className="pl-4 border-l-2 border-info/40">
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

      {/* Contact Info */}
      {hasContact && (
        <div className="bg-surface border border-border rounded-xl p-5 animate-fade-up" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim mb-3">Contact &amp; Profiles</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors">
                <span className="text-text-dim">Email</span> {contact.email}
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors">
                <span className="text-text-dim">Phone</span> {contact.phone}
              </a>
            )}
            {contact.address && (
              <p className="flex items-center gap-2 text-sm text-text">
                <span className="text-text-dim">Address</span> {contact.address}
              </p>
            )}
            {contact.linkedin_url && (
              <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors">
                <span className="text-text-dim">LinkedIn</span> Profile &rarr;
              </a>
            )}
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
        </div>
      )}

      {/* Battle Card Summary */}
      {bc && (
        <div className="bg-surface border border-accent/30 rounded-xl p-6" style={{ boxShadow: 'var(--shadow-elevated)' }}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-accent mb-3">Battle Card</h2>
          <p className="text-sm text-text leading-relaxed">{bc.summary}</p>
        </div>
      )}

      {/* Key Positions */}
      <Section title="Key Positions" count={bc?.key_positions?.length}>
        <div className="space-y-2">
          {bc?.key_positions?.map((pos, i) => (
            <div key={i} className="pl-4 border-l-2 border-accent/40">
              <p className="text-sm text-text leading-relaxed">{pos}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Contradictions */}
      <Section title="Contradictions" count={bc?.contradictions?.length}>
        <div className="space-y-2">
          {bc?.contradictions?.map((c, i) => (
            <div key={i} className="pl-4 border-l-2 border-danger/40">
              <p className="text-sm text-text leading-relaxed">{c}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Organizational Ties */}
      <Section title="Organizational Ties" count={bc?.organizational_ties?.length}>
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
        <Section title="All Facts" count={facts.length}>
          <div className="grid gap-3 sm:grid-cols-2">
            {facts.map((f) => (
              <FactCard key={f.id} fact={f} />
            ))}
          </div>
        </Section>
      )}

      {/* Action Items */}
      <Section title="Action Items" count={bc?.action_items?.length}>
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
