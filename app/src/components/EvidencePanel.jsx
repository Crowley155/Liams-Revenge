import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useCase } from '../data/useCase';

const PanelContext = createContext(null);

export function EvidencePanelProvider({ children }) {
  const [activeDocId, setActiveDocId] = useState(null);
  const [activeThreadId, setActiveThreadId] = useState(null);

  const openDoc = useCallback((id) => {
    setActiveDocId(id);
    setActiveThreadId(null);
  }, []);

  const openThread = useCallback((id) => {
    setActiveThreadId(id);
    setActiveDocId(null);
  }, []);

  const close = useCallback(() => {
    setActiveDocId(null);
    setActiveThreadId(null);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <PanelContext.Provider value={{ activeDocId, activeThreadId, openDoc, openThread, close }}>
      {children}
      {(activeDocId || activeThreadId) && <Panel />}
    </PanelContext.Provider>
  );
}

export function usePanel() {
  return useContext(PanelContext);
}

function Panel() {
  const { activeDocId, activeThreadId, close } = usePanel();
  const { lookup } = useCase();

  const isSource = activeDocId && !lookup.evidence[activeDocId] && lookup.sources[activeDocId];
  const headerLabel = activeThreadId
    ? 'Thread View'
    : isSource
    ? `Source: ${activeDocId}`
    : `Evidence: ${activeDocId}`;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background/75" onClick={close} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-border bg-surface animate-slide-in" style={{ boxShadow: 'var(--shadow-elevated)' }}>
        <div className="sticky top-0 bg-surface border-b border-border px-4 sm:px-6 py-4 flex items-center justify-between gap-3 z-10">
          <h2 className="text-sm font-bold text-accent min-w-0 truncate">{headerLabel}</h2>
          <button onClick={close} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md text-lg leading-none text-text-dim transition-colors hover:bg-surface-alt hover:text-text" aria-label="Close evidence panel">&times;</button>
        </div>
        <div className="p-4 sm:p-6">
          {activeDocId && <DocDetail docId={activeDocId} />}
          {activeThreadId && <ThreadDetail threadId={activeThreadId} />}
        </div>
      </div>
    </>
  );
}

