import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  FileSearch,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  deleteDocument,
  fetchDocumentContentBlob,
  fetchDocumentPreview,
} from '../api/client';
import { StatusPill, formatBytes, formatLabel } from './caseShared';
import { canPreviewOriginal, documentDisplayKind } from '../utils/documentPreview';
import {
  documentInsightSummary,
  evidenceCategoryLabel,
  evidenceRoleLabel,
  evidenceStatusOf,
  legalFlagLabel,
  relevancePercent,
} from '../utils/evidence';

function categoryLabel(value) {
  return evidenceCategoryLabel(value, formatLabel);
}

function DeleteEvidenceDialog({ doc, busy, onCancel, onConfirm }) {
  useEffect(() => {
    if (!doc) return undefined;
    const close = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [doc, onCancel]);

  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-background/85 p-4">
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="delete-evidence-title">
        <h3 id="delete-evidence-title" className="text-lg font-bold">Delete this evidence?</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-dim">
          This removes <strong className="text-text">{doc.filename}</strong> from the Evidence Locker and future Case Reads for this case.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} autoFocus className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text">Cancel</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-semibold text-background transition-colors hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            Delete evidence
          </button>
        </div>
      </section>
    </div>
  );
}

function MetadataItem({ label, value }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background p-3">
      <dt className="text-xs font-semibold text-text">{label}</dt>
      <dd className="wrap-anywhere mt-1 text-sm leading-relaxed text-text-dim">{value || 'Not set'}</dd>
    </div>
  );
}

