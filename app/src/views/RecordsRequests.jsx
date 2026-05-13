import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronRight, Copy, Loader2, Printer } from 'lucide-react';
import {
  fetchCaseAccess,
  fetchEntities,
  fetchKoraRequests,
  generateKoraRequests,
  getJobStatus,
  markKoraSent,
  updateKoraRequest,
} from '../api/client';
import { printDocument } from '../utils/printPdf';
import { casePermissions } from '../utils/caseAccess';
import { ActionButton, Panel, StatusPill, formatLabel } from './caseShared';

const STATUS_FLOW = ['draft', 'sent', 'partial', 'fulfilled', 'denied'];

function entityNamesFor(request, entities) {
  return (request.entity_ids || [])
    .map((id) => entities.find((entity) => entity.id === id)?.name)
    .filter(Boolean);
}

export default function RecordsRequests() {
  const { caseId } = useParams();
  const [entities, setEntities] = useState([]);
  const [requests, setRequests] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [copied, setCopied] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genJobId, setGenJobId] = useState(null);
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const permissions = useMemo(() => casePermissions(access), [access]);
  const canManageRecords = permissions.can_manage_records;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextEntities, nextRequests, nextAccess] = await Promise.all([
        fetchEntities(caseId).catch(() => []),
        fetchKoraRequests('', caseId),
        fetchCaseAccess(caseId).catch(() => null),
      ]);
      setEntities(nextEntities);
      setRequests(nextRequests);
      setAccess(nextAccess);
    } catch (err) {
      setError(err.message || 'Failed to load records requests');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!genJobId) return undefined;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const job = await getJobStatus(genJobId);
        if (cancelled) return;
        if (job.status === 'complete' || job.status === 'failed') {
          window.clearInterval(timer);
          setGenerating(false);
          setGenJobId(null);
          if (job.status === 'complete') {
            loadData();
          } else {
            setError(job.error || 'Records request generation failed');
          }
        }
      } catch (err) {
        if (!cancelled) {
          window.clearInterval(timer);
          setGenerating(false);
          setGenJobId(null);
          setError(err.message || 'Failed to check generation status');
        }
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [genJobId, loadData]);

  const counts = useMemo(() => {
    const next = Object.fromEntries(STATUS_FLOW.map((status) => [status, 0]));
    for (const request of requests) {
      next[request.status] = (next[request.status] || 0) + 1;
    }
    return next;
  }, [requests]);

  const handleGenerate = async () => {
    if (!canManageRecords) return;
    setGenerating(true);
    setError('');
    try {
      const job = await generateKoraRequests(caseId);
      setGenJobId(job.id);
    } catch (err) {
      setGenerating(false);
      setError(err.message || 'Failed to generate records requests');
    }
  };

  const handleCopy = async (request) => {
    await navigator.clipboard.writeText(request.letter_text || request.records_description || '');
    setCopied(request.id);
    window.setTimeout(() => setCopied(null), 2000);
  };

  const updateRequestStatus = async (request, status) => {
    if (!canManageRecords) return;
    setError('');
    try {
      const updated = status === 'sent'
        ? await markKoraSent(request.id)
        : await updateKoraRequest(request.id, { status });
      setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err.message || 'Failed to update request');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8 animate-fade-up">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium text-accent/80">Records tracking</p>
          <h2 className="mt-1 text-3xl font-bold">Records Requests</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-dim">
            Generate request drafts, send them yourself, and track whether responses are pending, partial, fulfilled, or denied.
          </p>
        </div>
        {canManageRecords && (
          <ActionButton
            onClick={handleGenerate}
            disabled={generating}
            variant="primary"
            className="px-4"
          >
            {generating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {generating ? 'Generating...' : requests.length ? 'Regenerate Requests' : 'Generate Requests'}
          </ActionButton>
        )}
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <Panel title="Request Status" eyebrow="Pipeline">
        <div className="flex flex-wrap gap-2">
          {STATUS_FLOW.map((status) => (
            <StatusPill key={status} status={`${formatLabel(status)} ${counts[status] || 0}`} />
          ))}
        </div>
        {generating && (
          <p className="mt-3 text-sm text-text-dim">
            USDWatch is reading the current case gaps and drafting request language. This can take a minute.
          </p>
        )}
        {!canManageRecords && (
          <p className="mt-3 text-sm leading-relaxed text-text-dim">
            You can review and copy records drafts in this shared case. Updating statuses or generating new drafts requires editor access.
          </p>
        )}
      </Panel>

      <Panel title="Drafts And Responses" eyebrow="Send and update">
        {loading && <p className="text-sm text-text-dim">Loading requests...</p>}
        {!loading && requests.length === 0 && (
          <div className="rounded-md border border-border bg-background px-4 py-8 text-center">
            <h3 className="font-semibold text-text">No records requests yet</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-text-dim">
              Generate drafts after your story and evidence are in. You stay in control of what gets sent.
            </p>
          </div>
        )}
        {!loading && requests.length > 0 && (
          <div className="divide-y divide-border">
            {requests.map((request) => {
              const isExpanded = expandedId === request.id;
              const names = entityNamesFor(request, entities);
              return (
                <article key={request.id} className="py-4 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : request.id)}
                    className="flex min-h-11 w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-background/60"
                    aria-expanded={isExpanded}
                  >
                    <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-text-dim transition-transform ${isExpanded ? 'rotate-90' : ''}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text">{request.subject || 'Untitled request'}</span>
                      <span className="mt-1 block text-xs text-text-dim">
                        {names.join(', ') || request.custodian?.name || 'Records custodian'}
                        {request.record_category ? ` - ${formatLabel(request.record_category)}` : ''}
                      </span>
                    </span>
                    <StatusPill status={request.status} />
                  </button>

                  {isExpanded && (
                    <div className="mt-4 space-y-3 pl-7">
                      {request.relevance && <p className="text-sm leading-relaxed text-text-dim">{request.relevance}</p>}
                      <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-xs leading-relaxed text-text-dim">
                        {request.letter_text || request.records_description}
                      </pre>
                      <div className="flex flex-wrap gap-2">
                        <ActionButton
                          onClick={() => handleCopy(request)}
                          variant="secondary"
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                          {copied === request.id ? 'Copied' : 'Copy Letter'}
                        </ActionButton>
                        <ActionButton
                          onClick={() => printDocument({
                            title: request.subject || 'Records Request',
                            body: request.letter_text || request.records_description || '',
                            meta: {
                              Status: request.status,
                              Category: formatLabel(request.record_category),
                              Custodian: names.join(', ') || request.custodian?.name,
                              Sent: request.sent_at ? new Date(request.sent_at).toLocaleDateString() : '',
                            },
                          })}
                          variant="download"
                        >
                          <Printer className="h-4 w-4" aria-hidden="true" />
                          Print / Save PDF
                        </ActionButton>
                        {canManageRecords && STATUS_FLOW.map((status) => {
                          if (status === request.status) return null;
                          return (
                            <ActionButton
                              key={status}
                              onClick={() => updateRequestStatus(request, status)}
                              variant="secondary"
                            >
                              Mark {formatLabel(status)}
                            </ActionButton>
                          );
                        })}
                      </div>
                      {request.response_notes && (
                        <p className="text-xs leading-relaxed text-text-dim">
                          <strong className="text-text">Response notes:</strong> {request.response_notes}
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
