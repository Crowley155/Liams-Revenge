import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchEntity, fetchEntityMembers, discoverMembers,
  acceptEntityMember, rejectEntityMember,
  startEntityResearch, verifyEntityFact, deleteEntityFact,
  updateEntity,
} from '../api/client';
import useResearchJob from '../hooks/useResearchJob';
import EntityGraph from '../components/EntityGraph';
import { printDocument } from '../utils/printPdf';

const TYPE_LABELS = {
  district: 'School District',
  department: 'Department',
  board: 'Board',
  agency: 'Agency',
  program: 'Program',
  commission: 'Commission',
  county: 'County',
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

const CANONICAL_CATEGORIES = [
  { value: 'meeting_schedule', label: 'Meetings' },
  { value: 'news', label: 'News' },
  { value: 'social_complaint', label: 'Social' },
  { value: 'public_commitment', label: 'Commitments' },
  { value: 'oversight', label: 'Oversight' },
  { value: 'regulatory_action', label: 'Regulatory' },
  { value: 'records_info', label: 'Records' },
];

const REL_TYPE_LABELS = {
  oversees: 'Oversees',
  leases_to: 'Leases to',
  funds: 'Funds',
  regulates: 'Regulates',
  parent_of: 'Parent of',
  contracts_with: 'Contracts with',
};

export default function EntityDetail() {
  const { id } = useParams();
  const [entity, setEntity] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [launchingDiscover, setLaunchingDiscover] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [discoveryPrompt, setDiscoveryPrompt] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [factFilter, setFactFilter] = useState('');
  const [aliasInput, setAliasInput] = useState('');
  const [launching, setLaunching] = useState(false);

  const reload = useCallback(() => {
    Promise.all([fetchEntity(id), fetchEntityMembers(id)])
      .then(([e, m]) => { setEntity(e); setMembers(m); })
      .catch(() => {});
  }, [id]);

  const { job: researchJob, isRunning: researchRunning, isDone: researchDone, error: researchError, start: startResearchJob, cancel: cancelResearch } = useResearchJob({
    onPoll: reload,
    onComplete: reload,
  });

  const { job: discoverJob, isRunning: discovering, isDone: discoverDone, error: discoverError, start: startDiscover, reset: resetDiscover, cancel: cancelDiscover } = useResearchJob({
    onPoll: reload,
    onComplete: () => {
      setTimeout(() => {
        reload();
        resetDiscover();
      }, 800);
    },
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchEntity(id), fetchEntityMembers(id)])
      .then(([e, m]) => { setEntity(e); setMembers(m); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleResearchEntity() {
    setLaunching(true);
    try {
      const job = await startEntityResearch(id);
      startResearchJob(job.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLaunching(false);
    }
  }

  async function handleVerifyFact(factId) {
    try {
      await verifyEntityFact(id, factId);
      reload();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteFact(factId) {
    try {
      await deleteEntityFact(id, factId);
      reload();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleAddAlias() {
    if (!aliasInput.trim()) return;
    const existing = entity.aliases || [];
    try {
      const updated = await updateEntity(id, {
        aliases: [...existing, { name: aliasInput.trim(), alias_type: 'acronym' }],
      });
      setEntity(updated);
      setAliasInput('');
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRemoveAlias(idx) {
    const updated_aliases = [...(entity.aliases || [])];
    updated_aliases.splice(idx, 1);
    try {
      const updated = await updateEntity(id, { aliases: updated_aliases });
      setEntity(updated);
    } catch (e) {
      setError(e.message);
    }
  }

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
        <Link to="/entities" className="text-accent hover:text-accent-hover text-sm">
          &larr; Back to Entities
        </Link>
      </div>
    );
  }

  async function handleDiscover() {
    if (!discoveryPrompt.trim()) return;
    setLaunchingDiscover(true);
    try {
      const j = await discoverMembers(id, discoveryPrompt.trim());
      startDiscover(j.id);
      setShowPrompt(false);
      setDiscoveryPrompt('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLaunchingDiscover(false);
    }
  }

  async function handleAccept(name) {
    try {
      const updated = await acceptEntityMember(id, name);
      setEntity(updated);
      reload();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleReject(name) {
    try {
      const updated = await rejectEntityMember(id, name);
      setEntity(updated);
    } catch (e) {
      setError(e.message);
    }
  }

  const memberMap = {};
  for (const em of entity.members || []) {
    if (em.person_id) memberMap[em.person_id] = em;
  }

  const pendingMembers = (entity.members || []).filter((m) => m.status === 'pending');
  const acceptedMembers = (entity.members || []).filter((m) => m.status === 'accepted' && m.person_id);

  const filteredFacts = (entity.facts || []).filter(
    (f) => !factFilter || f.category === factFilter
  );

  const factCategories = useMemo(() => {
    const facts = entity?.facts || [];
    const counts = {};
    for (const f of facts) {
      counts[f.category] = (counts[f.category] || 0) + 1;
    }
    const canonicalValues = new Set(CANONICAL_CATEGORIES.map((c) => c.value));
    const pills = [{ value: '', label: 'All', count: facts.length }];
    for (const cat of CANONICAL_CATEGORIES) {
      if (counts[cat.value]) {
        pills.push({ ...cat, count: counts[cat.value] });
      }
    }
    for (const [cat, count] of Object.entries(counts)) {
      if (!canonicalValues.has(cat)) {
        pills.push({ value: cat, label: cat.replace(/_/g, ' '), count });
      }
    }
    return pills;
  }, [entity?.facts]);

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'facts', label: `Facts (${entity.facts?.length || 0})` },
    { key: 'relationships', label: `Relationships (${entity.relationships?.length || 0})` },
    { key: 'graph', label: 'Graph' },
    { key: 'members', label: `Members (${members.length})` },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-up">
      {/* Header */}
      <div>
        <Link to="/entities" className="text-xs text-text-dim hover:text-accent transition-colors mb-4 inline-block">
          &larr; Back to Entities
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
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
              {entity.last_researched && (
                <span className="text-[10px] text-success/80">
                  Researched {new Date(entity.last_researched).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleResearchEntity}
              disabled={launching || researchRunning}
              className="text-xs font-medium px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {launching ? 'Starting...' : researchRunning ? 'Researching...' : entity.last_researched ? 'Re-research' : 'Research Entity'}
            </button>
            {entity.facts?.length > 0 && (
              <button
                onClick={() => {
                  const sections = [];
                  if (entity.description) sections.push(entity.description);
                  if (entity.news_summary) sections.push('\n\nNEWS SUMMARY:\n' + entity.news_summary);
                  if (entity.key_policies?.length) sections.push('\n\nKEY POLICIES:\n' + entity.key_policies.map((p) => `• ${p}`).join('\n'));
                  if (entity.relationships?.length) sections.push('\n\nRELATIONSHIPS:\n' + entity.relationships.map((r) => `• ${REL_TYPE_LABELS[r.relationship_type] || r.relationship_type}: ${r.description || r.target_entity_id}`).join('\n'));
                  sections.push(`\n\nFACTS (${entity.facts.length}):\n` + entity.facts.map((f) => `[${f.category}] ${f.title || ''} — ${f.summary || ''} (conf: ${Math.round((f.confidence || 0) * 100)}%)`).join('\n'));
                  printDocument({
                    title: `Entity Research — ${entity.name}`,
                    body: sections.join('').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'),
                    meta: {
                      'Entity': entity.name,
                      'Type': TYPE_LABELS[entity.type] || entity.type,
                      'State': entity.state,
                      'Facts': `${entity.facts.length}`,
                      'Generated': new Date().toLocaleDateString(),
                    },
                  });
                }}
                className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-surface-alt text-text-dim hover:text-text hover:bg-border/40 transition-colors"
              >
                Export PDF
              </button>
            )}
            {researchRunning && (
              <button
                onClick={cancelResearch}
                className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-danger/15 text-danger hover:bg-danger/25 transition-colors"
              >
                Cancel
              </button>
            )}
            {researchRunning && researchJob && (
              <span className="text-xs text-text-dim flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                {researchJob.status} {researchJob.facts_found > 0 && `\u2014 ${researchJob.facts_found} facts`}
              </span>
            )}
            {researchDone && researchJob?.status === 'complete' && (
              <span className="text-xs text-success">Done — {researchJob.facts_found} facts found</span>
            )}
            {researchDone && researchJob?.status === 'failed' && (
              <span className="text-xs text-danger">Failed: {researchJob.error || 'unknown'}</span>
            )}
            {researchError && <span className="text-xs text-danger">{researchError}</span>}
          </div>
        </div>
        {entity.description && (
          <p className="text-sm text-text-dim leading-relaxed mt-3">{entity.description}</p>
        )}

        {/* Aliases */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {(entity.aliases || []).map((a, i) => (
            <span
              key={i}
              className="text-[11px] px-2 py-0.5 bg-surface-alt border border-border rounded-full text-text-dim inline-flex items-center gap-1"
            >
              {a.name}
              <button
                onClick={() => handleRemoveAlias(i)}
                className="text-text-dim/40 hover:text-danger transition-colors ml-0.5"
              >
                &times;
              </button>
            </span>
          ))}
          <div className="inline-flex items-center gap-1">
            <input
              className="text-[11px] px-2 py-0.5 bg-bg border border-border rounded-full w-28 text-text placeholder:text-text-dim/40 focus:outline-none focus:border-accent"
              placeholder="Add alias..."
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddAlias()}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-accent text-accent'
                : 'border-transparent text-text-dim hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Records Custodian */}
          {entity.records_custodian?.email && (
            <section className="bg-surface border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2">Records Custodian</h3>
              <div className="grid gap-1 text-xs text-text-dim">
                {entity.records_custodian.name && <p><span className="text-text">{entity.records_custodian.name}</span> — {entity.records_custodian.title}</p>}
                <p>{entity.records_custodian.email} {entity.records_custodian.phone && `| ${entity.records_custodian.phone}`}</p>
              </div>
            </section>
          )}

          {entity.meeting_url && (
            <section className="bg-surface border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2">Meeting Schedule</h3>
              <a href={entity.meeting_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-accent-hover">
                {entity.meeting_url} &rarr;
              </a>
            </section>
          )}

          {entity.news_summary && (
            <section className="bg-surface border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2">News Summary</h3>
              <p className="text-xs text-text-dim leading-relaxed">{entity.news_summary}</p>
            </section>
          )}

          {entity.key_policies?.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold mb-3">Key Policies</h3>
              <div className="space-y-2">
                {entity.key_policies.map((p, i) => (
                  <div key={i} className="pl-4 border-l-2 border-accent/40">
                    <p className="text-sm text-text leading-relaxed">{p}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Tab: Facts */}
      {activeTab === 'facts' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {factCategories.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setFactFilter(cat.value)}
                className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                  factFilter === cat.value
                    ? 'bg-accent/15 text-accent'
                    : 'bg-surface-alt text-text-dim hover:text-text'
                }`}
              >
                {cat.label}
                <span className="ml-1 opacity-60">({cat.count})</span>
              </button>
            ))}
          </div>

          {filteredFacts.length === 0 ? (
            <p className="text-sm text-text-dim italic py-4">
              {entity.facts?.length ? 'No facts in this category.' : 'No facts yet. Click "Research Entity" to discover intelligence.'}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredFacts.map((fact) => (
                <div
                  key={fact.id}
                  className="bg-surface border border-border rounded-lg p-4 group"
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${
                      fact.verified ? 'bg-success/15 text-success' : 'bg-surface-alt text-text-dim'
                    }`}>
                      {fact.category.replace('_', ' ')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-text">{fact.title}</h4>
                      <p className="text-xs text-text-dim mt-1 leading-relaxed">{fact.summary}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-text-dim/60">
                        {fact.source_url && (
                          <a href={fact.source_url} target="_blank" rel="noopener noreferrer" className="text-accent/60 hover:text-accent">
                            source &rarr;
                          </a>
                        )}
                        {fact.source_date && <span>{fact.source_date}</span>}
                        <span>conf: {(fact.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {!fact.verified && (
                        <button
                          onClick={() => handleVerifyFact(fact.id)}
                          className="text-[10px] px-2 py-0.5 rounded bg-success/15 text-success hover:bg-success/30 transition-colors"
                        >
                          Verify
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteFact(fact.id)}
                        className="text-[10px] px-2 py-0.5 rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Relationships */}
      {activeTab === 'relationships' && (
        <div className="space-y-3">
          {(entity.relationships || []).length === 0 ? (
            <p className="text-sm text-text-dim italic py-4">
              No relationships discovered yet. Research this entity to map its organizational connections.
            </p>
          ) : (
            entity.relationships.map((rel) => (
              <Link
                key={rel.id}
                to={`/entities/${rel.target_entity_id}`}
                className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3 hover:border-accent/40 transition-all"
              >
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent shrink-0">
                  {REL_TYPE_LABELS[rel.relationship_type] || rel.relationship_type}
                </span>
                <span className="text-sm text-text flex-1">{rel.description || rel.target_entity_id}</span>
                {rel.verified && (
                  <span className="text-[10px] text-success">verified</span>
                )}
                <span className="text-text-dim text-xs">&rarr;</span>
              </Link>
            ))
          )}
        </div>
      )}

      {/* Tab: Graph */}
      {activeTab === 'graph' && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden" style={{ height: 500 }}>
          <EntityGraph entityId={id} />
        </div>
      )}

      {/* Tab: Members */}
      {activeTab === 'members' && (<>
      {/* Pending Review */}
      {pendingMembers.length > 0 && (
        <section className="animate-fade-up">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            Pending Review
            <span className="text-xs font-normal text-warning bg-warning/10 px-2 py-0.5 rounded-full">
              {pendingMembers.length}
            </span>
          </h2>
          <div className="space-y-2">
            {pendingMembers.map((m, i) => (
              <Link
                key={i}
                to={`/entities/${id}/members/${encodeURIComponent(m.discovered_name)}`}
                className="flex items-center gap-3 bg-surface border border-warning/30 rounded-lg p-3 card-hover group"
              >
                <Initials name={m.discovered_name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text group-hover:text-accent transition-colors">{m.discovered_name}</p>
                  <p className="text-xs text-text-dim">{m.role || m.title}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAccept(m.discovered_name); }}
                    className="text-[10px] font-medium px-2.5 py-1 rounded bg-success/15 text-success hover:bg-success/30 transition-colors"
                    title="Accept this person as a member of this entity"
                  >
                    Accept
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReject(m.discovered_name); }}
                    className="text-[10px] font-medium px-2.5 py-1 rounded bg-text-dim/10 text-text-dim hover:bg-danger/15 hover:text-danger transition-colors"
                    title="Not relevant — hide from list but remember to avoid re-suggesting"
                  >
                    Reject
                  </button>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Accepted Members */}
      <section>
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          <h2 className="text-lg font-bold flex items-center gap-2">
            Members
            <span className="text-xs font-normal text-text-dim bg-surface-alt px-2 py-0.5 rounded-full">
              {members.length}
            </span>
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            {!showPrompt ? (
              <button
                onClick={() => setShowPrompt(true)}
                disabled={discovering}
                className="text-xs font-medium px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Search for people associated with this entity"
              >
                {discovering ? 'Discovering...' : 'Find Members'}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={discoveryPrompt}
                  onChange={(e) => setDiscoveryPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDiscover()}
                  placeholder='e.g. "All active school board members"'
                  className="text-xs bg-surface border border-border rounded-lg px-3 py-1.5 text-text placeholder-text-dim/50 focus:outline-none focus:border-accent/50 w-64 transition-colors"
                  autoFocus
                />
                <button
                  onClick={handleDiscover}
                  disabled={launchingDiscover || !discoveryPrompt.trim()}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {launchingDiscover ? 'Starting...' : 'Search'}
                </button>
                <button
                  onClick={() => { setShowPrompt(false); setDiscoveryPrompt(''); }}
                  className="text-xs px-2 py-1.5 text-text-dim hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
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

        {members.length === 0 && pendingMembers.length === 0 ? (
          <p className="text-sm text-text-dim italic">No members yet. Click "Find Members" to search.</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-text-dim italic">No accepted members yet. Review pending candidates above.</p>
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
      </>)}
    </div>
  );
}
