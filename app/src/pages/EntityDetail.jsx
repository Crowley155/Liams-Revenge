import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchEntity, fetchEntityMembers, discoverMembers } from '../api/client';
import useResearchJob from '../hooks/useResearchJob';

const TYPE_LABELS = {
  district: 'School District',
  department: 'Department',
  board: 'Board',
  agency: 'Agency',
  program: 'Program',
};

const SOURCE_BADGE = {
  manual: { label: 'Curated', className: 'bg-info/15 text-info' },
  pipeline: { label: 'Researched', className: 'bg-accent/15 text-accent' },
  both: { label: 'Curated + Researched', className: 'bg-success/15 text-success' },
};

function Initials({ name }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  return (
    <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-xs font-bold text-accent shrink-0">
      {initials}
    </div>
  );
}

export default function EntityDetail() {
  const { id } = useParams();
  const [entity, setEntity] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchEntity(id), fetchEntityMembers(id)])
      .then(([e, m]) => { setEntity(e); setMembers(m); })
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

  if (error || !entity) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-danger text-sm">{error || 'Entity not found'}</p>
        <Link to="/people" className="text-accent hover:text-accent-hover text-sm">
          &larr; Back to People
        </Link>
      </div>
    );
  }

  const reload = useCallback(() => {
    Promise.all([fetchEntity(id), fetchEntityMembers(id)])
      .then(([e, m]) => { setEntity(e); setMembers(m); })
      .catch(() => {});
  }, [id]);

  const { job: discoverJob, isRunning: discovering, isDone: discoverDone, error: discoverError, start: startDiscover } = useResearchJob({
    onComplete: reload,
  });

  const [launchingDiscover, setLaunchingDiscover] = useState(false);

  async function handleDiscover() {
    setLaunchingDiscover(true);
    try {
      const j = await discoverMembers(id);
      startDiscover(j.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLaunchingDiscover(false);
    }
  }

  const memberMap = {};
  for (const em of entity.members || []) {
    memberMap[em.person_id] = em;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-up">
      {/* Header */}
      <div>
        <Link to="/people" className="text-xs text-text-dim hover:text-accent transition-colors mb-4 inline-block">
          &larr; Back to People
        </Link>
        <h1 className="text-2xl font-bold">{entity.name}</h1>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs bg-surface-alt border border-border rounded-full px-3 py-1 text-text-dim">
            {TYPE_LABELS[entity.type] || entity.type}
          </span>
          <span className="text-xs text-text-dim">{entity.state}</span>
          {entity.website && (
            <a href={entity.website} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-accent-hover transition-colors">
              {entity.website} &rarr;
            </a>
          )}
        </div>
        {entity.description && (
          <p className="text-sm text-text-dim leading-relaxed mt-3">{entity.description}</p>
        )}
      </div>

      {/* Key Policies */}
      {entity.key_policies?.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3">Key Policies</h2>
          <div className="space-y-2">
            {entity.key_policies.map((p, i) => (
              <div key={i} className="pl-4 border-l-2 border-accent/40">
                <p className="text-sm text-text leading-relaxed">{p}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Members */}
      <section>
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          <h2 className="text-lg font-bold flex items-center gap-2">
            Members
            <span className="text-xs font-normal text-text-dim bg-surface-alt px-2 py-0.5 rounded-full">
              {members.length}
            </span>
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDiscover}
              disabled={launchingDiscover || discovering}
              className="text-xs font-medium px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {launchingDiscover ? 'Starting...' : discovering ? 'Discovering...' : members.length > 0 ? 'Refresh Members' : 'Discover Members'}
            </button>
            {discovering && discoverJob && (
              <span className="text-xs text-text-dim flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                {discoverJob.status}
              </span>
            )}
            {discoverDone && discoverJob?.status === 'complete' && (
              <span className="text-xs text-success">Discovery complete</span>
            )}
            {discoverDone && discoverJob?.status === 'failed' && (
              <span className="text-xs text-danger">Failed: {discoverJob.error || 'unknown'}</span>
            )}
            {discoverError && <span className="text-xs text-danger">{discoverError}</span>}
          </div>
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-text-dim italic">No members discovered yet. Click "Discover Members" to search.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {members.map((person) => {
              const em = memberMap[person.id];
              const badge = SOURCE_BADGE[person.source] || SOURCE_BADGE.manual;
              const factCount = person.facts?.length || 0;
              const hasResearch = person.source === 'pipeline' || person.source === 'both'
                || (person.facts?.length > 0) || !!person.battle_card;

              return (
                <Link
                  key={person.id}
                  to={`/people/${person.id}`}
                  className="block bg-surface border border-border rounded-lg p-4 card-hover group"
                  style={{ boxShadow: 'var(--shadow-card)' }}
                >
                  <div className="flex items-start gap-3">
                    <Initials name={person.name} />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-text text-sm group-hover:text-accent transition-colors">
                        {person.name}
                      </h3>
                      <p className="text-xs text-text-dim">
                        {em?.title || em?.role || person.role}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badge.className}`}>
                          {badge.label}
                        </span>
                        {factCount > 0 && (
                          <span className="text-[10px] text-accent">{factCount} facts</span>
                        )}
                        {!hasResearch && (
                          <span className="text-[10px] text-text-dim/50 italic">Not researched</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {person.curated_bio && (
                    <p className="mt-2 text-xs text-text-dim leading-relaxed line-clamp-2">{person.curated_bio}</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
