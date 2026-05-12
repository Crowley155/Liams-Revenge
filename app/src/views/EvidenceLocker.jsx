import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Eye, FileSearch, FileText, FileUp, Loader2, Mail, PanelRightClose, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  deleteDocument,
  disconnectGmail,
  fetchCaseDocuments,
  fetchDocumentContentBlob,
  fetchDocumentPreview,
  fetchGmailStatus,
  fetchWorkspace,
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
import {
  ACCEPTED_EVIDENCE_FILE_TYPES,
  EVIDENCE_CATEGORY_OPTIONS,
  EVIDENCE_STATUS_OPTIONS,
  evidenceCategoryLabel,
  evidenceStatusHelp,
  evidenceStatusOf,
  maybeCompressImage,
} from '../utils/evidence';
import { canPreviewOriginal, documentDisplayKind } from '../utils/documentPreview';

function categoryLabel(value) {
  return evidenceCategoryLabel(value, formatLabel);
}

const NOTICE_STYLES = {
  success: 'border-success/30 bg-success/8 text-success',
  info: 'border-info/30 bg-info/8 text-info',
  warning: 'border-warning/30 bg-warning/8 text-warning',
  error: 'border-danger/30 bg-danger/10 text-danger',
};

function UploadQueueItem({ item, onRemove }) {
  return (
    <article className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-border bg-background/70 p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="wrap-anywhere text-sm font-semibold text-text">{item.file.name}</h4>
          <StatusPill status={item.status} />
          {item.compressed && <StatusPill status="compressed" />}
        </div>
        <p className="mt-1 text-xs text-text-dim">{formatBytes(item.file.size)}</p>
        {item.failureReason && <p className="mt-2 text-xs text-danger">{item.failureReason}</p>}
      </div>
      <button type="button" onClick={() => onRemove(item.id)} className="grid min-h-11 min-w-11 place-items-center rounded-md text-text-dim transition-colors hover:bg-danger/10 hover:text-danger" title="Remove from queue" aria-label={`Remove ${item.file.name}`}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </article>
  );
}

