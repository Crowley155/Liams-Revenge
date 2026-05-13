import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  Download,
  Eye,
  FileSearch,
  FileText,
  FileUp,
  Loader2,
  Mail,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteDocument,
  disconnectGmail,
  fetchCaseAccess,
  fetchCaseDocuments,
  fetchDocumentContentBlob,
  fetchGmailStatus,
  fetchWorkspace,
  importGmailMessages,
  saveGmailImportRule,
  searchGmailMessages,
  startGmailOAuth,
  syncGmailMessages,
  uploadCaseDocument,
} from '../api/client';
import { casePermissions, caseRoleLabel } from '../utils/caseAccess';
import {
  ActionButton,
  Panel,
  StatusPill,
  formatBytes,
  formatLabel,
} from './caseShared';
import {
  ACCEPTED_EVIDENCE_FILE_TYPES,
  EVIDENCE_CATEGORY_OPTIONS,
  EVIDENCE_STATUS_OPTIONS,
  buildSmartStacks,
  documentInsightSummary,
  evidenceCategoryLabel,
  evidenceRoleLabel,
  evidenceStatusOf,
  filterDocumentsByStack,
  filterEvidenceDocuments,
  legalFlagLabel,
  maybeCompressImage,
  relevancePercent,
} from '../utils/evidence';

const NOTICE_STYLES = {
  success: 'border-success/30 bg-success/8 text-success',
  info: 'border-info/30 bg-info/8 text-info',
  warning: 'border-warning/30 bg-warning/8 text-warning',
  error: 'border-danger/30 bg-danger/10 text-danger',
};

const SORT_OPTIONS = [
  { value: 'uploaded_at:desc', label: 'Newest first' },
  { value: 'uploaded_at:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A-Z' },
  { value: 'size:desc', label: 'Largest first' },
  { value: 'status:asc', label: 'Status' },
  { value: 'relevance:desc', label: 'Most relevant' },
];

function categoryLabel(value) {
  return evidenceCategoryLabel(value, formatLabel);
}

function sortDocuments(documents, sort, direction) {
  const key = `${sort}:${direction}`;
  const copy = [...documents];
  copy.sort((a, b) => {
    if (key === 'name:asc') return (a.filename || '').localeCompare(b.filename || '');
    if (key === 'size:desc') return (b.file_size || 0) - (a.file_size || 0);
    if (key === 'status:asc') return evidenceStatusOf(a).localeCompare(evidenceStatusOf(b));
    if (key === 'relevance:desc') return (b.relevance_score || 0) - (a.relevance_score || 0);
    const aTime = new Date(a.uploaded_at || 0).getTime();
    const bTime = new Date(b.uploaded_at || 0).getTime();
    return direction === 'asc' ? aTime - bTime : bTime - aTime;
  });
  return copy;
}

