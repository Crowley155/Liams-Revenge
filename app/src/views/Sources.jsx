import { useState, useMemo } from 'react';
import { useCase } from '../data/useCase';
import { usePanel } from '../components/EvidencePanel';

const TYPE_LABELS = {
  statute: 'Statute',
  regulation: 'Regulation',
  case: 'Case Law',
  caselaw: 'Case Law',
  'case-law': 'Case Law',
  'case-persuasive': 'Case Law',
  documentary: 'Document',
  'web-evidence': 'Document',
  'board-policy': 'Board Policy',
  email: 'Email',
  pdf: 'PDF',
  'pdf-not-extracted': 'PDF',
};

const VERIFICATION_COLORS = {
  verified: 'bg-success/20 text-success',
  'partially-verified': 'bg-warning/20 text-warning',
  unverified: 'bg-text-dim/20 text-text-dim',
  'needs-verification': 'bg-danger/20 text-danger',
};

const CATEGORY_ALL = 'all';
const CATEGORY_LEGAL = 'legal';
const CATEGORY_EVIDENCE = 'evidence';

function normalizeItem(item, category) {
  return { ...item, _category: category };
}

export default function Sources() {
  const { sources, evidence } = useCase();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [importantOnly, setImportantOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(CATEGORY_ALL);

  const allItems = useMemo(() => {
    const legal = (sources || []).map(s => normalizeItem(s, CATEGORY_LEGAL));
    const docs = (evidence || []).map(e => normalizeItem(e, CATEGORY_EVIDENCE));
    return [...legal, ...docs];
  }, [sources, evidence]);

  const importantCount = useMemo(() =>
    allItems.filter(s => s.important).length
  , [allItems]);

  const types = useMemo(() => {
    let items = allItems;
    if (categoryFilter === CATEGORY_LEGAL) items = items.filter(i => i._category === CATEGORY_LEGAL);
    if (categoryFilter === CATEGORY_EVIDENCE) items = items.filter(i => i._category === CATEGORY_EVIDENCE);
    const t = new Set(items.map(s => TYPE_LABELS[s.type] || s.type).filter(Boolean));
    return ['all', ...Array.from(t).sort()];
  }, [allItems, categoryFilter]);

  const filtered = useMemo(() => {
    return allItems.filter(s => {
      if (categoryFilter === CATEGORY_LEGAL && s._category !== CATEGORY_LEGAL) return false;
      if (categoryFilter === CATEGORY_EVIDENCE && s._category !== CATEGORY_EVIDENCE) return false;
      if (importantOnly && !s.important) return false;
      if (typeFilter !== 'all' && (TYPE_LABELS[s.type] || s.type) !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const text = [
          s.citation, s.id, s.description, s.relevance,
          s.summary, s.title, s.holding,
        ].filter(Boolean).join(' ').toLowerCase();
        return text.includes(q);
      }
      return true;
    });
  }, [allItems, typeFilter, search, importantOnly, categoryFilter]);

  return (
    <div className="space-y-6">
      <div className="relative -mx-4 sm:-mx-6 -mt-6 mb-2 overflow-hidden rounded-b-2xl">
        <img
          src="/images/evidence-catalog.webp"
          alt=""
          className="w-full h-40 sm:h-52 object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">Evidence Catalog</h2>
        <p className="text-xs text-text-dim mt-1">
          {allItems.length} items — {(sources || []).length} legal authorities &amp; {(evidence || []).length} documents
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2 items-center flex-wrap">
          {[
            { key: CATEGORY_ALL, label: 'All' },
            { key: CATEGORY_LEGAL, label: 'Legal Authorities' },
            { key: CATEGORY_EVIDENCE, label: 'Evidence & Documents' },
          ].map(c => (
            <button
              key={c.key}
              onClick={() => { setCategoryFilter(c.key); setTypeFilter('all'); }}
              className={`min-h-11 rounded-md px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${
                categoryFilter === c.key
                  ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                  : 'bg-surface-alt text-text-dim hover:text-text'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-surface-alt border border-border rounded-lg px-3 py-2 text-sm w-full sm:w-64 focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => setImportantOnly(!importantOnly)}
            className={`min-h-11 rounded-md px-3 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${
              importantOnly
                ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                : 'bg-surface-alt text-text-dim hover:text-text'
            }`}
          >
            Important ({importantCount})
          </button>
          <div className="flex gap-1 flex-wrap">
            {types.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`min-h-11 rounded-md px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${
                  typeFilter === t ? 'bg-accent/15 text-accent' : 'bg-surface-alt text-text-dim hover:text-text'
                }`}
              >
                {t === 'all' ? 'All Types' : t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-text-dim">
        Showing {filtered.length} of {allItems.length}
      </p>

      <div className="space-y-3">
        {filtered.map(item =>
          item._category === CATEGORY_LEGAL
            ? <SourceRow key={item.id} source={item} />
            : <EvidenceRow key={item.id} item={item} />
        )}
        {filtered.length === 0 && (
          <p className="text-sm text-text-dim text-center py-8">No items match your filters.</p>
        )}
      </div>
    </div>
  );
}

function SourceRow({ source }) {
  const [expanded, setExpanded] = useState(false);

  const accessHint = source.url
    ? null
    : source.type === 'case' || source.type === 'caselaw' || source.type === 'case-law' || source.type === 'case-persuasive'
    ? 'Available via Westlaw, LexisNexis, or Justia (if published). Request attorney access for full opinion text.'
    : source.type === 'statute' || source.type === 'regulation'
    ? 'Available via Kansas Revisor of Statutes website (ksrevisor.gov) or Cornell LII.'
    : 'Contact an attorney for access or submit a public-records request to the issuing entity.';

  return (
    <div
      id={source.id}
      className="bg-surface-alt border border-border rounded-xl overflow-hidden card-hover"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-mono text-text-dim">{source.id}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-surface text-text-dim">
                {TYPE_LABELS[source.type] || source.type}
              </span>
              {source.important && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300">
                  Important
                </span>
              )}
              {source.verification && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  VERIFICATION_COLORS[source.verification?.toLowerCase().replace(/\s+/g, '-')] || 'bg-surface text-text-dim'
                }`}>
                  {source.verification}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold">{source.citation}</h3>
            {source.holding && (
              <p className="text-xs text-text-dim mt-1 leading-relaxed">{source.holding}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="px-2 py-1 rounded bg-accent/10 text-accent text-xs hover:bg-accent/20 transition-colors"
              >
                Open ↗
              </a>
            )}
            <span className="text-text-dim text-xs">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {source.keyQuote && (
            <div className="rounded-md border border-border bg-background/45 p-3">
              <h4 className="text-[10px] font-bold uppercase text-accent mb-1">Key Quote</h4>
              <p className="text-sm italic text-text leading-relaxed">{source.keyQuote}</p>
            </div>
          )}

          {source.relevance && (
            <div>
              <h4 className="text-[10px] font-bold uppercase text-text-dim mb-1">What This Means for the Case</h4>
              <p className="text-sm leading-relaxed text-text">{source.relevance}</p>
            </div>
          )}

          {source.url ? (
            <div>
              <h4 className="text-[10px] font-bold uppercase text-text-dim mb-1">How to Access</h4>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:text-accent-hover underline break-all"
              >
                {source.url}
              </a>
            </div>
          ) : (
            <div>
              <h4 className="text-[10px] font-bold uppercase text-text-dim mb-1">How to Access</h4>
              <p className="text-xs text-text-dim">{accessHint}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EvidenceRow({ item }) {
  const { openDoc } = usePanel();
  const { lookup } = useCase();
  const actorName = item.source && lookup.actors[item.source]?.name;

  return (
    <button
      id={item.id}
      onClick={() => openDoc(item.id)}
      className="w-full text-left bg-surface-alt border border-border rounded-xl p-4 card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-mono text-text-dim">{item.id}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
              item.type === 'email' ? 'bg-blue-500/20 text-blue-300' :
              item.type === 'pdf' || item.type === 'pdf-not-extracted' ? 'bg-violet-500/20 text-violet-300' :
              'bg-gray-500/20 text-gray-300'
            }`}>
              {TYPE_LABELS[item.type] || item.type}
            </span>
            {item.important && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300">
                Important
              </span>
            )}
            {item.pdfFile && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-accent/15 text-accent">
                PDF Available
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold">{item.title || item.summary?.substring(0, 120)}</h3>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-dim">
            {item.date && <span>{item.date}</span>}
            {item.time && <span>{item.time}</span>}
            {actorName && <span>From: {actorName}</span>}
            {!actorName && item.source && <span>From: {item.source}</span>}
          </div>
          {item.keyClaims && item.keyClaims.length > 0 && (
            <p className="text-xs text-text-dim mt-1 italic">
              {item.keyClaims[0]}
            </p>
          )}
        </div>
        <span className="text-accent text-xs shrink-0">View →</span>
      </div>
    </button>
  );
}
