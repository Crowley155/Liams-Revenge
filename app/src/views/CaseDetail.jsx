import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, FileText, Loader2, Printer } from 'lucide-react';
import {
  fetchCase,
  fetchCaseAccess,
  fetchCaseDocuments,
  fetchCaseEvaluation,
  fetchCaseExport,
  fetchEvidenceChecklist,
  fetchLatestEvaluation,
  fetchRecordsRequestDrafts,
  fetchSelfAdvocacyPacket,
  startCaseEvaluation,
  updateCase,
} from '../api/client';
import { printDocument } from '../utils/printPdf';
import { casePermissions } from '../utils/caseAccess';
import {
  ActionButton,
  Metric,
  Panel,
  StatusPill,
  buildPacketText,
  checklistStatusCount,
  formatLabel,
} from './caseShared';

function outcomeLines(value) {
  return String(value || '')
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function outcomeTextFromCase(caseRecord) {
  const intake = caseRecord?.intake || {};
  if (intake.desired_outcome) return intake.desired_outcome;
  return (intake.desired_outcomes || []).join('\n');
}

export default function CaseDetail() {
  const { caseId } = useParams();
  const [caseRecord, setCaseRecord] = useState(null);
  const [access, setAccess] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [packet, setPacket] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [recordsDrafts, setRecordsDrafts] = useState([]);
  const [familyNarrative, setFamilyNarrative] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingNarrative, setSavingNarrative] = useState(false);
  const [savingOutcome, setSavingOutcome] = useState(false);

  const loadCase = useCallback(async () => {
    setError('');
    try {
      const [
        nextCase,
        nextAccess,
        nextDocs,
        nextEval,
        nextPacket,
        nextChecklist,
        nextRecords,
      ] = await Promise.all([
        fetchCase(caseId),
        fetchCaseAccess(caseId).catch(() => null),
        fetchCaseDocuments(caseId).catch(() => []),
        fetchLatestEvaluation(caseId).catch(() => null),
        fetchSelfAdvocacyPacket(caseId).catch(() => null),
        fetchEvidenceChecklist(caseId).catch(() => ({ items: [] })),
        fetchRecordsRequestDrafts(caseId).catch(() => ({ records: [] })),
      ]);
      setCaseRecord(nextCase);
      setAccess(nextAccess);
      setFamilyNarrative(nextCase.family_narrative || nextCase.intake?.narrative || '');
      setDesiredOutcome(outcomeTextFromCase(nextCase));
      setDocuments(nextDocs);
      setEvaluation(nextEval);
      setPacket(nextPacket);
      setChecklist(nextChecklist.items || []);
      setRecordsDrafts(nextRecords.records || []);
    } catch (err) {
      setError(err.message || 'Failed to load case');
    }
  }, [caseId]);

  useEffect(() => {
    let cancelled = false;
    loadCase().catch((err) => {
      if (!cancelled) setError(err.message || 'Failed to load case');
    });
    return () => {
      cancelled = true;
    };
  }, [loadCase]);

  useEffect(() => {
    const handleCaseUpdated = (event) => {
      if (!event.detail?.caseId || event.detail.caseId === caseId) {
        loadCase();
      }
    };
    window.addEventListener('usdwatch:case-updated', handleCaseUpdated);
    return () => window.removeEventListener('usdwatch:case-updated', handleCaseUpdated);
  }, [caseId, loadCase]);

  const permissions = useMemo(() => casePermissions(access), [access]);
  const canEditCase = permissions.can_edit;
  const canRunCaseRead = permissions.can_run_case_read;
  const caseReadInProgress = ['queued', 'running'].includes(evaluation?.status);

  useEffect(() => {
    if (!caseReadInProgress || !evaluation?.id) return undefined;

    let cancelled = false;
    const pollEvaluation = async () => {
      try {
        const nextEvaluation = await fetchCaseEvaluation(caseId, evaluation.id);
        if (cancelled) return;
        setEvaluation(nextEvaluation);
        if (nextEvaluation.status === 'complete') {
          loadCase();
        } else if (nextEvaluation.status === 'failed') {
          setError(nextEvaluation.error || 'Case Read failed');
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to refresh Case Read status');
      }
    };

    pollEvaluation();
    const timer = window.setInterval(pollEvaluation, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [caseId, caseReadInProgress, evaluation?.id, loadCase]);

  const result = evaluation?.result;
  const caseReadStatus = evaluation?.status || 'not_started';
  const latestWorkflowStep = evaluation?.workflow_steps?.at?.(-1) || '';
  const caseReadStatusDetail = (() => {
    if (!evaluation) return 'No Case Read has been started yet.';
    if (evaluation.status === 'queued') return 'The Case Read is queued and will start shortly.';
    if (evaluation.status === 'running') return latestWorkflowStep ? `Working on ${formatLabel(latestWorkflowStep)}.` : 'The Case Read is running now.';
    if (evaluation.status === 'failed') return evaluation.error || 'The last Case Read failed.';
    if (evaluation.completed_at) return `Last completed ${new Date(evaluation.completed_at).toLocaleString()}.`;
    return 'The latest Case Read is complete.';
  })();
  const indexedCount = documents.filter((doc) => ['indexed', 'complete'].includes(doc.processing_status || doc.status)).length;
  const reviewCount = documents.filter((doc) => (doc.processing_status || doc.status) === 'needs_review').length;
  const missingCount = checklistStatusCount(checklist, 'missing') + checklistStatusCount(checklist, 'recommended');
  const activeRecordCount = recordsDrafts.length;
  const savedDesiredOutcome = outcomeTextFromCase(caseRecord);
  const hasDesiredOutcome = Boolean(savedDesiredOutcome.trim());
  const caseReadSummary = evaluation
    ? packet?.what_usdwatch_sees || result?.executive_summary || 'Run a Case Read to generate a summary.'
    : 'Run a Case Read to generate a summary.';

  const nextActions = useMemo(() => {
    const actions = [];
    if (!(caseRecord?.family_narrative || caseRecord?.intake?.narrative)) actions.push('Add the family narrative: what happened, who was involved, and what changed afterward.');
    if (!hasDesiredOutcome) actions.push('Add the desired outcome: what needs to change next.');
    if (!documents.length) actions.push('Add the strongest document, email, screenshot, or incident note to the Evidence Locker.');
    if (!evaluation) actions.push('Run a Case Read after the story and evidence are in place.');
    if (missingCount > 0) actions.push('Review missing evidence and decide which records requests should be sent first.');
    if (!packet && evaluation) actions.push('Open the packet tab after the Case Read is complete.');
    return actions.length ? actions.slice(0, 4) : ['Keep evidence current, track records responses, and refresh the Case Read when something important changes.'];
  }, [caseRecord?.family_narrative, caseRecord?.intake?.narrative, documents.length, evaluation, hasDesiredOutcome, missingCount, packet]);

  const handleRunEvaluation = async () => {
    if (!canRunCaseRead) return;
    setBusy(true);
    setError('');
    try {
      const next = await startCaseEvaluation(caseId);
      setEvaluation(next);
    } catch (err) {
      setError(err.message || 'Failed to start Case Read');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNarrative = async () => {
    if (!canEditCase) return;
    setSavingNarrative(true);
    setError('');
    try {
      const nextCase = await updateCase(caseId, { family_narrative: familyNarrative });
      setCaseRecord(nextCase);
      setFamilyNarrative(nextCase.family_narrative || '');
    } catch (err) {
      setError(err.message || 'Failed to save Family Narrative');
    } finally {
      setSavingNarrative(false);
    }
  };

  const handleSaveDesiredOutcome = async () => {
    if (!canEditCase) return;
    setSavingOutcome(true);
    setError('');
    try {
      const desiredOutcomes = outcomeLines(desiredOutcome);
      const nextCase = await updateCase(caseId, {
        desired_outcome: desiredOutcome.trim(),
        desired_outcomes: desiredOutcomes,
      });
      setCaseRecord(nextCase);
      setDesiredOutcome(outcomeTextFromCase(nextCase));
    } catch (err) {
      setError(err.message || 'Failed to save desired outcome');
    } finally {
      setSavingOutcome(false);
    }
  };

  const handlePrintPacket = () => {
    printDocument({
      title: packet?.title || `Self-Advocacy Packet - ${caseRecord?.title || 'Case'}`,
      body: buildPacketText(packet, caseRecord),
      meta: {
        District: caseRecord?.intake?.district,
        School: caseRecord?.intake?.school,
        Generated: packet?.generated_at,
      },
    });
  };

  const handleExportCase = async () => {
    setBusy(true);
    setError('');
    try {
      const exported = await fetchCaseExport(caseId);
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `usdwatch-case-${caseId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to export case');
    } finally {
      setBusy(false);
    }
  };

  if (error && !caseRecord) {
    return <div className="mx-auto max-w-3xl py-10 text-sm text-danger">{error}</div>;
  }

  if (!caseRecord) {
    return <div className="grid min-h-[40vh] place-items-center text-sm text-text-dim">Loading case...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8 animate-fade-up">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end" aria-label="Case actions">
        <ActionButton
          disabled={busy || !packet}
          onClick={handlePrintPacket}
          variant="secondary"
          className="px-4"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print Packet
        </ActionButton>
        <ActionButton
          disabled={busy}
          onClick={handleExportCase}
          variant="download"
          className="px-4"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export Case
        </ActionButton>
        <ActionButton
          disabled={busy || caseReadInProgress || !canRunCaseRead}
          onClick={handleRunEvaluation}
          variant="primary"
          className="px-4"
        >
          {busy || caseReadInProgress ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
          {caseReadInProgress ? 'Case Read running...' : evaluation ? 'Refresh Case Read' : 'Run Case Read'}
        </ActionButton>
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Evidence Strength" value={formatLabel(result?.evidence_strength || packet?.evidence_strength || 'unknown')} detail="Current support from story and files." />
        <Metric label="Evidence Files" value={documents.length} detail={`${indexedCount} ready${reviewCount ? `, ${reviewCount} need review` : ''}`} />
        <Metric label="Gaps to Close" value={missingCount} detail="Missing or recommended evidence." />
        <Metric label="Records Requests" value={activeRecordCount} detail="Drafts and tracked requests." />
      </div>

      <Panel
        title="Family Narrative"
        action={canEditCase ? (
          <ActionButton
            disabled={savingNarrative || familyNarrative === (caseRecord.family_narrative || caseRecord.intake?.narrative || '')}
            onClick={handleSaveNarrative}
            variant="primary"
          >
            {savingNarrative ? 'Saving...' : 'Save Narrative'}
          </ActionButton>
        ) : null}
      >
        <textarea
          value={familyNarrative}
          readOnly={!canEditCase}
          onChange={(event) => setFamilyNarrative(event.target.value)}
          className="min-h-[150px] w-full rounded-md border border-border bg-background px-3 py-3 text-sm leading-relaxed text-text outline-none transition-colors focus:border-accent read-only:text-text-dim"
          placeholder="Tell the story the way you would tell a trusted advisor: what happened, who was affected, what worries you now, and what you need next."
        />
      </Panel>

      <Panel
        title="Desired Outcome"
        action={canEditCase ? (
          <ActionButton
            disabled={savingOutcome || desiredOutcome.trim() === savedDesiredOutcome.trim()}
            onClick={handleSaveDesiredOutcome}
            variant="primary"
          >
            {savingOutcome ? 'Saving...' : 'Save Desired Outcome'}
          </ActionButton>
        ) : null}
      >
        <textarea
          value={desiredOutcome}
          readOnly={!canEditCase}
          onChange={(event) => setDesiredOutcome(event.target.value)}
          className="min-h-[130px] w-full rounded-md border border-border bg-background px-3 py-3 text-sm leading-relaxed text-text outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45 read-only:text-text-dim"
          placeholder="What needs to change? Include safety steps, records, supports, corrections, or policy fixes."
        />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-5">
          <Panel title="Next Steps">
            <div className="mb-3 rounded-md border border-border bg-background px-3 py-3 text-xs leading-relaxed text-text-dim">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-text-dim">Case Read</span>
                <StatusPill status={formatLabel(caseReadStatus)} />
              </div>
              <p>{caseReadStatusDetail}</p>
            </div>
            <ol className="divide-y divide-border">
              {nextActions.map((action, index) => (
                <li key={action} className="grid grid-cols-[28px_1fr] gap-3 py-3 text-sm">
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-accent/40 text-xs font-bold text-accent">{index + 1}</span>
                  <span className="leading-relaxed text-text">{action}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </aside>

        <main className="space-y-5">
          <Panel title="Case Read Summary">
            <p className="max-w-3xl text-sm leading-relaxed text-text-dim">
              {caseReadSummary}
            </p>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold text-text-dim">District</dt>
                <dd className="mt-1 text-text">{caseRecord.intake?.district || 'Not entered'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-text-dim">School</dt>
                <dd className="mt-1 text-text">{caseRecord.intake?.school || 'Not entered'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-text-dim">Impacted person</dt>
                <dd className="mt-1 text-text">
                  {caseRecord.intake?.grade_level || 'Grade not entered'}
                  {caseRecord.intake?.impacted_party_age ? `, age ${caseRecord.intake.impacted_party_age}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-text-dim">IEP / 504</dt>
                <dd className="mt-1 text-text">{formatLabel(caseRecord.intake?.iep_504_status || 'not specified')}</dd>
              </div>
            </dl>
          </Panel>

        </main>
      </div>
    </div>
  );
}
