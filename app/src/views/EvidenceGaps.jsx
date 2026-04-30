import { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCase } from '../data/useCase';
import { useAuth } from '../auth/AuthContext';
import { fetchKoraRequests } from '../api/client';

const IMPORTANCE_STYLE = {
  CRITICAL: { bg: 'bg-red-500/15', text: 'text-red-400' },
  HIGH:     { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  MEDIUM:   { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  LOW:      { bg: 'bg-text-dim/15', text: 'text-text-dim' },
};

const DEFAULT_STYLE = { bg: 'bg-text-dim/15', text: 'text-text-dim' };

export default function EvidenceGaps() {
  const { caseId } = useParams();
  const data = useCase();
  const { isAuthenticated } = useAuth();
  const [koraRequests, setKoraRequests] = useState([]);
  const [importanceFilter, setImportanceFilter] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      fetchKoraRequests('', caseId).then(setKoraRequests).catch(() => {});
    }
  }, [caseId, isAuthenticated]);

  const gaps = useMemo(() => data.evidenceGaps || [], [data]);

  const importanceLevels = useMemo(
    () => [...new Set(gaps.map((g) => g.importance))].sort(),
    [gaps],
  );

  const filtered = useMemo(
    () => importanceFilter ? gaps.filter((g) => g.importance === importanceFilter) : gaps,
    [gaps, importanceFilter],
  );

  const koraByGapId = useMemo(() => {
    const m = {};
    for (const req of koraRequests) {
      for (const gid of (req.evidence_gap_ids || [])) {
        if (!m[gid]) m[gid] = [];
        m[gid].push(req);
      }
    }
    return m;
  }, [koraRequests]);

  const counts = useMemo(() => {
    const m = {};
    for (const g of gaps) m[g.importance] = (m[g.importance] || 0) + 1;
    return m;
  }, [gaps]);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-up">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent/70 mb-3">
          Crowley v. USD 232 / JCPRD
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          What We Still Don't Have
        </h2>
        <p className="text-[15px] leading-[1.8] text-text/80 max-w-2xl text-pretty">
          {gaps.length} identified gaps in the evidence record. Each one represents a document,
          record, or confirmation that could strengthen or change the case.
          {koraRequests.length > 0 && ` ${koraRequests.length} KORA requests are already in motion to fill them.`}
        </p>
      </div>

      {/* Importance filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setImportanceFilter('')}
          className={`text-[11px] px-3 py-1 rounded-full border transition-colors ${
            !importanceFilter ? 'bg-accent/15 text-accent border-accent/30' : 'text-text-dim border-border hover:border-accent/30'
          }`}
        >
          All ({gaps.length})
        </button>
        {importanceLevels.map((lvl) => {
          const style = IMPORTANCE_STYLE[lvl] || DEFAULT_STYLE;
          return (
            <button
              key={lvl}
              onClick={() => setImportanceFilter(importanceFilter === lvl ? '' : lvl)}
              className={`text-[11px] px-3 py-1 rounded-full border transition-colors ${
                importanceFilter === lvl ? `${style.bg} ${style.text} border-current` : 'text-text-dim border-border hover:border-accent/30'
              }`}
            >
              {lvl} ({counts[lvl] || 0})
            </button>
          );
        })}
      </div>

      {/* Gap cards */}
      <div className="space-y-3">
        {filtered.map((gap) => {
          const style = IMPORTANCE_STYLE[gap.importance] || DEFAULT_STYLE;
          const linkedKora = koraByGapId[gap.id] || [];

          return (
            <div
              key={gap.id}
              className="bg-surface border border-border rounded-lg p-5 transition-colors hover:border-accent/30"
            >
              <div className="flex items-start gap-3">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${style.bg} ${style.text}`}>
                  {gap.importance}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-text">{gap.item}</p>
                  <p className="text-xs text-text-dim mt-1">
                    <span className="text-text-dim/60">{gap.id}</span>
                    <span className="mx-2 text-text-dim/30">·</span>
                    <span>Method: {gap.method}</span>
                  </p>
                </div>
              </div>

              {linkedKora.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/40">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-accent/70 mb-1.5">
                    Linked KORA Requests
                  </p>
                  <div className="space-y-1.5">
                    {linkedKora.map((req) => {
                      const statusColor = {
                        draft: 'text-text-dim bg-text-dim/10',
                        sent: 'text-accent bg-accent/10',
                        fulfilled: 'text-success bg-success/10',
                        denied: 'text-danger bg-danger/10',
                        partial: 'text-warning bg-warning/10',
                      }[req.status] || 'text-text-dim bg-text-dim/10';

                      return (
                        <div key={req.id} className="flex items-center gap-2 text-xs">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${statusColor}`}>
                            {req.status}
                          </span>
                          <span className="text-text/80 truncate">{req.subject || 'Untitled'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {linkedKora.length === 0 && gap.method?.toUpperCase().includes('KORA') && (
                <div className="mt-3 pt-3 border-t border-border/40">
                  <p className="text-xs text-warning/80 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning inline-block" />
                    KORA-eligible but no request generated yet
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm text-text-dim">
          No evidence gaps match the current filter.
        </div>
      )}

      {/* Summary footer */}
      <div className="border-t border-border pt-8">
        <div className="bg-surface-alt border border-border rounded-xl p-6 sm:p-8">
          <p className="text-[15px] leading-[1.8] text-text/85 text-pretty">
            Every gap in this list is a question the institutions could answer but haven't.
            Some require KORA requests. Some require subpoenas. Some just require someone
            to ask. The point of this page is transparency — you can see exactly what we
            know, what we don't, and what we're doing about it.
          </p>
          {isAuthenticated && koraRequests.length > 0 && (
            <Link
              to={`/cases/${caseId}/records`}
              className="inline-block mt-4 text-sm font-medium text-accent hover:text-accent-hover transition-colors"
            >
              View records requests &rarr;
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
