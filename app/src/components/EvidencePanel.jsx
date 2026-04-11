import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useCase } from '../data/useCase';
import { contradictionReferencesDoc, normalizeContradiction } from '../lib/contradictionUtils';
import DocLink from './DocLink';
import RelevanceBadge from './RelevanceBadge';

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
  const data = useCase();

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={close} />
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-surface border-l border-border z-50 overflow-y-auto shadow-2xl animate-slide-in">
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-sm font-bold text-accent">
            {activeDocId ? `Evidence: ${activeDocId}` : `Thread View`}
          </h2>
          <button onClick={close} className="text-text-dim hover:text-text text-lg leading-none">&times;</button>
        </div>
        <div className="p-6">
          {activeDocId && <DocDetail docId={activeDocId} />}
          {activeThreadId && <ThreadDetail threadId={activeThreadId} />}
        </div>
      </div>
    </>
  );
}

function DocDetail({ docId }) {
  const { evidence, contradictions, lookup } = useCase();
  const { openThread } = usePanel();
  const doc = lookup.evidence[docId];
  if (!doc) return <p className="text-text-dim">Document not found.</p>;

  const thread = doc.threadId ? lookup.threads[doc.threadId] : null;
  const relatedContradictions = (contradictions || [])
    .filter(c => contradictionReferencesDoc(c, docId))
    .map(normalizeContradiction);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
            doc.type === 'email' ? 'bg-blue-500/20 text-blue-300' :
            doc.type === 'form' ? 'bg-amber-500/20 text-amber-300' :
            doc.type === 'document' ? 'bg-emerald-500/20 text-emerald-300' :
            'bg-gray-500/20 text-gray-300'
          }`}>
            {doc.type}
          </span>
          {doc.relevanceScore && <RelevanceBadge score={doc.relevanceScore} expandable />}
        </div>
        <h3 className="mt-2 text-lg font-semibold">{doc.title || doc.id}</h3>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-dim">
          {doc.date && <span>{doc.date}</span>}
          {doc.time && <span>{doc.time}</span>}
          {doc.source && <span>From: {lookup.actors[doc.source]?.name || doc.source}</span>}
        </div>
      </div>

      {doc.summary && (
        <div>
          <h4 className="text-xs font-bold uppercase text-text-dim mb-2">Summary</h4>
          <p className="text-sm leading-relaxed">{doc.summary}</p>
        </div>
      )}

      {doc.bodyText && doc.bodyText !== doc.summary && (
        <div>
          <h4 className="text-xs font-bold uppercase text-text-dim mb-2">Full Content</h4>
          <div className="bg-bg rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap font-mono text-text/90 max-h-96 overflow-y-auto">
            {doc.bodyText}
          </div>
        </div>
      )}

      {doc.keyClaims && doc.keyClaims.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase text-text-dim mb-2">Key Claims</h4>
          <ul className="space-y-1">
            {doc.keyClaims.map((claim, i) => (
              <li key={i} className="text-sm pl-3 border-l-2 border-accent/40">{claim}</li>
            ))}
          </ul>
        </div>
      )}

      {thread && (
        <div>
          <h4 className="text-xs font-bold uppercase text-text-dim mb-2">Thread</h4>
          <button
            onClick={() => openThread(thread.id)}
            className="w-full text-left bg-surface-alt rounded-lg p-3 hover:bg-border/30 transition-colors"
          >
            <p className="text-sm font-medium text-accent">{thread.title}</p>
            <p className="text-xs text-text-dim mt-1">{thread.abstract}</p>
            <p className="text-xs text-text-dim mt-1">{thread.docIds.length} messages in thread</p>
          </button>
        </div>
      )}

      {relatedContradictions.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase text-text-dim mb-2">Related Contradictions</h4>
          <div className="space-y-2">
            {relatedContradictions.map(c => (
              <div key={c.id} className="bg-danger/10 border border-danger/20 rounded-lg p-3">
                <p className="text-xs font-bold text-danger">{c.id}: {c.label}</p>
                <p className="text-xs mt-1 text-text-dim">{c.summary}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {c.docIdA && <DocLink id={c.docIdA} />}
                  {c.docIdB && <DocLink id={c.docIdB} />}
                </div>
              </div>
            ))}
          </div>
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
            className="w-full text-left bg-surface-alt rounded-lg p-4 hover:bg-border/30 transition-colors border border-border"
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
