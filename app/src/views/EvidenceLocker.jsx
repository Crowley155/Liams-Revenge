import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Eye, FileSearch, FileUp, Loader2, Mail, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import {
  deleteDocument,
  disconnectGmail,
  fetchCaseDocuments,
  fetchDocumentContentBlob,
  fetchDocumentPreview,
  fetchGmailStatus,
  importGmailMessages,
  saveGmailImportRule,
  searchGmailMessages,
  startGmailOAuth,
  syncGmailMessages,
  uploadCaseDocument,
} from '../api/client';
import {
  Panel,
  StatusPill,
  formatBytes,
  formatLabel,
} from './caseShared';

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.tiff,.tif,.webp,.bmp,.docx,.eml,.txt,.md';
const IMAGE_COMPRESS_THRESHOLD = 10 * 1024 * 1024;
const MAX_DIMENSION = 2600;

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'messages', label: 'Messages' },
  { value: 'school_records', label: 'School records' },
  { value: 'iep_504_services', label: 'IEP/504 and services' },
  { value: 'incident_safety', label: 'Incident and safety' },
  { value: 'medical_provider', label: 'Medical/outside provider' },
  { value: 'complaints_agency', label: 'Complaints and agency letters' },
  { value: 'photos_screenshots', label: 'Photos/screenshots' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'indexed', label: 'Indexed' },
  { value: 'processing', label: 'Processing' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'failed', label: 'Failed' },
];

function statusOf(doc) {
  return doc.processing_status || doc.status || 'uploaded';
}

function categoryLabel(value) {
  return CATEGORY_OPTIONS.find((item) => item.value === value)?.label || formatLabel(value || 'evidence');
}

async function maybeCompressImage(file) {
  if (!file.type.startsWith('image/') || file.size <= IMAGE_COMPRESS_THRESHOLD) return { file, compressed: false };
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob || blob.size >= file.size) return { file, compressed: false };
  const nextName = file.name.replace(/\.[^.]+$/, '') + '-compressed.jpg';
  return { file: new File([blob], nextName, { type: 'image/jpeg' }), compressed: true };
}

function UploadQueueItem({ item, onRemove }) {
  return (
    <article className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="truncate text-sm font-semibold text-text">{item.file.name}</h4>
          <StatusPill status={item.status} />
          {item.compressed && <StatusPill status="compressed" />}
        </div>
        <p className="mt-1 text-xs text-text-dim">{formatBytes(item.file.size)}</p>
        {item.failureReason && <p className="mt-2 text-xs text-danger">{item.failureReason}</p>}
      </div>
      <button type="button" onClick={() => onRemove(item.id)} className="rounded-md p-2 text-text-dim transition-colors hover:bg-danger/10 hover:text-danger" title="Remove from queue" aria-label={`Remove ${item.file.name}`}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </article>
  );
}

