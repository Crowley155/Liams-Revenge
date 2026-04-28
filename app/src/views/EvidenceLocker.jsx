import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  deleteDocument,
  fetchCaseDocuments,
  uploadCaseDocument,
} from '../api/client';
import {
  EVIDENCE_TYPES,
  Panel,
  StatusPill,
  formatBytes,
  formatLabel,
} from './caseShared';

const EMPTY_UPLOAD = {
  evidenceType: 'communications',
  userDescription: '',
  documentDate: '',
  sourcePerson: '',
};

function statusOf(doc) {
  return doc.processing_status || doc.status || 'uploaded';
}

export default function EvidenceLocker() {
  const { caseId } = useParams();
  const [documents, setDocuments] = useState([]);
  const [file, setFile] = useState(null);
  const [uploadMeta, setUploadMeta] = useState(EMPTY_UPLOAD);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDocuments(await fetchCaseDocuments(caseId));
    } catch (err) {
      setError(err.message || 'Failed to load Evidence Locker');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const counts = useMemo(() => {
    const next = { total: documents.length, indexed: 0, processing: 0, needs_review: 0, failed: 0 };
    for (const doc of documents) {
      const status = statusOf(doc);
      if (status === 'indexed') next.indexed += 1;
      else if (status === 'needs_review') next.needs_review += 1;
      else if (status === 'failed') next.failed += 1;
      else next.processing += 1;
    }
    return next;
  }, [documents]);

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const doc = await uploadCaseDocument(caseId, file, uploadMeta);
      setDocuments((current) => [doc, ...current]);
      setFile(null);
      setUploadMeta(EMPTY_UPLOAD);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (docId) => {
    setBusy(true);
    setError('');
    try {
      await deleteDocument(docId);
      setDocuments((current) => current.filter((doc) => doc.id !== docId));
    } catch (err) {
      setError(err.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8 animate-fade-up">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/80">Private evidence</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">Evidence Locker</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-dim">
            Upload emails, PDFs, screenshots, meeting notes, agency letters, and incident records. Files stay private to this workspace unless you explicitly choose to share a limited summary.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <StatusPill status={`${counts.total} files`} />
          <StatusPill status={`${counts.indexed} indexed`} />
          {counts.processing > 0 && <StatusPill status={`${counts.processing} processing`} />}
          {counts.needs_review > 0 && <StatusPill status={`${counts.needs_review} needs review`} />}
          {counts.failed > 0 && <StatusPill status={`${counts.failed} failed`} />}
        </div>
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Panel title="Add Evidence" eyebrow="Upload and describe">
          <div className="space-y-3">
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.webp,.bmp,.docx,.eml,.txt,.md"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              value={uploadMeta.evidenceType}
              onChange={(event) => setUploadMeta((current) => ({ ...current, evidenceType: event.target.value }))}
            >
              {EVIDENCE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              type="date"
              value={uploadMeta.documentDate}
              onChange={(event) => setUploadMeta((current) => ({ ...current, documentDate: event.target.value }))}
            />
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              value={uploadMeta.sourcePerson}
              onChange={(event) => setUploadMeta((current) => ({ ...current, sourcePerson: event.target.value }))}
              placeholder="Who is this from?"
            />
            <textarea
              className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              value={uploadMeta.userDescription}
              onChange={(event) => setUploadMeta((current) => ({ ...current, userDescription: event.target.value }))}
              placeholder="Why this matters, in your words"
            />
            <button
              disabled={!file || busy}
              onClick={handleUpload}
              className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              Add To Evidence Locker
            </button>
          </div>
        </Panel>

        <Panel title="Locker Contents" eyebrow="Manage files">
          {loading && <p className="text-sm text-text-dim">Loading evidence...</p>}
          {!loading && documents.length === 0 && (
            <div className="rounded-md border border-border bg-background px-4 py-8 text-center">
              <h3 className="font-semibold text-text">No evidence uploaded yet</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-text-dim">
                You can still get a useful first evaluation from your story. Upload documents when you have them.
              </p>
            </div>
          )}
          {!loading && documents.length > 0 && (
            <div className="divide-y divide-border">
              {documents.map((doc) => (
                <article key={doc.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-text">{doc.filename}</h3>
                        <StatusPill status={statusOf(doc)} />
                        {doc.ocr_status && doc.ocr_status !== 'not_required' && <StatusPill status={`ocr ${doc.ocr_status}`} />}
                      </div>
                      <p className="mt-1 text-xs text-text-dim">
                        {formatLabel(doc.evidence_type || 'evidence')}
                        {doc.document_date ? ` - ${doc.document_date}` : ''}
                        {doc.source_person ? ` - from ${doc.source_person}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(doc.id)}
                      className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>

                  {doc.user_description && <p className="mt-3 text-sm leading-relaxed text-text-dim">{doc.user_description}</p>}
                  {doc.failure_reason && <p className="mt-3 text-sm text-danger">{doc.failure_reason}</p>}

                  <dl className="mt-3 grid gap-2 text-xs text-text-dim sm:grid-cols-4">
                    <div>
                      <dt className="font-semibold text-text">Size</dt>
                      <dd>{formatBytes(doc.file_size) || 'Unknown'}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-text">Indexed chunks</dt>
                      <dd>{doc.chunk_count || 0}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-text">Pages</dt>
                      <dd>{doc.page_count || 'Unknown'}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-text">Uploaded</dt>
                      <dd>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'Unknown'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