function DocumentInspector({ state, contentUrl, onClose, onDownload, onRetry, downloading }) {
  const doc = state.preview?.document || state.doc;
  if (!doc) return null;

  const kind = documentDisplayKind(doc);
  const isImage = kind === 'image';
  const isPdf = kind === 'pdf';
  const status = state.status || 'idle';
  const hasOriginal = Boolean(state.preview?.has_original);

  return (
    <aside className="min-w-0 rounded-md border border-border bg-surface/80 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto" aria-label="Evidence inspector">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-accent/80">Evidence inspector</p>
          <h3 className="wrap-anywhere mt-1 text-lg font-bold leading-tight">{doc.filename}</h3>
          <p className="mt-1 text-xs text-text-dim">
            {categoryLabel(doc.inferred_category || doc.evidence_type || kind)} - {formatBytes(doc.file_size) || 'Unknown size'} - {formatLabel(evidenceStatusOf(doc))}
          </p>
        </div>
        <button type="button" onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-md text-text-dim transition-colors hover:bg-surface-alt hover:text-text" title="Close inspector" aria-label="Close evidence inspector">
          <PanelRightClose className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {status === 'loading' && (
          <div className="flex min-h-40 items-center justify-center gap-2 rounded-md border border-border bg-background text-sm text-text-dim">
            <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
            Loading evidence preview...
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            <p className="font-semibold">Preview did not load.</p>
            <p className="mt-1 leading-relaxed">{state.error || 'Try again or download the original file.'}</p>
            <button type="button" onClick={() => onRetry(doc)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-danger/40 px-3 py-2 text-sm font-semibold transition-colors hover:bg-danger/10">
              <Eye className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        )}

        {status !== 'error' && (
          <div className="overflow-hidden rounded-md border border-border bg-background">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                <FileText className="h-4 w-4 text-accent" aria-hidden="true" />
                Original
              </div>
              <StatusPill status={kind} />
            </div>
            {contentUrl && isImage && <img src={contentUrl} alt={doc.filename} className="max-h-[520px] w-full object-contain" />}
            {contentUrl && isPdf && <iframe title={doc.filename} src={contentUrl} className="h-[520px] w-full" />}
            {!contentUrl && status !== 'loading' && (
              <div className="grid min-h-44 place-items-center p-5 text-center text-sm text-text-dim">
                <div>
                  <FileSearch className="mx-auto h-7 w-7 text-text-dim" aria-hidden="true" />
                  <p className="mt-3 leading-relaxed">
                    {hasOriginal
                      ? 'This original cannot be displayed inline. Download it or review the extracted text below.'
                      : 'The original file is not available, but extracted text and metadata are shown below.'}
                  </p>
                  {state.contentError && <p className="mt-2 text-xs text-warning">{state.contentError}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2 text-xs text-text-dim sm:grid-cols-2">
          <div className="rounded-md border border-border bg-background p-3">
            <dt className="font-semibold text-text">Uploaded</dt>
            <dd className="mt-1">{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : 'Unknown'}</dd>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <dt className="font-semibold text-text">Pages / chunks</dt>
            <dd className="mt-1">{doc.page_count || 'Unknown'} / {doc.chunk_count || 0}</dd>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <dt className="font-semibold text-text">Source</dt>
            <dd className="wrap-anywhere mt-1">{doc.source_person || doc.source || 'Manual upload'}</dd>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <dt className="font-semibold text-text">Date</dt>
            <dd className="mt-1">{doc.document_date || 'Not set'}</dd>
          </div>
        </div>

        <div className="rounded-md border border-border bg-background p-3">
          <h4 className="text-sm font-semibold">Extracted text</h4>
          <pre className="mt-3 max-h-[360px] whitespace-pre-wrap text-xs leading-relaxed text-text-dim">{state.preview?.text_preview || doc.extracted_text || 'No text extracted yet.'}</pre>
        </div>

        {doc.failure_reason && <p className="rounded-md border border-warning/30 bg-warning/8 p-3 text-xs leading-relaxed text-warning">{doc.failure_reason}</p>}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => onDownload(doc)} disabled={downloading} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            Download original
          </button>
        </div>
      </div>
    </aside>
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
  const [workspaceSummary, setWorkspaceSummary] = useState(null);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [inspector, setInspector] = useState({ status: 'idle', doc: null, preview: null, error: '', contentError: '' });
  const [contentUrl, setContentUrl] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewingDocId, setPreviewingDocId] = useState('');
  const [downloadingDocId, setDownloadingDocId] = useState('');
  const [notice, setNotice] = useState(null);

  const showNotice = useCallback((type, message) => {
    setNotice(message ? { type, message } : null);
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    showNotice(null, '');
    try {
      const hasFilters = Object.values(filters).some((value) => value !== undefined && value !== null && value !== '' && value !== 'uploaded_at' && value !== 'desc');
      const nextDocuments = await fetchCaseDocuments(caseId, filters);
      setDocuments(nextDocuments);
      if (hasFilters) {
        const allDocuments = await fetchCaseDocuments(caseId);
        setDocumentTotal(allDocuments.length);
      } else {
        setDocumentTotal(nextDocuments.length);
      }
    } catch (err) {
      showNotice('error', err.message || 'Failed to load Evidence Locker');
    } finally {
      setLoading(false);
    }
  }, [caseId, filters, showNotice]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    let cancelled = false;
    fetchWorkspace()
      .then((summary) => {
        if (!cancelled) setWorkspaceSummary(summary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    if (!deleteTarget) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setDeleteTarget(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteTarget]);

  const counts = useMemo(() => {
    const next = { total: documents.length, indexed: 0, processing: 0, needs_review: 0, failed: 0 };
    for (const doc of documents) {
      const status = evidenceStatusOf(doc);
      if (status === 'indexed') next.indexed += 1;
      else if (status === 'needs_review') next.needs_review += 1;
      else if (status === 'failed') next.failed += 1;
      else next.processing += 1;
    }
    return next;
  }, [documents]);
  const gmailConnection = gmailStatus?.connections?.[0] || null;
  const gmailConnected = gmailConnection?.status === 'connected';
  const documentLimit = workspaceSummary?.entitlements?.max_documents_per_case;
  const hasDocumentLimit = Number.isFinite(documentLimit);
  const remainingDocuments = hasDocumentLimit ? Math.max(documentLimit - documentTotal, 0) : null;
  const availableQueueSlots = hasDocumentLimit ? Math.max(remainingDocuments - queue.length, 0) : null;
  const limitReached = hasDocumentLimit && remainingDocuments <= 0;

  const addFiles = (files) => {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;
    if (limitReached || availableQueueSlots === 0) {
      showNotice('warning', `Your current plan includes ${documentLimit} documents in this case. Remove a file or upgrade before adding more evidence.`);
      return;
    }
    const accepted = hasDocumentLimit ? incoming.slice(0, availableQueueSlots) : incoming;
    if (accepted.length < incoming.length) {
      showNotice('warning', `You can add ${accepted.length} more file${accepted.length === 1 ? '' : 's'} before reaching your current document limit.`);
    }
    const next = accepted.map((file) => ({
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
    if (limitReached) {
      showNotice('warning', `Your current plan includes ${documentLimit} documents in this case. Remove a file or upgrade before adding more evidence.`);
      return;
    }
    setBusy(true);
    showNotice(null, '');
    const uploadedDocs = [];
    let failedCount = 0;
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
          failedCount += 1;
          updateQueueItem(item.id, { status: 'failed', failureReason: uploadError.message });
        }
      }
      if (uploadedDocs.length) {
        setDocuments((current) => [...uploadedDocs, ...current]);
        setDocumentTotal((current) => current + uploadedDocs.length);
        showNotice('success', `${uploadedDocs.length} file${uploadedDocs.length === 1 ? '' : 's'} imported. USDWatch is indexing them in the background.`);
      } else if (failedCount) {
        showNotice('error', 'No files imported. Check the failed item details in the upload queue.');
      }
    } finally {
      setBusy(false);
    }
  };

  const revokeContentUrl = useCallback(() => {
    setContentUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
  }, []);

  const handlePreview = async (doc) => {
    setPreviewingDocId(doc.id);
    showNotice(null, '');
    revokeContentUrl();
    setInspector({ status: 'loading', doc, preview: null, error: '', contentError: '' });
    try {
      const nextPreview = await fetchDocumentPreview(doc.id);
      let nextContentUrl = '';
      let contentError = '';
      const previewDoc = nextPreview.document || doc;
      if (nextPreview.has_original && canPreviewOriginal(previewDoc)) {
        try {
          const blob = await fetchDocumentContentBlob(doc.id);
          nextContentUrl = URL.createObjectURL(blob);
        } catch (contentErr) {
          contentError = contentErr.message || 'Original file could not be loaded inline.';
        }
      }
      setContentUrl(nextContentUrl);
      setInspector({ status: 'ready', doc: previewDoc, preview: nextPreview, error: '', contentError });
    } catch (err) {
      setInspector({ status: 'error', doc, preview: null, error: err.message || 'Preview failed', contentError: '' });
    } finally {
      setPreviewingDocId('');
    }
  };

  const closeInspector = () => {
    revokeContentUrl();
    setInspector({ status: 'idle', doc: null, preview: null, error: '', contentError: '' });
  };

  const handleDownload = async (doc) => {
    setDownloadingDocId(doc.id);
    showNotice(null, '');
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
    } catch (err) {
      showNotice('error', err.message || 'Download failed');
    } finally {
      setDownloadingDocId('');
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    showNotice(null, '');
    try {
      await deleteDocument(deleteTarget.id);
      setDocuments((current) => current.filter((doc) => doc.id !== deleteTarget.id));
      setDocumentTotal((current) => Math.max(current - 1, 0));
      setDeleteTarget(null);
      showNotice('success', `${deleteTarget.filename} was removed from the Evidence Locker.`);
    } catch (err) {
      showNotice('error', err.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveGmailRule = async () => {
    setBusy(true);
    showNotice(null, '');
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
      if (run.error) {
        showNotice('warning', run.error);
      } else {
        showNotice('success', status.connections?.[0]?.status === 'connected' ? 'Gmail rule saved.' : 'Gmail rule saved. Connect Gmail before messages can import.');
      }
    } catch (err) {
      showNotice('error', err.message || 'Gmail rule failed');
    } finally {
      setBusy(false);
    }
  };

  const handleConnectGmail = async () => {
    setBusy(true);
    showNotice(null, '');
    try {
      const result = await startGmailOAuth(caseId);
      window.location.href = result.authorization_url;
    } catch (err) {
      showNotice('error', err.message || 'Gmail connection failed');
      setBusy(false);
    }
  };

  const handleSearchGmail = async () => {
    setBusy(true);
    showNotice(null, '');
    try {
      const result = await searchGmailMessages({
        case_id: caseId,
        connection_id: gmailConnection?.id || '',
        query: gmailQuery,
        max_results: 25,
      });
      setGmailMessages(result.messages || []);
      setSelectedGmailMessages((result.messages || []).map((item) => item.id));
      showNotice('info', `Found ${result.messages?.length || 0} matching Gmail message${result.messages?.length === 1 ? '' : 's'}.`);
    } catch (err) {
      showNotice('error', err.message || 'Gmail search failed');
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
    showNotice(null, '');
    try {
      const run = await importGmailMessages({
        case_id: caseId,
        connection_id: gmailConnection?.id || '',
        message_ids: selectedGmailMessages,
        query: gmailQuery,
        max_results: 25,
      });
      await loadDocuments();
      showNotice('success', `Imported ${run.imported_messages} message${run.imported_messages === 1 ? '' : 's'} and ${run.imported_attachments} attachment${run.imported_attachments === 1 ? '' : 's'}.`);
    } catch (err) {
      showNotice('error', err.message || 'Gmail import failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncGmail = async () => {
    setBusy(true);
    showNotice(null, '');
    try {
      const run = await syncGmailMessages({
        case_id: caseId,
        connection_id: gmailConnection?.id || '',
        max_results: 25,
      });
      await loadDocuments();
      showNotice('success', `Sync imported ${run.imported_messages} message${run.imported_messages === 1 ? '' : 's'} and ${run.imported_attachments} attachment${run.imported_attachments === 1 ? '' : 's'}.`);
    } catch (err) {
      showNotice('error', err.message || 'Gmail sync failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectGmail = async () => {
    setBusy(true);
    showNotice(null, '');
    try {
      await disconnectGmail(caseId);
      setGmailMessages([]);
      setSelectedGmailMessages([]);
      setGmailStatus(await fetchGmailStatus(caseId));
      showNotice('success', 'Gmail disconnected. USDWatch will not import future messages from that account.');
    } catch (err) {
      showNotice('error', err.message || 'Gmail disconnect failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="product-ui mx-auto max-w-7xl min-w-0 space-y-6 py-6 sm:py-8 animate-fade-up">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-accent/80">Private evidence</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">Evidence Locker</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-dim">
            Import emails, PDFs, screenshots, records, photos, and agency letters. USDWatch stores originals privately, extracts what it can, and flags anything that needs review.
          </p>
        </div>
        <div className="flex max-w-full flex-wrap gap-2 text-xs">
          <StatusPill status={`${counts.total} files`} />
          <StatusPill status={`${counts.indexed} indexed`} />
          {counts.processing > 0 && <StatusPill status={`${counts.processing} processing`} />}
          {counts.needs_review > 0 && <StatusPill status={`${counts.needs_review} needs review`} />}
          {counts.failed > 0 && <StatusPill status={`${counts.failed} failed`} />}
        </div>
      </div>

      {notice && <p role="status" aria-live="polite" className={`rounded-md border px-3 py-2 text-sm ${NOTICE_STYLES[notice.type] || NOTICE_STYLES.info}`}>{notice.message}</p>}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <Panel title="Import Files" eyebrow="Evidence Locker">
            <div className="space-y-4">
              <label className={`flex min-h-44 flex-col items-center justify-center rounded-md border border-dashed border-border bg-background/70 px-4 py-8 text-center transition-colors ${limitReached ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-accent/60 hover:bg-background'}`}>
                <FileUp className="h-7 w-7 text-accent" aria-hidden="true" />
                <span className="mt-3 text-sm font-semibold text-text">Drop files here or browse</span>
                <span className="mt-1 text-xs leading-relaxed text-text-dim">Multiple files. Up to 50 MB each. Large images may be compressed for indexing.</span>
                {hasDocumentLimit && (
                  <span className="mt-2 text-xs leading-relaxed text-text-dim">
                    {documentTotal} of {documentLimit} document{documentLimit === 1 ? '' : 's'} used on your current plan.
                  </span>
                )}
                <input className="hidden" type="file" multiple disabled={busy || limitReached} accept={ACCEPTED_EVIDENCE_FILE_TYPES} onChange={(event) => addFiles(event.target.files)} />
              </label>
              {queue.length > 0 && (
                <div className="space-y-3">
                  {queue.map((item) => <UploadQueueItem key={item.id} item={item} onRemove={removeQueueItem} />)}
                  <button disabled={busy} onClick={handleUploadQueue} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}
                    Import queued files
                  </button>
                </div>
              )}
            </div>
          </Panel>

          <details className="min-w-0 rounded-md border border-border bg-surface/70">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-text">
              <span>Import from Gmail</span>
              <span className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-dim">Beta</span>
            </summary>
            <div className="space-y-3 border-t border-border p-4">
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
              <input className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-accent" value={gmailRule.domains} onChange={(event) => setGmailRule((current) => ({ ...current, domains: event.target.value }))} placeholder="Domains, e.g. usd232.org" />
              <input className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-accent" value={gmailRule.email_addresses} onChange={(event) => setGmailRule((current) => ({ ...current, email_addresses: event.target.value }))} placeholder="Specific email addresses" />
              <input className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-accent" value={gmailRule.keywords} onChange={(event) => setGmailRule((current) => ({ ...current, keywords: event.target.value }))} placeholder="Optional keywords, comma separated" />
              <label className="flex min-h-11 items-start gap-3 text-sm text-text-dim">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={gmailRule.include_attachments} onChange={(event) => setGmailRule((current) => ({ ...current, include_attachments: event.target.checked }))} />
                Import attachments
              </label>
              <label className="flex min-h-11 items-start gap-3 text-sm text-text-dim">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={gmailRule.auto_sync} onChange={(event) => setGmailRule((current) => ({ ...current, auto_sync: event.target.checked }))} />
                Enable auto-sync after OAuth is connected
              </label>
              <button disabled={busy} onClick={handleSaveGmailRule} className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">
                Save Gmail import rule
              </button>
              <button disabled={busy || !gmailStatus?.configured} onClick={handleConnectGmail} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
                {gmailConnected ? 'Reconnect Gmail' : 'Connect Gmail'}
              </button>
              {gmailConnected && (
                <div className="space-y-3 rounded-md border border-border bg-background p-3">
                  <input className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" value={gmailQuery} onChange={(event) => setGmailQuery(event.target.value)} placeholder="Optional Gmail search override" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button disabled={busy} onClick={handleSearchGmail} className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">
                      Search messages
                    </button>
                    <button disabled={busy} onClick={handleSyncGmail} className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">
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
                      <button disabled={busy || selectedGmailMessages.length === 0} onClick={handleImportGmail} className="min-h-11 w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                        Import selected messages
                      </button>
                    </div>
                  )}
                  <button disabled={busy} onClick={handleDisconnectGmail} className="min-h-11 w-full rounded-md border border-danger/40 px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60">
                    Disconnect Gmail
                  </button>
                </div>
              )}
              <p className="text-xs leading-relaxed text-text-dim">
                {gmailStatus?.configured ? 'OAuth and encrypted token storage are configured on the backend.' : gmailStatus?.message || 'Backend OAuth credentials are not configured yet, so this saves the rule but does not connect Gmail.'}
              </p>
            </div>
          </details>
        </aside>

        <main className="min-w-0">
          <div className={`grid min-w-0 gap-4 ${inspector.doc ? '2xl:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]' : ''}`}>
            <div className="min-w-0 space-y-4">
          <Panel title="Find Evidence" eyebrow="Search and filter">
            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_200px_160px_160px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-text-dim" aria-hidden="true" />
                <input className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent" value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Search filenames, tags, sources, or extracted text" />
              </label>
              <select className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-accent" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
                {EVIDENCE_CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-accent" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                {EVIDENCE_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-accent" value={`${filters.sort}:${filters.direction}`} onChange={(event) => {
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
                <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-text-dim">Import files or adjust the filters. You can still get a first Case Read from the Case Advocate conversation.</p>
              </div>
            )}
            {!loading && documents.length > 0 && (
              <div className="min-w-0 space-y-3">
                {documents.map((doc) => (
                  <article key={doc.id} className={`min-w-0 rounded-md border p-3 transition-colors ${inspector.doc?.id === doc.id ? 'border-accent/60 bg-surface-alt/60' : 'border-border bg-background/45'}`}>
                    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="wrap-anywhere text-sm font-semibold leading-snug text-text">{doc.filename}</h3>
                          <StatusPill status={evidenceStatusOf(doc)} />
                          {doc.ocr_status && doc.ocr_status !== 'not_required' && <StatusPill status={`ocr ${doc.ocr_status}`} />}
                        </div>
                        <p className="mt-1 text-xs text-text-dim">
                          {categoryLabel(doc.inferred_category)}
                          {doc.document_date ? ` - ${doc.document_date}` : ''}
                          {doc.source_person ? ` - from ${doc.source_person}` : ''}
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-text-dim">{evidenceStatusHelp(evidenceStatusOf(doc))}</p>
                        {!!doc.tags?.length && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {doc.tags.slice(0, 5).map((tag) => <span key={tag} className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-dim">{categoryLabel(tag)}</span>)}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                        <button type="button" disabled={previewingDocId === doc.id} onClick={() => handlePreview(doc)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60" title="View evidence" aria-label={`View ${doc.filename}`}>
                          {previewingDocId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                          View
                        </button>
                        <button type="button" disabled={downloadingDocId === doc.id} onClick={() => handleDownload(doc)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60" title="Download evidence" aria-label={`Download ${doc.filename}`}>
                          {downloadingDocId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                          Download
                        </button>
                        <button type="button" disabled={busy} onClick={() => setDeleteTarget(doc)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:opacity-60" title="Delete evidence" aria-label={`Delete ${doc.filename}`}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    </div>
                    {doc.failure_reason && <p className="mt-3 rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-warning">{doc.failure_reason}</p>}
                    <dl className="mt-3 grid min-w-0 gap-2 text-xs text-text-dim sm:grid-cols-4">
                      <div className="min-w-0"><dt className="font-semibold text-text">Size</dt><dd>{formatBytes(doc.file_size) || 'Unknown'}</dd></div>
                      <div className="min-w-0"><dt className="font-semibold text-text">Indexed chunks</dt><dd>{doc.chunk_count || 0}</dd></div>
                      <div className="min-w-0"><dt className="font-semibold text-text">Pages</dt><dd>{doc.page_count || 'Unknown'}</dd></div>
                      <div className="min-w-0"><dt className="font-semibold text-text">Uploaded</dt><dd>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'Unknown'}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </Panel>
            </div>
            {inspector.doc && (
              <DocumentInspector
                state={inspector}
                contentUrl={contentUrl}
                onClose={closeInspector}
                onDownload={handleDownload}
                onRetry={handlePreview}
                downloading={downloadingDocId === inspector.doc.id}
              />
            )}
          </div>
        </main>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-background/85 p-4">
          <section className="w-full max-w-md rounded-md border border-border bg-surface p-5 shadow-2xl">
            <h3 className="text-lg font-bold">Delete this evidence?</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-dim">
              This removes <strong className="text-text">{deleteTarget.filename}</strong> from the Evidence Locker and future Case Reads for this case.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setDeleteTarget(null)} autoFocus className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text">Cancel</button>
              <button type="button" disabled={busy} onClick={handleDeleteConfirmed} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-semibold text-background transition-colors hover:opacity-90 disabled:opacity-60">
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
