import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useCase } from '../data/useCase';
import RelevanceBadge from '../components/RelevanceBadge';

const TYPE_LABELS = {
  statute: 'Statute',
  regulation: 'Regulation',
  case: 'Case Law',
  caselaw: 'Case Law',
  'case-law': 'Case Law',
  'case-persuasive': 'Persuasive',
  documentary: 'Document',
  secondary: 'Secondary',
  policy: 'Policy',
  contract: 'Contract',
  handbook: 'Handbook',
  memo: 'Memo',
  restatement: 'Restatement',
  treatise: 'Treatise',
  'board-policy': 'Board Policy',
  'web-evidence': 'Web Evidence',
};

const VERIFICATION_COLORS = {
  verified: 'bg-success/20 text-success',
  'partially-verified': 'bg-warning/20 text-warning',
  unverified: 'bg-text-dim/20 text-text-dim',
  'needs-verification': 'bg-danger/20 text-danger',
};

export default function Sources() {
  const { sources } = useCase();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sort, setSort] = useState('default');
  const location = useLocation();
  const [highlightId, setHighlightId] = useState(null);

  useEffect(() => {
    const target = location.state?.highlightId;
    if (target) {
      setHighlightId(target);
      setTypeFilter('all');
      setSearch('');
      const timer = setTimeout(() => setHighlightId(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const types = useMemo(() => {
    const t = new Set((sources || []).map(s => s.type).filter(Boolean));
    return ['all', ...Array.from(t).sort()];
  }, [sources]);

  const filtered = useMemo(() => {
    const items = (sources || []).filter(s => {
      if (typeFilter !== 'all' && s.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (s.citation || '').toLowerCase().includes(q) ||
          (s.id || '').toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q) ||
          (s.relevance || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
    if (sort === 'relevance') {
      items.sort((a, b) => (b.relevanceScore?.total || 0) - (a.relevanceScore?.total || 0));
    }
    return items;
  }, [sources, typeFilter, search, sort]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Sources</h2>
        <p className="text-xs text-text-dim mt-1">
          {sources?.length || 0} legal authorities, statutes, regulations, and policy documents supporting the case
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search sources..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-surface-alt border border-border rounded-lg px-3 py-2 text-sm w-64 focus:border-accent focus:outline-none"
        />
        <div className="flex gap-1 flex-wrap">
          {types.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === t ? 'bg-accent/15 text-accent' : 'bg-surface-alt text-text-dim hover:text-text'
              }`}
            >
              {t === 'all' ? 'All' : TYPE_LABELS[t] || t}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1 items-center">
          <span className="text-[10px] text-text-dim mr-1">Sort:</span>
          <button
            onClick={() => setSort('default')}
            className={`px-2 py-1 rounded text-xs ${sort === 'default' ? 'bg-accent/15 text-accent' : 'text-text-dim'}`}
          >
            Default
          </button>
          <button
            onClick={() => setSort('relevance')}
            className={`px-2 py-1 rounded text-xs ${sort === 'relevance' ? 'bg-accent/15 text-accent' : 'text-text-dim'}`}
          >
            Relevance
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(src => (
          <SourceRow key={src.id} source={src} highlight={highlightId === src.id} />
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-text-dim text-center py-8">No sources match your search.</p>
        )}
      </div>
    </div>
  );
}

function SourceRow({ source, highlight }) {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef(null);

  useEffect(() => {
    if (highlight) {
      setExpanded(true);
      requestAnimationFrame(() => {
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [highlight]);

  const accessHint = source.url
    ? null
    : source.type === 'case' || source.type === 'caselaw' || source.type === 'case-law' || source.type === 'case-persuasive'
    ? 'Available via Westlaw, LexisNexis, or Justia (if published). Request attorney access for full opinion text.'
    : source.type === 'statute' || source.type === 'regulation'
    ? 'Available via Kansas Revisor of Statutes website (ksrevisor.gov) or Cornell LII.'
    : 'Contact attorney for access or submit KORA request to the issuing entity.';

  return (
    <div
      ref={rowRef}
      id={source.id}
      className={`bg-surface-alt border rounded-xl overflow-hidden transition-all duration-1000 ${
        highlight ? 'border-accent ring-2 ring-accent/30' : 'border-border'
      }`}
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
              {source.relevanceScore && <RelevanceBadge score={source.relevanceScore} />}
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
            <div className="border-l-2 border-accent pl-3">
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