function DocDetail({ docId }) {
  const { lookup } = useCase();
  const doc = lookup.evidence[docId];
  if (!doc) {
    const source = lookup.sources[docId];
    if (source) return <SourceDetail source={source} />;
    return <p className="text-text-dim">Document not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            doc.type === 'email' ? 'border-info/30 bg-info/12 text-info' :
            doc.type === 'form' ? 'border-warning/30 bg-warning/12 text-warning' :
            doc.type === 'document' ? 'border-success/30 bg-success/12 text-success' :
            doc.type === 'pdf' ? 'border-accent/30 bg-accent/15 text-accent' :
            'border-border bg-surface-alt text-text-dim'
          }`}>
            {doc.type}
          </span>
          {doc.important && (
            <span className="inline-block rounded-md border border-warning/30 bg-warning/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
              Important
            </span>
          )}
        </div>
        <h3 className="mt-2 text-lg font-semibold">{doc.title || doc.id}</h3>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-dim">
          {doc.date && <span>{doc.date}</span>}
          {doc.time && <span>{doc.time}</span>}
          {doc.source && <span>From: {lookup.actors[doc.source]?.name || doc.source}</span>}
        </div>
      </div>

      {doc.pdfFile && (
        <a
          href={`./docs/${doc.pdfFile}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 w-full items-center gap-3 rounded-md border border-accent/30 bg-accent/10 px-4 py-3 transition-colors hover:bg-accent/20"
        >
          <span className="text-accent text-lg">&#128196;</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-accent">View Document</p>
            <p className="text-xs text-text-dim truncate">{doc.pdfFile}</p>
          </div>
          <span className="text-accent text-xs shrink-0">Open PDF ↗</span>
        </a>
      )}

      {doc.url && (
        <div>
          <h4 className="text-xs font-bold uppercase text-text-dim mb-2">Source Link</h4>
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:text-accent-hover underline break-all"
          >
            {doc.url}
          </a>
        </div>
      )}

      {doc.summary && (
        <div>
          <h4 className="text-xs font-bold uppercase text-text-dim mb-2">Summary</h4>
          <p className="text-sm leading-relaxed">{doc.summary}</p>
        </div>
      )}

      {doc.bodyText && doc.bodyText !== doc.summary && (
        <div>
          <h4 className="text-xs font-bold uppercase text-text-dim mb-2">Full Content</h4>
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm leading-relaxed text-text/90">
            {doc.bodyText}
          </div>
        </div>
      )}

      {doc.keyClaims && doc.keyClaims.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase text-text-dim mb-2">Key Claims</h4>
          <ul className="space-y-1">
            {doc.keyClaims.map((claim, i) => (
              <li key={i} className="rounded-md border border-border bg-background px-3 py-2 text-sm">{claim}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ThreadDetail({ threadId }) {
  const { lookup } = useCase();
  const { openDoc } = usePanel();
  const thread = lookup.threads[threadId];
  if (!thread) return <p className="text-text-dim">Thread not found.</p>;

  const docs = thread.docIds.map(id => lookup.evidence[id]).filter(Boolean);
  docs.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">{thread.title}</h3>
        <p className="text-sm text-text-dim mt-2">{thread.abstract}</p>
        <p className="text-xs text-text-dim mt-1">{thread.docIds.length} messages &middot; Source: {thread.emlFile}</p>
      </div>

      <div className="space-y-3">
        {docs.map(doc => (
          <button
            key={doc.id}
            onClick={() => openDoc(doc.id)}
            className="min-h-11 w-full rounded-md border border-border bg-surface-alt p-4 text-left transition-colors hover:bg-border/30"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-accent">{doc.id}</span>
              <span className="text-xs text-text-dim">{doc.date} {doc.time || ''}</span>
            </div>
            <p className="text-sm font-medium">{doc.title || doc.summary?.substring(0, 80)}</p>
            <p className="text-xs text-text-dim mt-1">
              {lookup.actors[doc.source]?.name || doc.source}
            </p>
            {doc.bodyText && doc.bodyText !== doc.summary && (
              <p className="text-xs text-text-dim/70 mt-2 line-clamp-2">{doc.bodyText.substring(0, 200)}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

const SOURCE_TYPE_LABELS = {
  statute: 'Statute',
  regulation: 'Regulation',
  case: 'Case Law',
  caselaw: 'Case Law',
  'case-law': 'Case Law',
  'case-persuasive': 'Case Law',
  documentary: 'Document',
  'web-evidence': 'Document',
  'board-policy': 'Board Policy',
};

const VERIFICATION_COLORS = {
  verified: 'bg-success/20 text-success',
  'partially-verified': 'bg-warning/20 text-warning',
  unverified: 'bg-text-dim/20 text-text-dim',
  'needs-verification': 'bg-danger/20 text-danger',
};

function getAccessHint(source) {
  if (source.url) return null;
  if (['case', 'caselaw', 'case-law', 'case-persuasive'].includes(source.type))
    return 'Available via Westlaw, LexisNexis, or Justia (if published). Request attorney access for full opinion text.';
  if (['statute', 'regulation'].includes(source.type))
    return 'Available via Kansas Revisor of Statutes website (ksrevisor.gov) or Cornell LII.';
  return 'Contact attorney for access or submit KORA request to the issuing entity.';
}

function SourceDetail({ source }) {
  const accessHint = getAccessHint(source);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-xs font-mono text-text-dim">{source.id}</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-surface-alt text-text-dim">
            {SOURCE_TYPE_LABELS[source.type] || source.type}
          </span>
          {source.important && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300">
              Important
            </span>
          )}
          {source.verification && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
              VERIFICATION_COLORS[source.verification?.toLowerCase().replace(/\s+/g, '-')] || 'bg-surface-alt text-text-dim'
            }`}>
              {source.verification}
            </span>
          )}
        </div>
        <h3 className="text-lg font-semibold">{source.citation}</h3>
      </div>

      {source.holding && (
        <div>
          <h4 className="text-xs font-bold uppercase text-text-dim mb-2">Summary</h4>
          <p className="text-sm leading-relaxed">{source.holding}</p>
        </div>
      )}

      {source.keyQuote && (
        <div className="rounded-md border border-border bg-background p-3">
          <h4 className="text-[10px] font-bold uppercase text-accent mb-1">Key Quote</h4>
          <p className="text-sm italic text-text leading-relaxed">{source.keyQuote}</p>
        </div>
      )}

      {source.relevance && (
        <div>
          <h4 className="text-xs font-bold uppercase text-text-dim mb-2">What This Means for the Case</h4>
          <p className="text-sm leading-relaxed">{source.relevance}</p>
        </div>
      )}

      <div>
        <h4 className="text-xs font-bold uppercase text-text-dim mb-2">How to Access</h4>
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:text-accent-hover underline break-all"
          >
            {source.url}
          </a>
        ) : (
          <p className="text-sm text-text-dim">{accessHint}</p>
        )}
      </div>
    </div>
  );
}