function FilterMenu({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const active = options.find((option) => option.value === value) || options[0];
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === active.value));

  const focusItem = useCallback((index) => {
    requestAnimationFrame(() => {
      const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitemradio"]') || []);
      items[index]?.focus();
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const closeOnPointer = (event) => {
      if (
        !buttonRef.current?.contains(event.target)
        && !menuRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnKey);
    window.addEventListener('pointerdown', closeOnPointer);
    return () => {
      window.removeEventListener('keydown', closeOnKey);
      window.removeEventListener('pointerdown', closeOnPointer);
    };
  }, [open]);

  const handleButtonKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setOpen(true);
    focusItem(event.key === 'ArrowUp' ? options.length - 1 : activeIndex);
  };

  const handleMenuKeyDown = (event) => {
    const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitemradio"]') || []);
    const currentIndex = Math.max(0, items.indexOf(document.activeElement));
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(currentIndex + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  return (
    <div className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
        className="inline-flex min-h-11 w-full min-w-44 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:border-accent/60 hover:bg-surface"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-text-dim">{label}</span>
          <span className="block truncate">{active?.label || label}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-text-dim" aria-hidden="true" />
      </button>
      {open && (
        <div ref={menuRef} onKeyDown={handleMenuKeyDown} className="absolute right-0 z-30 mt-2 max-h-80 w-64 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-elevated" role="menu">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${option.value === value ? 'bg-accent text-background' : 'text-text hover:bg-surface-alt'}`}
              role="menuitemradio"
              aria-checked={option.value === value}
            >
              <span>{option.label}</span>
              {option.value === value && <Check className="h-4 w-4" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

function EvidenceRow({ doc, onView, onDownload, onDelete, downloading, canDelete }) {
  const insight = documentInsightSummary(doc);
  const relevance = relevancePercent(doc.relevance_score);
  const legalFlags = (doc.legal_flags || []).slice(0, 3);
  return (
    <article className="min-w-0 rounded-md border border-border bg-background/45 px-4 py-3 transition-colors hover:border-accent/40 hover:bg-surface/70">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(260px,1.25fr)_minmax(260px,1fr)_130px_260px] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <h3 className="wrap-anywhere text-sm font-bold leading-snug text-text">{doc.filename}</h3>
            <StatusPill status={evidenceStatusOf(doc)} />
            {doc.evidence_role && <span className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium leading-none text-text-dim">{evidenceRoleLabel(doc.evidence_role, formatLabel)}</span>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-text-dim">
            {categoryLabel(doc.inferred_category)}
            {doc.document_date ? ` - ${doc.document_date}` : ''}
            {doc.source_person ? ` - from ${doc.source_person}` : ''}
          </p>
          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-dim">
            <div><dt className="sr-only">Size</dt><dd>{formatBytes(doc.file_size) || 'Unknown size'}</dd></div>
            <div><dt className="sr-only">Pages</dt><dd>{doc.page_count ? `${doc.page_count} page${doc.page_count === 1 ? '' : 's'}` : 'Pages unknown'}</dd></div>
            <div><dt className="sr-only">Uploaded</dt><dd>{doc.uploaded_at ? `Uploaded ${new Date(doc.uploaded_at).toLocaleDateString()}` : 'Upload date unknown'}</dd></div>
          </dl>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-sm leading-relaxed text-text">{insight.summary}</p>
          <p className="text-xs leading-relaxed text-text-dim">{insight.relevance}</p>
          {!!legalFlags.length && (
            <div className="flex flex-wrap gap-1">
              {legalFlags.map((flag) => (
                <span key={flag} className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-text-dim">
                  {legalFlagLabel(flag, formatLabel)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-text-dim">Case connection</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-alt">
            <div className="h-full rounded-full bg-accent" style={{ width: `${relevance}%` }} />
          </div>
          <p className="mt-1 text-xs text-text-dim">{relevance ? `${relevance}%` : formatLabel(insight.status)}</p>
          {doc.relevance_basis && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-text-dim">{doc.relevance_basis}</p>}
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 xl:justify-end">
          <ActionButton onClick={() => onView(doc)} variant="primary" aria-label={`View ${doc.filename}`}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            View
          </ActionButton>
          <ActionButton disabled={downloading} onClick={() => onDownload(doc)} variant="download" aria-label={`Download ${doc.filename}`}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            Download
          </ActionButton>
          {canDelete && (
            <ActionButton onClick={() => onDelete(doc)} variant="danger" aria-label={`Delete ${doc.filename}`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </ActionButton>
          )}
        </div>
      </div>
      {doc.failure_reason && <p className="mt-3 rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-warning">{doc.failure_reason}</p>}
    </article>
  );
}

export default function EvidenceLocker() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [queue, setQueue] = useState([]);
  const [filters, setFilters] = useState({ q: '', category: '', status: '', sort: 'uploaded_at', direction: 'desc' });
  const [activeStack, setActiveStack] = useState('all');
  const [gmailStatus, setGmailStatus] = useState(null);
  const [gmailRule, setGmailRule] = useState({ domains: '', email_addresses: '', keywords: '', include_attachments: true, auto_sync: false });
  const [gmailMessages, setGmailMessages] = useState([]);
  const [gmailQuery, setGmailQuery] = useState('');
  const [selectedGmailMessages, setSelectedGmailMessages] = useState([]);
  const [workspaceSummary, setWorkspaceSummary] = useState(null);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState('');
  const [notice, setNotice] = useState(null);
  const permissions = useMemo(() => casePermissions(access), [access]);
  const canUploadEvidence = permissions.can_upload_evidence;
  const canDeleteEvidence = permissions.can_delete_evidence;
  const canManageGmail = permissions.can_manage_gmail;

  const showNotice = useCallback((type, message) => {
    setNotice(message ? { type, message } : null);
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    showNotice(null, '');
    try {
      const nextDocuments = await fetchCaseDocuments(caseId, { sort: filters.sort, direction: filters.direction });
      setDocuments(nextDocuments);
      setDocumentTotal(nextDocuments.length);
    } catch (err) {
      showNotice('error', err.message || 'Failed to load Evidence Locker');
    } finally {
      setLoading(false);
    }
  }, [caseId, filters.direction, filters.sort, showNotice]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    let cancelled = false;
    setAccessLoading(true);
    fetchCaseAccess(caseId)
      .then((nextAccess) => {
        if (!cancelled) setAccess(nextAccess);
      })
      .catch(() => {
        if (!cancelled) setAccess(null);
      })
      .finally(() => {
        if (!cancelled) setAccessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

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
    if (accessLoading) return undefined;
    if (!canManageGmail) {
      setGmailStatus(null);
      return undefined;
    }
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
  }, [accessLoading, canManageGmail, caseId]);

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

  const smartStacks = useMemo(() => buildSmartStacks(documents), [documents]);
  const visibleDocuments = useMemo(() => {
    const stacked = filterDocumentsByStack(documents, activeStack);
    const filtered = filterEvidenceDocuments(stacked, filters);
    return sortDocuments(filtered, filters.sort, filters.direction);
  }, [activeStack, documents, filters]);

  const gmailConnection = gmailStatus?.connections?.[0] || null;
  const gmailConnected = gmailConnection?.status === 'connected';
  const documentLimit = workspaceSummary?.entitlements?.max_documents_per_case;
  const hasDocumentLimit = Number.isFinite(documentLimit);
  const remainingDocuments = hasDocumentLimit ? Math.max(documentLimit - documentTotal, 0) : null;
  const availableQueueSlots = hasDocumentLimit ? Math.max(remainingDocuments - queue.length, 0) : null;
  const limitReached = hasDocumentLimit && remainingDocuments <= 0;

  const addFiles = (files) => {
    if (!canUploadEvidence) {
      showNotice('warning', 'Your access can view evidence, but cannot add files to this case.');
      return;
    }
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
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeQueueItem = (id) => {
    setQueue((current) => current.filter((item) => item.id !== id));
  };

  const handleUploadQueue = async () => {
    if (!queue.length) return;
    if (!canUploadEvidence) {
      showNotice('warning', 'Your access can view evidence, but cannot add files to this case.');
      return;
    }
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
        showNotice('success', `${uploadedDocs.length} file${uploadedDocs.length === 1 ? '' : 's'} imported. USDWatch is reading them in the background.`);
      } else if (failedCount) {
        showNotice('error', 'No files imported. Check the failed item details in the upload queue.');
      }
    } finally {
      setBusy(false);
    }
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
    if (!canDeleteEvidence) {
      setDeleteTarget(null);
      showNotice('warning', 'Your access can view evidence, but cannot delete files from this case.');
      return;
    }
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
      showNotice(run.error ? 'warning' : 'success', run.error || (status.connections?.[0]?.status === 'connected' ? 'Gmail rule saved.' : 'Gmail rule saved. Connect Gmail before messages can import.'));
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
    <div className="product-ui mx-auto max-w-7xl min-w-0 space-y-5 py-6 sm:py-8 animate-fade-up">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-accent/80">Private evidence</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">Evidence Locker</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-dim">
            Organize records, messages, photos, and agency files into one case desk. USDWatch keeps the original, extracts text where possible, and prepares plain-language notes for review.
          </p>
        </div>
        <div className="flex max-w-full flex-wrap gap-2 text-xs">
          <StatusPill status={`${counts.total} files`} />
          <StatusPill status={`${counts.indexed} ready`} />
          {counts.processing > 0 && <StatusPill status={`${counts.processing} processing`} />}
          {counts.needs_review > 0 && <StatusPill status={`${counts.needs_review} needs review`} />}
          {counts.failed > 0 && <StatusPill status={`${counts.failed} failed`} />}
        </div>
      </div>

      {notice && <p className={`rounded-md border px-3 py-2 text-sm ${NOTICE_STYLES[notice.type] || NOTICE_STYLES.info}`}>{notice.message}</p>}

      {accessLoading ? (
        <Panel title="Add evidence" eyebrow="Checking access">
          <p className="text-sm text-text-dim">Checking your evidence permissions...</p>
        </Panel>
      ) : canUploadEvidence ? (
      <Panel title="Add evidence" eyebrow="Upload or import">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
          <div className="min-w-0">
            <label className={`flex min-h-32 flex-col items-center justify-center rounded-md border border-dashed border-border bg-background/70 px-4 py-6 text-center transition-colors ${limitReached ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-accent/60 hover:bg-background'}`}>
              <FileUp className="h-7 w-7 text-accent" aria-hidden="true" />
              <span className="mt-3 text-sm font-semibold text-text">Drop files here or browse</span>
              <span className="mt-1 text-xs leading-relaxed text-text-dim">PDFs, images, Word docs, emails, and notes. Up to 50 MB each.</span>
              {hasDocumentLimit && (
                <span className="mt-2 text-xs leading-relaxed text-text-dim">
                  {documentTotal} of {documentLimit} document{documentLimit === 1 ? '' : 's'} used.
                </span>
              )}
              <input className="hidden" type="file" multiple disabled={busy || limitReached} accept={ACCEPTED_EVIDENCE_FILE_TYPES} onChange={(event) => addFiles(event.target.files)} />
            </label>
            {queue.length > 0 && (
              <div className="mt-3 space-y-3">
                {queue.map((item) => <UploadQueueItem key={item.id} item={item} onRemove={removeQueueItem} />)}
                <ActionButton disabled={busy} onClick={handleUploadQueue} variant="primary" className="w-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}
                  Import queued files
                </ActionButton>
              </div>
            )}
          </div>

          <details className="min-w-0 rounded-md border border-border bg-background/55">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-text">
              <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4 text-accent" aria-hidden="true" /> Import from Gmail</span>
              <span className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-dim">Beta</span>
            </summary>
            <div className="space-y-3 border-t border-border p-4">
              {gmailConnection?.google_email && <p className="rounded-md border border-success/30 bg-success/8 px-3 py-2 text-xs text-success">Connected to {gmailConnection.google_email}</p>}
              <div className="grid gap-2 sm:grid-cols-3">
                <input aria-label="Gmail domains" className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45" value={gmailRule.domains} onChange={(event) => setGmailRule((current) => ({ ...current, domains: event.target.value }))} placeholder="Domains" />
                <input aria-label="Gmail addresses" className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45" value={gmailRule.email_addresses} onChange={(event) => setGmailRule((current) => ({ ...current, email_addresses: event.target.value }))} placeholder="Addresses" />
                <input aria-label="Gmail keywords" className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45" value={gmailRule.keywords} onChange={(event) => setGmailRule((current) => ({ ...current, keywords: event.target.value }))} placeholder="Keywords" />
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-text-dim">
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" className="h-4 w-4" checked={gmailRule.include_attachments} onChange={(event) => setGmailRule((current) => ({ ...current, include_attachments: event.target.checked }))} />
                  Import attachments
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" className="h-4 w-4" checked={gmailRule.auto_sync} onChange={(event) => setGmailRule((current) => ({ ...current, auto_sync: event.target.checked }))} />
                  Auto-sync
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={handleSaveGmailRule} className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">Save rule</button>
                <button disabled={busy || !gmailStatus?.configured} onClick={handleConnectGmail} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
                  {gmailConnected ? 'Reconnect Gmail' : 'Connect Gmail'}
                </button>
                {gmailConnected && <button disabled={busy} onClick={handleDisconnectGmail} className="min-h-11 rounded-md border border-danger/40 px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60">Disconnect</button>}
              </div>
              {gmailConnected && (
                <div className="space-y-3 rounded-md border border-border bg-surface p-3">
                  <input aria-label="Gmail search" className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45" value={gmailQuery} onChange={(event) => setGmailQuery(event.target.value)} placeholder="Optional Gmail search override" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button disabled={busy} onClick={handleSearchGmail} className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">Search messages</button>
                    <button disabled={busy} onClick={handleSyncGmail} className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">Sync latest</button>
                  </div>
                  {gmailMessages.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs text-text-dim">
                        <span>{selectedGmailMessages.length} selected</span>
                        <button type="button" onClick={() => setSelectedGmailMessages(gmailMessages.map((item) => item.id))} className="font-semibold text-accent">Select all</button>
                      </div>
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                        {gmailMessages.map((message) => (
                          <label key={message.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background p-2 text-xs">
                            <input type="checkbox" className="mt-1" checked={selectedGmailMessages.includes(message.id)} onChange={() => toggleGmailMessage(message.id)} />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-text">{message.subject || '(no subject)'}</span>
                              <span className="mt-1 block truncate text-text-dim">{message.from}</span>
                              <span className="mt-1 block text-text-dim">{message.snippet}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <button disabled={busy || selectedGmailMessages.length === 0} onClick={handleImportGmail} className="min-h-11 w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">Import selected messages</button>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs leading-relaxed text-text-dim">{gmailStatus?.configured ? 'OAuth and encrypted token storage are configured on the backend.' : gmailStatus?.message || 'Backend OAuth credentials are not configured yet, so this saves the rule but does not connect Gmail.'}</p>
            </div>
          </details>
        </div>
      </Panel>
      ) : (
        <Panel title="Evidence access" eyebrow={caseRoleLabel(access?.role)}>
          <p className="text-sm leading-relaxed text-text-dim">
            You can review and download evidence in this shared case. Adding or deleting files requires editor access from the case owner; Gmail import stays owner-only.
          </p>
        </Panel>
      )}

      <Panel title="Evidence ledger" eyebrow="Find and review">
        <div className="space-y-4">
          <div className="flex min-w-0 flex-wrap gap-2">
            {smartStacks.map((stack) => (
              <button
                type="button"
                key={stack.key}
                onClick={() => setActiveStack(stack.key)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${activeStack === stack.key ? 'border-accent bg-accent text-background' : 'border-border text-text-dim hover:bg-surface-alt hover:text-text'}`}
              >
                {stack.label}
                <span className={`rounded-md px-2 py-0.5 text-xs ${activeStack === stack.key ? 'bg-background/20' : 'bg-surface-alt text-text-dim'}`}>{stack.count}</span>
              </button>
            ))}
          </div>

          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <label className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-text-dim" aria-hidden="true" />
              <input className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent" value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Search filenames, people, summaries, or tags" aria-label="Search evidence" />
              {filters.q && (
                <button type="button" onClick={() => setFilters((current) => ({ ...current, q: '' }))} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md text-text-dim hover:bg-surface-alt hover:text-text" aria-label="Clear search">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </label>
            <FilterMenu label="Category" value={filters.category} options={EVIDENCE_CATEGORY_OPTIONS} onChange={(value) => setFilters((current) => ({ ...current, category: value }))} />
            <FilterMenu label="Status" value={filters.status} options={EVIDENCE_STATUS_OPTIONS} onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
            <FilterMenu label="Sort" value={`${filters.sort}:${filters.direction}`} options={SORT_OPTIONS} onChange={(value) => {
              const [sort, direction] = value.split(':');
              setFilters((current) => ({ ...current, sort, direction }));
            }} />
          </div>

          {loading && <p className="text-sm text-text-dim">Loading evidence...</p>}
          {!loading && visibleDocuments.length === 0 && (
            <div className="rounded-md border border-border bg-background px-4 py-10 text-center">
              <FileSearch className="mx-auto h-8 w-8 text-text-dim" aria-hidden="true" />
              <h3 className="mt-3 font-semibold text-text">No matching evidence</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-text-dim">Adjust filters, choose a different smart stack, or add the strongest document you have.</p>
            </div>
          )}
          {!loading && visibleDocuments.length > 0 && (
            <div className="min-w-0 space-y-2">
              {visibleDocuments.map((doc) => (
                <EvidenceRow
                  key={doc.id}
                  doc={doc}
                  downloading={downloadingDocId === doc.id}
                  canDelete={canDeleteEvidence}
                  onView={(target) => navigate(`/cases/${caseId}/locker/${target.id}`)}
                  onDownload={handleDownload}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </div>
      </Panel>

      <DeleteEvidenceDialog doc={deleteTarget} busy={busy} onCancel={() => setDeleteTarget(null)} onConfirm={handleDeleteConfirmed} />
    </div>
  );
}