function DocumentPreview({ preview, contentUrl, onClose }) {
  const doc = preview?.document;
  if (!preview || !doc) return null;
  const isImage = (doc.mime_type || '').startsWith('image/') || doc.file_type === 'image';
  const isPdf = (doc.mime_type || '').includes('pdf') || doc.file_type === 'pdf';

  return (
    <div className="fixed inset-0 z-50 grid bg-background/80 p-4 backdrop-blur-sm lg:place-items-center">
      <section className="mx-auto flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/80">Evidence preview</p>
            <h3 className="mt-1 truncate text-lg font-bold">{doc.filename}</h3>
            <p className="mt-1 text-xs text-text-dim">{categoryLabel(doc.inferred_category)} - {formatBytes(doc.file_size)} - {formatLabel(statusOf(doc))}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-text-dim transition-colors hover:bg-surface-alt hover:text-text" title="Close preview" aria-label="Close preview">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="min-h-[360px] overflow-hidden rounded-md border border-border bg-background">
            {contentUrl && isImage && <img src={contentUrl} alt={doc.filename} className="h-full max-h-[640px] w-full object-contain" />}
            {contentUrl && isPdf && <iframe title={doc.filename} src={contentUrl} className="h-[640px] w-full" />}
            {!contentUrl && (
              <div className="grid h-full min-h-[360px] place-items-center p-6 text-center text-sm text-text-dim">
                Original preview is not available for this file type yet. The extracted text is shown beside it.
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-background p-3">
              <h4 className="text-sm font-semibold">Extracted text</h4>
              <pre className="mt-3 max-h-[520px] whitespace-pre-wrap text-xs leading-relaxed text-text-dim">{preview.text_preview || 'No text extracted yet.'}</pre>
            </div>
            {doc.failure_reason && <p className="rounded-md border border-warning/30 bg-warning/8 p-3 text-xs leading-relaxed text-warning">{doc.failure_reason}</p>}
            {contentUrl && (
              <a href={contentUrl} download={doc.filename} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text">
                <Download className="h-4 w-4" aria-hidden="true" />
                Download original
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function EvidenceLocker() {
  const { caseId } = useParams();
  const [documents, setDocuments] = useState([]);
  const [queue, setQueue] = useState([]);
  const [filters, setFilters] = useState({ q: '', category: '', status: '', sort: 'uploaded_at', direction: 'desc' });
  const [gmailStatus, setGmailStatus] = useState(null);
  const [gmailRule, setGmailRule] = useState({ domains: '', email_addresses: '', keywords: '', include_attachments: true, auto_sync: false });
  const [gmailMessages, setGmailMessages] = useState([]);
  const [gmailQuery, setGmailQuery] = useState('');
  const [selectedGmailMessages, setSelectedGmailMessages] = useState([]);
  const [preview, setPreview] = useState(null);
  const [contentUrl, setContentUrl] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDocuments(await fetchCaseDocuments(caseId, filters));
    } catch (err) {
      setError(err.message || 'Failed to load Evidence Locker');
    } finally {
      setLoading(false);
    }
  }, [caseId, filters]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    let cancelled = false;
    fetchGmailStatus(caseId)
      .then((status) => {
        if (!cancelled) {
          setGmailStatus(status);
          const rule = status.connections?.[0]?.rule;
          if (rule) {
            setGmailRule({
              domains: (rule.domains || []).join(', '),
              email_addresses: (rule.email_addresses || []).join(', '),
              keywords: (rule.keywords || []).join(', '),
              include_attachments: rule.include_attachments ?? true,
              auto_sync: rule.auto_sync ?? false,
            });
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  useEffect(() => () => {
    if (contentUrl) URL.revokeObjectURL(contentUrl);
  }, [contentUrl]);

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
  const gmailConnection = gmailStatus?.connections?.[0] || null;
  const gmailConnected = gmailConnection?.status === 'connected';

  const addFiles = (files) => {
    const next = Array.from(files || []).map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
      file,
      status: 'uploaded',
      compressed: false,
    }));
    setQueue((current) => [...current, ...next]);
  };

  const updateQueueItem = (id, patch) => {
    setQueue((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const removeQueueItem = (id) => {
    setQueue((current) => current.filter((item) => item.id !== id));
  };

  const handleUploadQueue = async () => {
    if (!queue.length) return;
    setBusy(true);
    setError('');
    const uploadedDocs = [];
    try {
      for (const item of queue) {
        if (item.status === 'indexed' || item.status === 'needs_review') continue;
        updateQueueItem(item.id, { status: 'processing' });
        try {
          const prepared = await maybeCompressImage(item.file);
          const doc = await uploadCaseDocument(caseId, prepared.file, {});
          uploadedDocs.push(doc);
          updateQueueItem(item.id, {
            status: doc.processing_status || doc.status,
            uploaded: doc,
            compressed: prepared.compressed,
          });
        } catch (uploadError) {
          updateQueueItem(item.id, { status: 'failed', failureReason: uploadError.message });
        }
      }
      if (uploadedDocs.length) {
        setDocuments((current) => [...uploadedDocs, ...current]);
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async (doc) => {
    setBusy(true);
    setError('');
    try {
      const nextPreview = await fetchDocumentPreview(doc.id);
      if (contentUrl) URL.revokeObjectURL(contentUrl);
      setContentUrl('');
      if (nextPreview.has_original && ['pdf', 'image'].includes(nextPreview.document.file_type)) {
        const blob = await fetchDocumentContentBlob(doc.id);
        setContentUrl(URL.createObjectURL(blob));
      }
      setPreview(nextPreview);
    } catch (err) {
      setError(err.message || 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setError('');
    try {
      await deleteDocument(deleteTarget.id);
      setDocuments((current) => current.filter((doc) => doc.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveGmailRule = async () => {
    setBusy(true);
    setError('');
    try {
      const run = await saveGmailImportRule({
        case_id: caseId,
        domains: gmailRule.domains.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean),
        email_addresses: gmailRule.email_addresses.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean),
        keywords: gmailRule.keywords.split(',').map((item) => item.trim()).filter(Boolean),
        include_attachments: gmailRule.include_attachments,
        auto_sync: gmailRule.auto_sync,
      });
      const status = await fetchGmailStatus(caseId);
      setGmailStatus(status);
      setError(run.error || (status.connections?.[0]?.status === 'connected' ? 'Gmail rule saved.' : 'Gmail rule saved. Connect Gmail before messages can import.'));
    } catch (err) {
      setError(err.message || 'Gmail rule failed');
    } finally {
      setBusy(false);
    }
  };

  const handleConnectGmail = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await startGmailOAuth(caseId);
      window.location.href = result.authorization_url;
    } catch (err) {
      setError(err.message || 'Gmail connection failed');
      setBusy(false);
    }
  };

  const handleSearchGmail = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await searchGmailMessages({
        case_id: caseId,
        connection_id: gmailConnection?.id || '',
        query: gmailQuery,
        max_results: 25,
      });
      setGmailMessages(result.messages || []);
      setSelectedGmailMessages((result.messages || []).map((item) => item.id));
      setError(`Found ${result.messages?.length || 0} matching Gmail message${result.messages?.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message || 'Gmail search failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleGmailMessage = (messageId) => {
    setSelectedGmailMessages((current) => (
      current.includes(messageId) ? current.filter((id) => id !== messageId) : [...current, messageId]
    ));
  };

  const handleImportGmail = async () => {
    setBusy(true);
    setError('');
    try {
      const run = await importGmailMessages({
        case_id: caseId,
        connection_id: gmailConnection?.id || '',
        message_ids: selectedGmailMessages,
        query: gmailQuery,
        max_results: 25,
      });
      setError(`Imported ${run.imported_messages} message${run.imported_messages === 1 ? '' : 's'} and ${run.imported_attachments} attachment${run.imported_attachments === 1 ? '' : 's'}.`);
      await loadDocuments();
    } catch (err) {
      setError(err.message || 'Gmail import failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncGmail = async () => {
    setBusy(true);
    setError('');
    try {
      const run = await syncGmailMessages({
        case_id: caseId,
        connection_id: gmailConnection?.id || '',
        max_results: 25,
      });
      setError(`Sync imported ${run.imported_messages} message${run.imported_messages === 1 ? '' : 's'} and ${run.imported_attachments} attachment${run.imported_attachments === 1 ? '' : 's'}.`);
      await loadDocuments();
    } catch (err) {
      setError(err.message || 'Gmail sync failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectGmail = async () => {
    setBusy(true);
    setError('');
    try {
      await disconnectGmail(caseId);
      setGmailMessages([]);
      setSelectedGmailMessages([]);
      setGmailStatus(await fetchGmailStatus(caseId));
      setError('Gmail disconnected. USDWatch will not import future messages from that account.');
    } catch (err) {
      setError(err.message || 'Gmail disconnect failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-8 animate-fade-up">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/80">Private evidence</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">Evidence Locker</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-dim">
            Import emails, PDFs, screenshots, records, photos, and agency letters. USDWatch stores originals privately, extracts what it can, and flags anything that needs review.
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

      {error && <p className="rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-sm text-warning">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <aside className="space-y-5">
          <Panel title="Import Files" eyebrow="Evidence Locker">
            <div className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-background px-4 py-8 text-center transition-colors hover:border-accent/60">
                <FileUp className="h-7 w-7 text-accent" aria-hidden="true" />
                <span className="mt-3 text-sm font-semibold text-text">Drop files here or browse</span>
                <span className="mt-1 text-xs leading-relaxed text-text-dim">Multiple files. Up to 50 MB each. Large images may be compressed for indexing.</span>
                <input className="hidden" type="file" multiple accept={ACCEPTED} onChange={(event) => addFiles(event.target.files)} />
              </label>
              {queue.length > 0 && (
                <div className="space-y-3">
                  {queue.map((item) => <UploadQueueItem key={item.id} item={item} onRemove={removeQueueItem} />)}
                  <button disabled={busy} onClick={handleUploadQueue} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}
                    Import queued files
                  </button>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Import From Gmail" eyebrow="Beta">
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-md border border-border bg-background p-3">
                <Mail className="mt-0.5 h-5 w-5 text-accent" aria-hidden="true" />
                <p className="text-xs leading-relaxed text-text-dim">
                  Gmail import uses read-only access. USDWatch only imports messages matching the domains, addresses, or keywords you choose, and never sends, deletes, labels, or modifies email.
                </p>
              </div>
              {gmailConnection?.google_email && (
                <p className="rounded-md border border-success/30 bg-success/8 px-3 py-2 text-xs text-success">
                  Connected to {gmailConnection.google_email}
                </p>
              )}
              <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={gmailRule.domains} onChange={(event) => setGmailRule((current) => ({ ...current, domains: event.target.value }))} placeholder="Domains, e.g. usd232.org" />
              <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={gmailRule.email_addresses} onChange={(event) => setGmailRule((current) => ({ ...current, email_addresses: event.target.value }))} placeholder="Specific email addresses" />
              <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={gmailRule.keywords} onChange={(event) => setGmailRule((current) => ({ ...current, keywords: event.target.value }))} placeholder="Optional keywords, comma separated" />
              <label className="flex items-start gap-2 text-sm text-text-dim">
                <input type="checkbox" className="mt-1" checked={gmailRule.include_attachments} onChange={(event) => setGmailRule((current) => ({ ...current, include_attachments: event.target.checked }))} />
                Import attachments
              </label>
              <label className="flex items-start gap-2 text-sm text-text-dim">
                <input type="checkbox" className="mt-1" checked={gmailRule.auto_sync} onChange={(event) => setGmailRule((current) => ({ ...current, auto_sync: event.target.checked }))} />
                Enable auto-sync after OAuth is connected
              </label>
              <button disabled={busy} onClick={handleSaveGmailRule} className="w-full rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">
                Save Gmail import rule
              </button>
              <button disabled={busy || !gmailStatus?.configured} onClick={handleConnectGmail} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
                {gmailConnected ? 'Reconnect Gmail' : 'Connect Gmail'}
              </button>
              {gmailConnected && (
                <div className="space-y-3 rounded-md border border-border bg-background p-3">
                  <input className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" value={gmailQuery} onChange={(event) => setGmailQuery(event.target.value)} placeholder="Optional Gmail search override" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button disabled={busy} onClick={handleSearchGmail} className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">
                      Search messages
                    </button>
                    <button disabled={busy} onClick={handleSyncGmail} className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">
                      Sync latest
                    </button>
                  </div>
                  {gmailMessages.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs text-text-dim">
                        <span>{selectedGmailMessages.length} selected</span>
                        <button type="button" onClick={() => setSelectedGmailMessages(gmailMessages.map((item) => item.id))} className="font-semibold text-accent">Select all</button>
                      </div>
                      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {gmailMessages.map((message) => (
                          <label key={message.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-surface p-2 text-xs">
                            <input type="checkbox" className="mt-1" checked={selectedGmailMessages.includes(message.id)} onChange={() => toggleGmailMessage(message.id)} />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-text">{message.subject || '(no subject)'}</span>
                              <span className="mt-1 block truncate text-text-dim">{message.from}</span>
                              <span className="mt-1 block text-text-dim">{message.snippet}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <button disabled={busy || selectedGmailMessages.length === 0} onClick={handleImportGmail} className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                        Import selected messages
                      </button>
                    </div>
                  )}
                  <button disabled={busy} onClick={handleDisconnectGmail} className="w-full rounded-md border border-danger/40 px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60">
                    Disconnect Gmail
                  </button>
                </div>
              )}
              <p className="text-xs leading-relaxed text-text-dim">
                {gmailStatus?.configured ? 'OAuth and encrypted token storage are configured on the backend.' : gmailStatus?.message || 'Backend OAuth credentials are not configured yet, so this saves the rule but does not connect Gmail.'}
              </p>
            </div>
          </Panel>
        </aside>

        <main className="space-y-5">
          <Panel title="Find Evidence" eyebrow="Search and filter">
            <div className="grid gap-3 lg:grid-cols-[1fr_200px_160px_160px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-text-dim" aria-hidden="true" />
                <input className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-accent" value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Search filenames, tags, sources, or extracted text" />
              </label>
              <select className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
                {CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={`${filters.sort}:${filters.direction}`} onChange={(event) => {
                const [sort, direction] = event.target.value.split(':');
                setFilters((current) => ({ ...current, sort, direction }));
              }}>
                <option value="uploaded_at:desc">Newest first</option>
                <option value="uploaded_at:asc">Oldest first</option>
                <option value="name:asc">Name A-Z</option>
                <option value="size:desc">Largest first</option>
                <option value="status:asc">Status</option>
              </select>
            </div>
          </Panel>

          <Panel title="Locker Contents" eyebrow="Manage evidence" action={<SlidersHorizontal className="h-4 w-4 text-text-dim" aria-hidden="true" />}>
            {loading && <p className="text-sm text-text-dim">Loading evidence...</p>}
            {!loading && documents.length === 0 && (
              <div className="rounded-md border border-border bg-background px-4 py-10 text-center">
                <FileSearch className="mx-auto h-8 w-8 text-text-dim" aria-hidden="true" />
                <h3 className="mt-3 font-semibold text-text">No matching evidence yet</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-text-dim">Import files or adjust the filters. You can still get a first evaluation from the Case Advocate conversation.</p>
              </div>
            )}
            {!loading && documents.length > 0 && (
              <div className="divide-y divide-border">
                {documents.map((doc) => (
                  <article key={doc.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-text">{doc.filename}</h3>
                          <StatusPill status={statusOf(doc)} />
                          {doc.ocr_status && doc.ocr_status !== 'not_required' && <StatusPill status={`ocr ${doc.ocr_status}`} />}
                        </div>
                        <p className="mt-1 text-xs text-text-dim">
                          {categoryLabel(doc.inferred_category)}
                          {doc.document_date ? ` - ${doc.document_date}` : ''}
                          {doc.source_person ? ` - from ${doc.source_person}` : ''}
                        </p>
                        {!!doc.tags?.length && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {doc.tags.slice(0, 5).map((tag) => <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-dim">{categoryLabel(tag)}</span>)}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" disabled={busy} onClick={() => handlePreview(doc)} className="rounded-md border border-border p-2 text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60" title="View evidence" aria-label={`View ${doc.filename}`}>
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" disabled={busy} onClick={() => setDeleteTarget(doc)} className="rounded-md border border-border p-2 text-text-dim transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:opacity-60" title="Delete evidence" aria-label={`Delete ${doc.filename}`}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {doc.failure_reason && <p className="mt-3 rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-warning">{doc.failure_reason}</p>}
                    <dl className="mt-3 grid gap-2 text-xs text-text-dim sm:grid-cols-4">
                      <div><dt className="font-semibold text-text">Size</dt><dd>{formatBytes(doc.file_size) || 'Unknown'}</dd></div>
                      <div><dt className="font-semibold text-text">Indexed chunks</dt><dd>{doc.chunk_count || 0}</dd></div>
                      <div><dt className="font-semibold text-text">Pages</dt><dd>{doc.page_count || 'Unknown'}</dd></div>
                      <div><dt className="font-semibold text-text">Uploaded</dt><dd>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'Unknown'}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </main>
      </div>

      <DocumentPreview preview={preview} contentUrl={contentUrl} onClose={() => {
        setPreview(null);
        if (contentUrl) URL.revokeObjectURL(contentUrl);
        setContentUrl('');
      }} />

      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-2xl">
            <h3 className="text-lg font-bold">Delete this evidence?</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-dim">
              This removes <strong className="text-text">{deleteTarget.filename}</strong> from the Evidence Locker and future evaluations for this case.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text">Cancel</button>
              <button type="button" disabled={busy} onClick={handleDeleteConfirmed} className="inline-flex items-center justify-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-semibold text-background transition-colors hover:opacity-90 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                Delete evidence
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
