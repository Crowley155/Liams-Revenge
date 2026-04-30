import { useState, useMemo } from 'react';
import { useCase } from '../data/useCase';
import DocLink from '../components/DocLink';

const SEVERITY_STYLE = {
  critical: { bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-400', ring: 'ring-red-400/30' },
  high:     { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400', ring: 'ring-amber-400/30' },
  medium:   { bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400', ring: 'ring-blue-400/30' },
};

const DEFAULT_STYLE = { bg: 'bg-text-dim/15', text: 'text-text-dim', dot: 'bg-text-dim', ring: 'ring-text-dim/30' };

export default function Contradictions() {
  const data = useCase();
  const [expandedId, setExpandedId] = useState(null);
  const [severityFilter, setSeverityFilter] = useState('');

  const contradictions = useMemo(() => data.contradictions || [], [data]);

  const severities = useMemo(
    () => [...new Set(contradictions.map((c) => c.severity))].sort(),
    [contradictions],
  );

  const filtered = useMemo(
    () => severityFilter ? contradictions.filter((c) => c.severity === severityFilter) : contradictions,
    [contradictions, severityFilter],
  );

  const counts = useMemo(() => {
    const m = {};
    for (const c of contradictions) m[c.severity] = (m[c.severity] || 0) + 1;
    return m;
  }, [contradictions]);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-up">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent/70 mb-3">
          Crowley v. USD 232 / JCPRD
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          What They Said vs. What Happened
        </h2>
        <p className="text-[15px] leading-[1.8] text-text/80 max-w-2xl text-pretty">
          {contradictions.length} documented contradictions between official statements, internal records,
          and verifiable facts. Each one is sourced and cross-referenced.
        </p>
      </div>

      {/* Severity filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setSeverityFilter('')}
          className={`text-[11px] px-3 py-1 rounded-full border transition-colors ${
            !severityFilter ? 'bg-accent/15 text-accent border-accent/30' : 'text-text-dim border-border hover:border-accent/30'
          }`}
        >
          All ({contradictions.length})
        </button>
        {severities.map((s) => {
          const style = SEVERITY_STYLE[s] || DEFAULT_STYLE;
          return (
            <button
              key={s}
              onClick={() => setSeverityFilter(severityFilter === s ? '' : s)}
              className={`text-[11px] px-3 py-1 rounded-full border transition-colors capitalize ${
                severityFilter === s ? `${style.bg} ${style.text} border-current` : 'text-text-dim border-border hover:border-accent/30'
              }`}
            >
              {s} ({counts[s] || 0})
            </button>
          );
        })}
      </div>

      {/* Contradiction cards */}
      <div className="space-y-4">
        {filtered.map((c) => {
          const style = SEVERITY_STYLE[c.severity] || DEFAULT_STYLE;
          const isExpanded = expandedId === c.id;
          const allDocIds = [
            ...(c.claimA?.docIds || []),
            ...(c.claimB?.docIds || []),
          ];
          const uniqueDocs = [...new Set(allDocIds)];

          return (
            <div
              key={c.id}
              className="bg-surface border border-border rounded-lg overflow-hidden transition-colors hover:border-accent/30"
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-surface-alt/50 transition-colors"
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${style.bg} ${style.text}`}>
                  {c.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold">{c.title}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-dim/60">
                    <span>{c.id}</span>
                    <span>·</span>
                    <span>{uniqueDocs.length} source{uniqueDocs.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <span className="text-text-dim text-xs mt-1 shrink-0">
                  {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-border/50 space-y-4">
                  {/* Claim A */}
                  <div className="mt-4 bg-danger/5 border border-danger/20 rounded-lg p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-danger/70 mb-1.5">
                      {c.claimA?.actor || 'Official Statement'}
                    </p>
                    <p className="text-sm leading-relaxed text-text/90 italic">"{c.claimA?.text}"</p>
                    <div className="flex gap-1.5 mt-2">
                      {(c.claimA?.docIds || []).map((id) => (
                        <DocLink key={id} id={id}>{id}</DocLink>
                      ))}
                    </div>
                  </div>

                  {/* VS divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t border-border/40" />
                    <span className="text-xs font-bold text-text-dim/50 uppercase tracking-widest">vs</span>
                    <div className="flex-1 border-t border-border/40" />
                  </div>

                  {/* Claim B */}
                  <div className="bg-success/5 border border-success/20 rounded-lg p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-success/70 mb-1.5">
                      {c.claimB?.actor || 'Counter-evidence'}
                    </p>
                    <p className="text-sm leading-relaxed text-text/90 italic">"{c.claimB?.text}"</p>
                    <div className="flex gap-1.5 mt-2">
                      {(c.claimB?.docIds || []).map((id) => (
                        <DocLink key={id} id={id}>{id}</DocLink>
                      ))}
                    </div>
                  </div>

                  {/* Impact */}
                  {c.impact && (
                    <div className="bg-surface-alt rounded-lg p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-accent/70 mb-1.5">Why it matters</p>
                      <p className="text-[15px] leading-[1.8] text-text/85 text-pretty">{c.impact}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm text-text-dim">
          No contradictions match the current filter.
        </div>
      )}
    </div>
  );
}