export default function DocumentReview() {
  const { caseId, docId } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [contentUrl, setContentUrl] = useState('');
  const [contentError, setContentError] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('original');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const doc = preview?.document || null;
  const kind = documentDisplayKind(doc || {});
  const isPdf = kind === 'pdf';
  const isImage = kind === 'image';
  const insight = useMemo(() => documentInsightSummary(doc || {}), [doc]);
  const relevance = relevancePercent(doc?.relevance_score);
  const extractionConfidence = relevancePercent(doc?.extraction_confidence);

  const revokeContentUrl = useCallback(() => {
    setContentUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
  }, []);

  const loadPreview = useCallback(async () => {
    setStatus('loading');
    setError('');
    setContentError('');
    revokeContentUrl();
    try {
      const nextPreview = await fetchDocumentPreview(docId);
      setPreview(nextPreview);
      const previewDoc = nextPreview.document;
      if (nextPreview.has_original && canPreviewOriginal(previewDoc)) {
        try {
          const blob = await fetchDocumentContentBlob(docId);
          setContentUrl(URL.createObjectURL(blob));
        } catch (contentErr) {
          setContentError(contentErr.message || 'Original file could not be loaded inline.');
          setActiveTab('text');
        }
      } else {
        setActiveTab('text');
      }
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Preview failed');
    }
  }, [docId, revokeContentUrl]);

  useEffect(() => {
    loadPreview();
    return () => revokeContentUrl();
  }, [loadPreview, revokeContentUrl]);

  const handleDownload = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const blob = await fetchDocumentContentBlob(doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.filename || 'evidence';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteDocument(deleteTarget.id);
      setDeleteTarget(null);
      navigate(`/cases/${caseId}/locker`, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="product-ui mx-auto max-w-[96rem] min-w-0 space-y-5 py-6 sm:py-8 animate-fade-up">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link to={`/cases/${caseId}/locker`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Evidence Locker
          </Link>
          <p className="mt-4 text-xs font-medium text-accent/80">Document review</p>
          <h2 className="wrap-anywhere mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{doc?.filename || 'Loading evidence...'}</h2>
          {doc && (
            <p className="mt-2 text-sm leading-relaxed text-text-dim">
              {categoryLabel(doc.inferred_category || doc.evidence_type || kind)} - {formatBytes(doc.file_size) || 'Unknown size'} - {formatLabel(evidenceStatusOf(doc))}
            </p>
          )}
        </div>
        {doc && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleDownload} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              Download
            </button>
            <button type="button" onClick={() => setDeleteTarget(doc)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </button>
          </div>
        )}
      </div>

      {status === 'loading' && (
        <div className="grid min-h-[50vh] place-items-center rounded-md border border-border bg-surface">
          <div className="flex items-center gap-2 text-sm text-text-dim">
            <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
            Loading evidence preview...
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-5 text-sm text-danger">
          <p className="font-semibold">Preview did not load.</p>
          <p className="mt-1 leading-relaxed">{error || 'Try again from the Evidence Locker.'}</p>
          <button type="button" onClick={loadPreview} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-danger/40 px-3 py-2 font-semibold transition-colors hover:bg-danger/10">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && doc && (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <main className="min-w-0 overflow-hidden rounded-md border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setActiveTab('original')} className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${activeTab === 'original' ? 'bg-accent text-background' : 'text-text-dim hover:bg-surface-alt hover:text-text'}`}>
                  {isImage ? <ImageIcon className="h-4 w-4" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
                  Original
                </button>
                <button type="button" onClick={() => setActiveTab('text')} className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${activeTab === 'text' ? 'bg-accent text-background' : 'text-text-dim hover:bg-surface-alt hover:text-text'}`}>
                  <FileSearch className="h-4 w-4" aria-hidden="true" />
                  Extracted text
                </button>
              </div>
              <StatusPill status={kind} />
            </div>

            {activeTab === 'original' && (
              <div className="min-h-[68vh] bg-background">
                {contentUrl && isImage && <img src={contentUrl} alt={doc.filename} className="mx-auto max-h-[76vh] w-full object-contain" />}
                {contentUrl && isPdf && <iframe title={doc.filename} src={contentUrl} className="h-[76vh] w-full" />}
                {(!contentUrl || (!isImage && !isPdf)) && (
                  <div className="grid min-h-[68vh] place-items-center p-6 text-center text-sm text-text-dim">
                    <div>
                      <FileSearch className="mx-auto h-8 w-8" aria-hidden="true" />
                      <p className="mt-3 leading-relaxed">
                        {contentError || 'This original cannot be displayed inline. Use extracted text or download the original.'}
                      </p>
                      <button type="button" onClick={handleDownload} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text">
                        <Download className="h-4 w-4" aria-hidden="true" />
                        Download original
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'text' && (
              <div className="max-h-[76vh] min-h-[68vh] overflow-y-auto bg-background p-5">
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-text-dim">{preview.text_preview || doc.extracted_text || 'No text extracted yet.'}</pre>
              </div>
            )}
          </main>

          <aside className="min-w-0 space-y-4">
            <section className="rounded-md border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-accent/80">Document intelligence</p>
                  <h3 className="mt-1 text-lg font-bold">What USDWatch sees</h3>
                </div>
                {doc.evidence_role && <span className="rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-text-dim">{evidenceRoleLabel(doc.evidence_role, formatLabel)}</span>}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-text">{insight.summary}</p>
              <p className="mt-3 text-sm leading-relaxed text-text-dim">{insight.relevance}</p>
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 text-xs text-text-dim">
                  <span>Case relevance</span>
                  <span>{relevance ? `${relevance}%` : formatLabel(insight.status)}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${relevance}%` }} />
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 text-xs text-text-dim">
                  <span>Extraction confidence</span>
                  <span>{extractionConfidence ? `${extractionConfidence}%` : 'Needs text review'}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                  <div className="h-full rounded-full bg-info" style={{ width: `${extractionConfidence}%` }} />
                </div>
              </div>
              {doc.relevance_basis && (
                <div className="mt-4 rounded-md border border-border bg-background p-3">
                  <p className="text-xs font-semibold text-text">Why this score</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-dim">{doc.relevance_basis}</p>
                </div>
              )}
              {!!doc.legal_flags?.length && (
                <div className="mt-4 flex flex-wrap gap-1">
                  {doc.legal_flags.slice(0, 8).map((flag) => (
                    <span key={flag} className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-text-dim">
                      {legalFlagLabel(flag, formatLabel)}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 space-y-1 text-xs text-text-dim">
                {doc.insight_model && <p>Summary generated with {doc.insight_model}</p>}
                {doc.relevance_model && <p>Relevance scored with {doc.relevance_model}</p>}
              </div>
            </section>

            <section className="rounded-md border border-border bg-surface p-4">
              <p className="text-xs font-medium text-accent/80">Metadata</p>
              <dl className="mt-3 grid gap-2">
                <MetadataItem label="Category" value={categoryLabel(doc.inferred_category || doc.evidence_type)} />
                <MetadataItem label="Source" value={doc.source_person || doc.source || 'Manual upload'} />
                <MetadataItem label="Document date" value={doc.document_date} />
                <MetadataItem label="Uploaded" value={doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : ''} />
                <MetadataItem label="Pages" value={doc.page_count ? String(doc.page_count) : ''} />
                <MetadataItem label="Size" value={formatBytes(doc.file_size)} />
              </dl>
              {!!doc.tags?.length && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {doc.tags.slice(0, 8).map((tag) => <span key={tag} className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-dim">{categoryLabel(tag)}</span>)}
                </div>
              )}
            </section>

            {doc.failure_reason && <p className="rounded-md border border-warning/30 bg-warning/8 p-3 text-xs leading-relaxed text-warning">{doc.failure_reason}</p>}
          </aside>
        </div>
      )}

      <DeleteEvidenceDialog doc={deleteTarget} busy={busy} onCancel={() => setDeleteTarget(null)} onConfirm={handleDeleteConfirmed} />
    </div>
  );
}
