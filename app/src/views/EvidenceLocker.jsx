import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  Download,
  Eye,
  FileSearch,
  FileText,
  FileUp,
  Info,
  Loader2,
  Mail,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteDocument,
  deleteGmailImportRule,
  connectGmail,
  disconnectGmail,
  fetchCaseAccess,
  fetchCaseDocuments,
  fetchDocumentContentBlob,
  fetchGmailStatus,
  fetchWorkspace,
  importGmailMessages,
  saveGmailImportRule,
  searchCaseDocuments,
  searchGmailMessages,
  uploadCaseDocument,
} from '../api/client';
import { clerkEnabled } from '../auth/AuthContext';
import { GMAIL_READONLY_SCOPE } from '../auth/gmailAccess';
import { casePermissions, caseRoleLabel } from '../utils/caseAccess';
import {
  formatGmailRuleSummary,
  gmailRelevanceLabel,
  gmailRuleHasCriteria,
  normalizeGmailRule,
  removeGmailRuleValue,
  shouldAutoSelectGmailMessage,
} from '../utils/gmailImport';
import {
  ActionButton,
  Panel,
  StatusPill,
  actionButtonClasses,
  formatBytes,
  formatLabel,
} from './caseShared';
import {
  ACCEPTED_EVIDENCE_FILE_TYPES,
  EVIDENCE_CATEGORY_OPTIONS,
  EVIDENCE_STATUS_OPTIONS,
  buildSmartStacks,
  documentCategoryLabel,
  documentCategoryOf,
  documentInsightSummary,
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

function optionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || formatLabel(value);
}

