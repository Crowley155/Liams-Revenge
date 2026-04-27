import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchProfiles, fetchEntities, seedData, startResearch } from '../api/client';
import useResearchJob from '../hooks/useResearchJob';
import DocLink from '../components/DocLink';
import OrgDiagram from '../components/OrgDiagram';

const ORG_COLORS = {
  'USD 232': '#6c8aff',
  'JCPRD': '#ff6b6b',
  'Family': '#69db7c',
};

const SOURCE_BADGE = {
  manual: { label: 'Curated', className: 'bg-info/15 text-info' },
  pipeline: { label: 'Researched', className: 'bg-accent/15 text-accent' },
  both: { label: 'Curated + Researched', className: 'bg-success/15 text-success' },
};

function Initials({ name, color }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
      style={{ backgroundColor: color + '22', color }}
    >
      {initials}
    </div>
  );
}

function PersonCard({ person, caseId, onResearchDone, onError }) {
  const [quotesOpen, setQuotesOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const orgColor = ORG_COLORS[person.organization] || '#6c8aff';
  const factCount = person.facts?.length || 0;
  const badge = SOURCE_BADGE[person.source] || SOURCE_BADGE.manual;
  const hasResearch = person.source === 'pipeline' || person.source === 'both'
    || (person.facts?.length > 0) || !!person.battle_card;
  const quotes = person.curated_quotes || [];

  const { job, isRunning, isDone, start: startJob } = useResearchJob({
    onComplete: onResearchDone,
  });

  async function handleResearch(e) {
    e.preventDefault();
    e.stopPropagation();
    setLaunching(true);
    try {
      const j = await startResearch({
        name: person.name,
        role: person.role,
        organization: person.organization,
        state: person.state || 'KS',
        case_id: caseId,
        person_id: person.id,
      });
      startJob(j.id);
    } catch (err) {
      onError?.(err.message || 'Research failed');
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-3 card-hover" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-start gap-3">
        <Initials name={person.name} color={orgColor} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-text text-sm">{person.name}</h3>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-text-dim">{person.role}</p>
        </div>
        {factCount > 0 && (
          <span className="text-xs font-medium text-accent shrink-0">{factCount} facts</span>
        )}
      </div>

      {person.curated_bio && (
        <p className="text-sm text-text-dim leading-relaxed">{person.curated_bio}</p>
      )}

      {!person.curated_bio && person.battle_card?.summary && (
        <p className="text-sm text-text-dim leading-relaxed line-clamp-3">{person.battle_card.summary}</p>
      )}

      {quotes.length > 0 && (
        <div>
          <button
            onClick={() => setQuotesOpen(!quotesOpen)}
            className="text-xs font-medium text-accent hover:text-accent-hover flex items-center gap-1"
          >
            <span className="inline-block transition-transform" style={{ transform: quotesOpen ? 'rotate(90deg)' : '' }}>▸</span>
            {quotes.length} key quote{quotes.length > 1 ? 's' : ''}
          </button>

          {quotesOpen && (
            <div className="mt-2 space-y-2">
              {quotes.map((q, i) => (
                <div key={i} className="pl-3 border-l-2 border-border">
                  <p className="text-xs italic text-text leading-relaxed">"{q.text}"</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-dim">
                    {q.date && <span>{q.date}</span>}
                    {q.doc_id && <DocLink id={q.doc_id}>{q.doc_id}</DocLink>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1 flex-wrap">
        <Link
          to={`/cases/${caseId}/people/${person.id}`}
          className="text-[11px] text-accent hover:text-accent-hover transition-colors"
        >
          View profile &rarr;
        </Link>
        {!isRunning && !isDone && (
          <button
            onClick={handleResearch}
            disabled={launching}
            className="text-[11px] text-text-dim hover:text-accent transition-colors disabled:opacity-50 ml-auto"
          >
            {launching ? 'Starting...' : hasResearch ? 'Re-research' : 'Research'}
          </button>
        )}
        {isRunning && job && (
          <span className="text-[11px] text-text-dim flex items-center gap-1 ml-auto">
            <span className="w-2.5 h-2.5 border-[1.5px] border-accent border-t-transparent rounded-full animate-spin" />
            {job.status}
          </span>
        )}
        {isDone && job?.status === 'complete' && (
          <span className="text-[11px] text-success ml-auto">{job.facts_found} facts found</span>
        )}
        {isDone && job?.status === 'failed' && (
          <span className="text-[11px] text-danger ml-auto">Failed</span>
        )}
      </div>
    </div>
  );
}

export default function People() {
  const { caseId } = useParams();
  const [people, setPeople] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchProfiles(caseId), fetchEntities(caseId)])
      .then(([p, e]) => { setPeople(p); setEntities(e); })
      .catch((err) => { setPeople([]); setEntities([]); setError(err.message || 'Failed to load data'); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [caseId]);

  const handleSeed = async () => {
    setSeeding(true);
    setError(null);
    try {
      await seedData();
      load();
    } catch (e) {
      setError(e.message || 'Failed to import case data');
    } finally {
      setSeeding(false);
    }
  };

  const entityGroups = entities.map((ent) => {
    const memberIds = new Set(ent.members?.map((m) => m.person_id) || []);
    const matched = people.filter((p) =>
      memberIds.has(p.id)
      || p.entity_ids?.includes(ent.id)
      || p.organization?.toLowerCase() === ent.name.toLowerCase()
    );
    return { entity: ent, members: matched };
  });

  const assignedIds = new Set(entityGroups.flatMap((g) => g.members.map((m) => m.id)));
  const unaffiliated = people.filter((p) => !assignedIds.has(p.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-xs text-danger leading-relaxed">{error}</p>
          <button onClick={() => setError(null)} className="text-danger/60 hover:text-danger text-sm shrink-0">&times;</button>
        </div>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1">Who's Who</h1>
          <p className="text-text-dim text-sm">
            Every person involved — curated case evidence and pipeline-researched profiles in one place.
          </p>
        </div>
        {people.length === 0 && (
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {seeding ? 'Importing…' : 'Import Case Data'}
          </button>
        )}
      </div>

      <OrgDiagram />

      {entityGroups.map(({ entity, members }) => {
        if (members.length === 0) return null;
        const color = ORG_COLORS[entity.name] || '#6c8aff';
        return (
          <section key={entity.id} className="animate-fade-up">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} />
              <Link
                to={`/cases/${caseId}/entities/${entity.id}`}
                className="text-sm font-bold uppercase tracking-wide hover:text-accent transition-colors"
                style={{ color }}
              >
                {entity.name}
              </Link>
              <span className="text-xs font-normal text-text-dim bg-surface-alt px-2 py-0.5 rounded-full">
                {members.length}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((p) => (
                <PersonCard key={p.id} person={p} caseId={caseId} onResearchDone={load} onError={setError} />
              ))}
            </div>
          </section>
        );
      })}

      {unaffiliated.length > 0 && (
        <section className="animate-fade-up">
          <h2 className="text-sm font-bold uppercase tracking-wide mb-3 flex items-center gap-2 text-text-dim">
            <span className="w-2 h-2 rounded-full inline-block bg-text-dim" />
            Other Profiles
            <span className="text-xs font-normal text-text-dim bg-surface-alt px-2 py-0.5 rounded-full">
              {unaffiliated.length}
            </span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unaffiliated.map((p) => (
              <PersonCard key={p.id} person={p} caseId={caseId} onResearchDone={load} onError={setError} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
