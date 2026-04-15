import { useState, useMemo } from 'react';
import { useCase } from '../data/useCase';
import DocLink from '../components/DocLink';

const TYPE_STYLES = {
  email:      { bg: 'bg-blue-500/15',    text: 'text-blue-400',    dot: 'bg-blue-400' },
  form:       { bg: 'bg-amber-500/15',   text: 'text-amber-400',   dot: 'bg-amber-400' },
  document:   { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  pdf:        { bg: 'bg-violet-500/15',  text: 'text-violet-400',  dot: 'bg-violet-400' },
  narrative:  { bg: 'bg-rose-500/15',    text: 'text-rose-400',    dot: 'bg-rose-400' },
};

const DEFAULT_STYLE = { bg: 'bg-text-dim/15', text: 'text-text-dim', dot: 'bg-text-dim' };

function groupByMonth(events) {
  const groups = {};
  for (const ev of events) {
    const d = new Date(ev.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    if (!groups[key]) groups[key] = { key, label, events: [] };
    groups[key].events.push(ev);
  }
  return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
}

export default function Timeline() {
  const data = useCase();
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  const events = useMemo(() => {
    const evidenceItems = (data.evidence || [])
      .filter((e) => e.date)
      .map((e) => ({
        ...e,
        actorName: data.lookup.actors[e.source]?.name || e.source,
      }));

    const narrativeItems = (data.timeline || [])
      .filter((t) => t.date)
      .map((t) => ({
        id: t.id,
        date: t.date,
        time: t.time || null,
        type: 'narrative',
        summary: t.action,
        source: t.actor,
        actorName: data.lookup.actors[t.actor]?.name || t.actor,
        keyClaims: [],
        docIds: t.docIds || [],
        important: t.significance === 'critical',
        category: t.category,
      }));

    const seen = new Set(evidenceItems.map((e) => e.id));
    const merged = [...evidenceItems];
    for (const n of narrativeItems) {
      if (!seen.has(n.id)) merged.push(n);
    }

    return merged.sort(
      (a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''),
    );
  }, [data]);

  const types = useMemo(() => [...new Set(events.map((e) => e.type))].sort(), [events]);
  const sources = useMemo(() => {
    const seen = new Map();
    for (const e of events) {
      if (e.source && !seen.has(e.source)) {
        seen.set(e.source, e.actorName);
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [events]);

  const filtered = useMemo(() => {
    let result = events;
    if (typeFilter) result = result.filter((e) => e.type === typeFilter);
    if (sourceFilter) result = result.filter((e) => e.source === sourceFilter);
    return result;
  }, [events, typeFilter, sourceFilter]);

  const months = useMemo(() => groupByMonth(filtered), [filtered]);

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-up">
      <div>
        <h2 className="text-2xl font-bold mb-1">Case Timeline</h2>
        <p className="text-xs text-text-dim">
          {events.length} events from case evidence and narrative timeline, ordered chronologically.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-dim">Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-[11px] bg-surface border border-border rounded px-2 py-1 text-text focus:outline-none focus:border-accent"
          >
            <option value="">All</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-dim">From:</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="text-[11px] bg-surface border border-border rounded px-2 py-1 text-text focus:outline-none focus:border-accent"
          >
            <option value="">All</option>
            {sources.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <span className="text-[11px] text-text-dim/60">
          Showing {filtered.length} of {events.length}
        </span>
      </div>

      {/* Timeline */}
      {months.map((month) => (
        <div key={month.key}>
          <div className="sticky top-0 z-10 bg-bg/90 backdrop-blur-sm py-2 mb-3">
            <h3 className="text-sm font-bold text-accent">{month.label}</h3>
          </div>
          <div className="relative pl-6 border-l-2 border-border space-y-4">
            {month.events.map((ev) => {
              const style = TYPE_STYLES[ev.type] || DEFAULT_STYLE;
              return (
                <div key={ev.id} className="relative group">
                  <div className={`absolute -left-[25px] top-3 w-3 h-3 rounded-full ${style.dot} ring-2 ring-bg`} />
                  <div className="bg-surface border border-border rounded-lg p-4 card-hover" style={{ boxShadow: 'var(--shadow-card)' }}>
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {ev.type === 'narrative' ? (
                          (ev.docIds || []).map((did) => (
                            <DocLink key={did} id={did}>{did}</DocLink>
                          ))
                        ) : (
                          <DocLink id={ev.id}>{ev.id}</DocLink>
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                          {ev.type}
                        </span>
                      </div>
                      <span className="text-[11px] text-text-dim shrink-0">
                        {new Date(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {ev.time && ` ${ev.time}`}
                      </span>
                    </div>
                    <p className="text-sm text-text leading-relaxed">{ev.summary || ev.title}</p>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-text-dim">
                      <span>{ev.actorName}</span>
                      {ev.important && <span className="text-amber-400 font-medium">Important</span>}
                    </div>
                    {ev.keyClaims?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ev.keyClaims.map((c, i) => (
                          <span key={i} className="text-[10px] bg-surface-alt text-text-dim rounded px-2 py-0.5">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm text-text-dim">
          No events match the current filters.
        </div>
      )}
    </div>
  );
}