function withCounts(options, documents, getValue) {
  return options.map((option) => {
    const count = option.value
      ? documents.filter((doc) => getValue(doc) === option.value || (doc.tags || []).includes(option.value)).length
      : documents.length;
    return { ...option, count };
  });
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
              <span className="min-w-0 truncate">{option.label}</span>
              {Number.isFinite(option.count) && (
                <span className={`ml-auto rounded-md px-2 py-0.5 text-xs ${option.value === value ? 'bg-background/20 text-background' : 'bg-background text-text-dim'}`}>
                  {option.count}
                </span>
              )}
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

function EvidenceRow({ doc, viewHref, onDownload, onDelete, downloading, canDelete }) {
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
            {documentCategoryLabel(doc, formatLabel)}
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
          <a
            href={viewHref}
            target="_blank"
            rel="noopener noreferrer"
            className={actionButtonClasses('primary')}
            aria-label={`View ${doc.filename} in a new tab`}
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            View
          </a>
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

function ClerkGmailAccessButton({ busy, connected, disabled, onStarted, onError }) {
  const { user, isLoaded } = useUser();

  const handleGrant = async () => {
    if (!user) {
      onError?.('Sign in before granting Gmail access.');
      return;
    }
    try {
      const returnUrl = window.location.href;
      window.sessionStorage?.setItem('usdwatch:gmail-return-url', returnUrl);
      const redirectUrl = `${window.location.origin}/sso-callback?redirect_url=${encodeURIComponent(returnUrl)}`;
      const googleAccount = (user.externalAccounts || []).find((account) => {
        const provider = account.providerSlug?.() || account.provider || '';
        return provider === 'google' || provider === 'oauth_google';
      });
      const result = googleAccount
        ? await googleAccount.reauthorize({
          redirectUrl,
          additionalScopes: [GMAIL_READONLY_SCOPE],
          oidcPrompt: 'consent',
        })
        : await user.createExternalAccount({
          strategy: 'oauth_google',
          redirectUrl,
          additionalScopes: [GMAIL_READONLY_SCOPE],
          oidcPrompt: 'consent',
        });
      const nextUrl = result?.verification?.externalVerificationRedirectURL?.href;
      if (nextUrl) {
        onStarted?.();
        window.location.assign(nextUrl);
        return;
      }
      onStarted?.('Gmail access was started. Refresh status after Google confirms access.');
    } catch (err) {
      onError?.(err.message || 'Could not start Google authorization.');
    }
  };

  return (
    <button
      disabled={busy || disabled || !isLoaded}
      onClick={handleGrant}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
      {connected ? 'Re-authorize Gmail' : 'Grant Gmail access'}
    </button>
  );
}

function GmailField({ id, label, help, value, onChange, placeholder }) {
  const helpId = `${id}-help`;
  return (
    <label className="min-w-0 space-y-1.5" htmlFor={id}>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-text-dim">
        {label}
        <span className="group relative inline-flex" tabIndex={0} aria-describedby={helpId}>
          <Info className="h-3.5 w-3.5 text-text-dim" aria-hidden="true" />
          <span
            id={helpId}
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-6 z-20 w-64 -translate-x-1/2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-normal leading-relaxed text-text opacity-0 shadow-elevated transition-opacity group-hover:opacity-100 group-focus:opacity-100"
          >
            {help}
          </span>
        </span>
      </span>
      <input
        id={id}
        className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </label>
  );
}

function GmailRuleChip({ label, value, disabled, onRemove }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-text-dim">
      <span className="truncate">{label}: <strong className="font-semibold text-text">{value}</strong></span>
      {onRemove && (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-text-dim transition-colors hover:bg-surface-alt hover:text-danger disabled:opacity-50"
          aria-label={`Remove ${label} ${value} from Gmail rule`}
          title={`Remove ${value}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

function SavedGmailRule({ connection, disabled, onRemoveValue, onClear }) {
  const rule = normalizeGmailRule(connection?.rule || {});
  const hasRule = Boolean(connection?.has_rule || gmailRuleHasCriteria(rule));
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold text-text">Saved Gmail search rule</p>
          <p className="mt-1 text-xs leading-relaxed text-text-dim">{formatGmailRuleSummary(rule)}</p>
        </div>
        {hasRule && (
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-danger/40 px-2.5 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Clear rule
          </button>
        )}
      </div>
      {hasRule ? (
        <div className="mt-3 flex min-w-0 flex-wrap gap-2">
          {rule.domains.map((value) => (
            <GmailRuleChip key={`domain:${value}`} label="Domain" value={value} disabled={disabled} onRemove={() => onRemoveValue('domains', value)} />
          ))}
          {rule.email_addresses.map((value) => (
            <GmailRuleChip key={`email:${value}`} label="Email" value={value} disabled={disabled} onRemove={() => onRemoveValue('email_addresses', value)} />
          ))}
          {rule.keywords.map((value) => (
            <GmailRuleChip key={`keyword:${value}`} label="Keyword" value={value} disabled={disabled} onRemove={() => onRemoveValue('keywords', value)} />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed text-text-dim">
          Add a school domain, a person&apos;s email, or case-specific keywords. Saved values will appear here so you can remove them later.
        </p>
      )}
      {connection?.query && (
        <p className="mt-3 wrap-anywhere rounded-md border border-border bg-background px-3 py-2 text-[11px] leading-relaxed text-text-dim">
          Gmail search: <span className="font-semibold text-text">{connection.query}</span>
        </p>
      )}
    </div>
  );
}

function gmailRuleToForm(rule) {
  const normalized = normalizeGmailRule(rule);
  return {
    domains: normalized.domains.join(', '),
    email_addresses: normalized.email_addresses.join(', '),
    keywords: normalized.keywords.join(', '),
    include_attachments: normalized.include_attachments,
  };
}

export default function EvidenceLocker() {
  const { caseId } = useParams();
  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchMeta, setSearchMeta] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [queue, setQueue] = useState([]);
  const [filters, setFilters] = useState({ q: '', category: '', status: '', sort: 'uploaded_at', direction: 'desc' });
  const [activeStack, setActiveStack] = useState('all');
  const [gmailStatus, setGmailStatus] = useState(null);
  const [gmailRule, setGmailRule] = useState({ domains: '', email_addresses: '', keywords: '', include_attachments: true });
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
    const query = filters.q.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchMeta(null);
      setSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      searchCaseDocuments(caseId, { q: query, limit: 100 })
        .then((result) => {
          if (cancelled) return;
          setSearchResults(result.documents || []);
          setSearchMeta(result);
        })
        .catch((err) => {
          if (cancelled) return;
          setSearchResults([]);
          setSearchMeta({ mode: 'keyword', semantic_available: false, semantic_hits: 0, error: err.message });
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [caseId, filters.q]);

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
            setGmailRule(gmailRuleToForm(rule));
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
  const searchActive = filters.q.trim().length >= 2;
  const baseDocuments = searchActive ? searchResults : documents;
  const visibleDocuments = useMemo(() => {
    const stacked = filterDocumentsByStack(baseDocuments, activeStack);
    const filtered = filterEvidenceDocuments(stacked, { ...filters, q: searchActive ? '' : filters.q });
    return sortDocuments(filtered, filters.sort, filters.direction);
  }, [activeStack, baseDocuments, filters, searchActive]);
  const categoryOptions = useMemo(
    () => withCounts(EVIDENCE_CATEGORY_OPTIONS, documents, documentCategoryOf),
    [documents],
  );
  const statusOptions = useMemo(
    () => withCounts(EVIDENCE_STATUS_OPTIONS, documents, evidenceStatusOf),
    [documents],
  );
  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (activeStack !== 'all') {
      chips.push({ key: 'stack', label: `Stack: ${smartStacks.find((stack) => stack.key === activeStack)?.label || formatLabel(activeStack)}` });
    }
    if (filters.q.trim()) chips.push({ key: 'q', label: `Search: ${filters.q.trim()}` });
    if (filters.category) chips.push({ key: 'category', label: `Category: ${optionLabel(EVIDENCE_CATEGORY_OPTIONS, filters.category)}` });
    if (filters.status) chips.push({ key: 'status', label: `Status: ${optionLabel(EVIDENCE_STATUS_OPTIONS, filters.status)}` });
    return chips;
  }, [activeStack, filters.category, filters.q, filters.status, smartStacks]);

  const gmailConnection = gmailStatus?.connections?.[0] || null;
  const gmailConnected = gmailConnection?.status === 'connected';
  const gmailSavedRule = useMemo(() => normalizeGmailRule(gmailConnection?.rule || {}), [gmailConnection?.rule]);
  const gmailHasSavedRule = Boolean(gmailConnection?.has_rule || gmailRuleHasCriteria(gmailSavedRule));
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
    if (!canManageGmail) {
      showNotice('warning', 'Only the case owner can connect Gmail for this case. You can still upload exported emails as files.');
      return;
    }
    if (!gmailRuleHasCriteria(gmailRule)) {
      showNotice('warning', 'Add at least one domain, email, or keyword before saving a Gmail rule.');
      return;
    }
    const normalizedRule = normalizeGmailRule(gmailRule);
    setBusy(true);
    showNotice(null, '');
    try {
      await saveGmailImportRule({
        case_id: caseId,
        ...normalizedRule,
      });
      const status = await fetchGmailStatus(caseId);
      setGmailStatus(status);
      const savedRule = status.connections?.[0]?.rule || normalizedRule;
      setGmailRule(gmailRuleToForm(savedRule));
      showNotice('success', status.connections?.[0]?.status === 'connected' ? 'Gmail rule saved. Search it to review matching messages.' : 'Gmail rule saved. Grant Gmail access, then refresh Gmail status.');
    } catch (err) {
      showNotice('error', err.message === 'Failed to fetch' ? 'Could not reach the Gmail import service. Refresh and try again.' : err.message || 'Gmail rule failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveGmailRuleValue = async (field, value) => {
    if (!gmailConnection?.rule) return;
    const nextRule = removeGmailRuleValue(gmailConnection.rule, field, value);
    setBusy(true);
    showNotice(null, '');
    try {
      if (gmailRuleHasCriteria(nextRule)) {
        await saveGmailImportRule({ case_id: caseId, ...nextRule });
      } else {
        await deleteGmailImportRule(caseId);
      }
      const status = await fetchGmailStatus(caseId);
      setGmailStatus(status);
      setGmailRule(gmailRuleToForm(status.connections?.[0]?.rule || nextRule));
      setGmailMessages([]);
      setSelectedGmailMessages([]);
      showNotice('success', 'Gmail rule updated.');
    } catch (err) {
      showNotice('error', err.message || 'Could not update the Gmail rule.');
    } finally {
      setBusy(false);
    }
  };

  const handleClearGmailRule = async () => {
    setBusy(true);
    showNotice(null, '');
    try {
      const result = await deleteGmailImportRule(caseId);
      const status = await fetchGmailStatus(caseId);
      setGmailStatus(status);
      setGmailRule(gmailRuleToForm(result.connection?.rule || status.connections?.[0]?.rule || {}));
      setGmailMessages([]);
      setSelectedGmailMessages([]);
      showNotice('success', 'Gmail search rule cleared. Gmail access stays connected.');
    } catch (err) {
      showNotice('error', err.message || 'Could not clear the Gmail rule.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshGmailConnection = async () => {
    setBusy(true);
    showNotice(null, '');
    try {
      const result = await connectGmail(caseId);
      const status = await fetchGmailStatus(caseId);
      setGmailStatus(status);
      const email = result.connection?.google_email || status.connections?.[0]?.google_email;
      showNotice('success', email ? `Gmail connected for ${email}.` : 'Gmail connected.');
    } catch (err) {
      showNotice('warning', err.message || 'Grant Gmail access, then refresh the Gmail status.');
    } finally {
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
      const likelyRelevant = (result.messages || []).filter(shouldAutoSelectGmailMessage);
      setSelectedGmailMessages(likelyRelevant.map((item) => item.id));
      showNotice('info', `Found ${result.messages?.length || 0} matching Gmail message${result.messages?.length === 1 ? '' : 's'}. ${likelyRelevant.length} likely relevant message${likelyRelevant.length === 1 ? '' : 's'} selected.`);
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

  const clearFilter = (key) => {
    if (key === 'stack') setActiveStack('all');
    if (key === 'q') setFilters((current) => ({ ...current, q: '' }));
    if (key === 'category') setFilters((current) => ({ ...current, category: '' }));
    if (key === 'status') setFilters((current) => ({ ...current, status: '' }));
  };

  const clearAllFilters = () => {
    setActiveStack('all');
    setFilters((current) => ({ ...current, q: '', category: '', status: '' }));
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

          <section className="min-w-0 rounded-md border border-border bg-background/55 px-4 py-4" aria-labelledby="gmail-import-title">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="gmail-import-title" className="inline-flex items-center gap-2 text-sm font-bold text-text">
                  <Mail className="h-4 w-4 text-accent" aria-hidden="true" />
                  Import from Gmail
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-text-dim">
                  Build a saved search, review matches, then import selected messages as evidence.
                </p>
              </div>
              <span className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-dim">Beta</span>
            </div>
            <div className="mt-4 space-y-4">
              {!canManageGmail && (
                <p className="rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-warning">
                  Gmail import is owner-only because it connects a personal mailbox. Editors can upload exported emails or PDFs.
                </p>
              )}
              {gmailConnection?.google_email && <p className="rounded-md border border-success/30 bg-success/8 px-3 py-2 text-xs text-success">Connected to {gmailConnection.google_email}</p>}
              <SavedGmailRule
                connection={gmailConnection}
                disabled={busy || !canManageGmail}
                onRemoveValue={handleRemoveGmailRuleValue}
                onClear={handleClearGmailRule}
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <GmailField
                  id="gmail-domains"
                  label="Domains"
                  help="Use school or agency domains like usd232.org. Separate multiple domains with commas. USDWatch searches messages from or to any saved domain."
                  value={gmailRule.domains}
                  onChange={(event) => setGmailRule((current) => ({ ...current, domains: event.target.value }))}
                  placeholder="usd232.org, jcocogov.org"
                />
                <GmailField
                  id="gmail-emails"
                  label="Emails"
                  help="Use specific people or inboxes. Separate multiple emails with commas. Messages from or to any saved email will be included."
                  value={gmailRule.email_addresses}
                  onChange={(event) => setGmailRule((current) => ({ ...current, email_addresses: event.target.value }))}
                  placeholder="principal@usd232.org, records@usd232.org"
                />
                <GmailField
                  id="gmail-keywords"
                  label="Keywords"
                  help="Use case-specific words like incident, supervision, records, the school name, or a child name. Keywords narrow broad domain results."
                  value={gmailRule.keywords}
                  onChange={(event) => setGmailRule((current) => ({ ...current, keywords: event.target.value }))}
                  placeholder="incident, supervision"
                />
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-text-dim">
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" className="h-4 w-4" checked={gmailRule.include_attachments} onChange={(event) => setGmailRule((current) => ({ ...current, include_attachments: event.target.checked }))} />
                  Import attachments
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy || !canManageGmail || !gmailRuleHasCriteria(gmailRule)} onClick={handleSaveGmailRule} className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">Save rule</button>
                {clerkEnabled ? (
                  <ClerkGmailAccessButton
                    busy={busy}
                    connected={gmailConnected}
                    disabled={!canManageGmail || !gmailStatus?.configured}
                    onStarted={(message) => showNotice('info', message || 'Google authorization started. Return here after approving access.')}
                    onError={(message) => showNotice('error', message)}
                  />
                ) : (
                  <button disabled className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background opacity-60">
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    Grant Gmail access
                  </button>
                )}
                <button disabled={busy || !canManageGmail || !gmailStatus?.configured} onClick={handleRefreshGmailConnection} className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">Refresh Gmail status</button>
                {gmailConnected && <button disabled={busy} onClick={handleDisconnectGmail} className="min-h-11 rounded-md border border-danger/40 px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60">Disconnect</button>}
              </div>
              {gmailConnected && (
                <div className="space-y-3 rounded-md border border-border bg-surface p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-text">Review matching messages</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-dim">
                      Search the saved rule first. Use the override only for one-off Gmail searches.
                    </p>
                  </div>
                  <input aria-label="Optional Gmail search override" className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45" value={gmailQuery} onChange={(event) => setGmailQuery(event.target.value)} placeholder="Optional one-time Gmail search override" />
                  <button disabled={busy || (!gmailHasSavedRule && !gmailQuery.trim())} onClick={handleSearchGmail} className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60">Search Gmail</button>
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
                              <span className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="truncate font-semibold text-text">{message.subject || '(no subject)'}</span>
                                <span className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-text-dim">{gmailRelevanceLabel(message)}</span>
                              </span>
                              <span className="mt-1 block truncate text-text-dim">{message.from}</span>
                              <span className="mt-1 block text-text-dim">{message.snippet}</span>
                              {message.case_relevance_reason && <span className="mt-1 block text-[11px] text-text-dim">{message.case_relevance_reason}</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                      <button disabled={busy || selectedGmailMessages.length === 0} onClick={handleImportGmail} className="min-h-11 w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">Import selected messages</button>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs leading-relaxed text-text-dim">{gmailStatus?.configured ? 'Gmail access is granted through your USDWatch account. USDWatch does not store Google refresh tokens.' : gmailStatus?.message || 'Gmail import needs Clerk backend credentials before it can connect.'}</p>
            </div>
          </section>
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
              <input className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent" value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Search evidence by keyword or meaning" aria-label="Search evidence" />
              {filters.q && (
                <button type="button" onClick={() => setFilters((current) => ({ ...current, q: '' }))} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md text-text-dim hover:bg-surface-alt hover:text-text" aria-label="Clear search">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </label>
            <FilterMenu label="Category" value={filters.category} options={categoryOptions} onChange={(value) => setFilters((current) => ({ ...current, category: value }))} />
            <FilterMenu label="Status" value={filters.status} options={statusOptions} onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
            <FilterMenu label="Sort" value={`${filters.sort}:${filters.direction}`} options={SORT_OPTIONS} onChange={(value) => {
              const [sort, direction] = value.split(':');
              setFilters((current) => ({ ...current, sort, direction }));
            }} />
          </div>

          <div className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-background/45 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-text">
                {searchActive
                  ? (searchMeta?.semantic_available ? 'Hybrid search: keywords plus meaning matches' : 'Keyword search: semantic index unavailable')
                  : 'Search checks filenames, notes, summaries, tags, and document text.'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-dim">
                {searchActive
                  ? `${searchLoading ? 'Searching' : `${visibleDocuments.length} result${visibleDocuments.length === 1 ? '' : 's'}`} for this case${searchMeta?.semantic_hits ? `, including ${searchMeta.semantic_hits} meaning match${searchMeta.semantic_hits === 1 ? '' : 'es'}` : ''}.`
                  : 'Filters combine, so a smart stack plus category narrows the same result set.'}
              </p>
            </div>
            {activeFilterChips.length > 0 && (
              <div className="flex min-w-0 flex-wrap gap-2 sm:justify-end" aria-label="Active evidence filters">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => clearFilter(chip.key)}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold text-text-dim transition-colors hover:border-accent/60 hover:text-text"
                    title={`Remove ${chip.label}`}
                  >
                    <span className="wrap-anywhere">{chip.label}</span>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ))}
                <button type="button" onClick={clearAllFilters} className="min-h-8 rounded-md border border-border px-2 py-1 text-xs font-bold text-accent transition-colors hover:bg-surface-alt">
                  Clear all
                </button>
              </div>
            )}
          </div>

          {(loading || searchLoading) && <p className="text-sm text-text-dim">{searchLoading ? 'Searching evidence...' : 'Loading evidence...'}</p>}
          {!loading && !searchLoading && visibleDocuments.length === 0 && (
            <div className="rounded-md border border-border bg-background px-4 py-10 text-center">
              <FileSearch className="mx-auto h-8 w-8 text-text-dim" aria-hidden="true" />
              <h3 className="mt-3 font-semibold text-text">No matching evidence</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-text-dim">Adjust filters, choose a different smart stack, or add the strongest document you have.</p>
            </div>
          )}
          {!loading && !searchLoading && visibleDocuments.length > 0 && (
            <div className="min-w-0 space-y-2">
              {visibleDocuments.map((doc) => (
                <EvidenceRow
                  key={doc.id}
                  doc={doc}
                  viewHref={`/cases/${caseId}/locker/${doc.id}`}
                  downloading={downloadingDocId === doc.id}
                  canDelete={canDeleteEvidence}
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
