import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, CircleDashed, Download, FileText, Info, Loader2, Printer, Scale, ShieldCheck, Wand2 } from 'lucide-react';
import {
  draftCaseText,
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
import { caseGapMetric, caseHasDraftSource, recordsRequestMetric } from '../utils/caseMetrics';
import { CASE_PLAN_HELP } from '../utils/casePlanHelp';
import { getCasePolicyReforms, policyReformCount } from '../utils/casePolicyReforms';
import { hasCurrentOcrReadiness, ocrGateLabel, ocrStatusLabel, ocrStatusTone, reviewedEvidenceHref, summarizeOcrSources } from '../utils/ocrReadiness';
import {
  ActionButton,
  Metric,
  Panel,
  StatusPill,
  actionButtonClasses,
  buildPacketText,
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

const OCR_STATUS_CLASSES = {
  neutral: 'border-border bg-background text-text-dim',
  warning: 'border-warning/35 bg-warning/10 text-warning',
  info: 'border-info/35 bg-info/10 text-info',
  success: 'border-success/35 bg-success/10 text-success',
};

const OCR_GATE_CLASSES = {
  met: 'text-success',
  partially_supported: 'text-warning',
  not_supported: 'text-text-dim',
  not_applicable: 'text-text-dim',
  unknown: 'text-text-dim',
};

const OCR_ROLE_LABELS = {
  primary_event: 'Incident record',
  parent_communication: 'Parent communication',
  school_response: 'School response',
  student_record: 'Student record',
  policy_context: 'Policy context',
  staff_training: 'Staff training',
  insurance_contract: 'Insurance record',
  generic_legal_notice: 'Generic legal text',
  comparator_incident: 'Other incident',
  unrelated: 'Reviewed context',
};

function OcrGateIcon({ status }) {
  const className = `h-4 w-4 ${OCR_GATE_CLASSES[status] || OCR_GATE_CLASSES.unknown}`;
  if (status === 'met') return <CheckCircle2 className={className} aria-hidden="true" />;
  if (status === 'partially_supported') return <AlertTriangle className={className} aria-hidden="true" />;
  return <CircleDashed className={className} aria-hidden="true" />;
}

function OcrReadinessPanel({ readiness, caseId }) {
  if (!readiness) return null;
  const tone = ocrStatusTone(readiness.overall_status);
  const statusClass = OCR_STATUS_CLASSES[tone] || OCR_STATUS_CLASSES.neutral;
  const allegations = readiness.potential_allegations || [];
  const gates = readiness.gates || [];
  const missingFacts = [...new Set(gates.flatMap((gate) => gate.missing_items || []))].slice(0, 8);
  const reviewedEvidence = readiness.reviewed_evidence || [];
  const sources = readiness.source_refs || [];
  const records = readiness.recommended_records || [];
  const nonOcrRoutes = readiness.non_ocr_routes || [];
  const cautions = readiness.cautions || [];

  return (
    <Panel title="Civil Rights / OCR Screen" help={CASE_PLAN_HELP.ocrReadiness}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${statusClass}`}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {ocrStatusLabel(readiness.overall_status)}
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-dim">
              {readiness.summary || 'Run a Case Read to assess whether the facts are ready for an OCR screen.'}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed text-text-dim">
            <span className="font-semibold text-text">{summarizeOcrSources(sources)}</span>
            <span className="block">Screen only, not a legal decision.</span>
          </div>
        </div>

        {gates.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-text">Why this result</h4>
            <div className="mt-2 divide-y divide-border rounded-md border border-border">
              {gates.map((gate) => (
                <div key={gate.key || gate.label} className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[1fr_2fr]">
                  <div className="flex min-w-0 items-center gap-2 font-semibold text-text">
                    <OcrGateIcon status={gate.status} />
                    <span>{ocrGateLabel(gate)}</span>
                  </div>
                  <div className="min-w-0 text-text-dim">
                    <p className="leading-relaxed">{gate.rationale}</p>
                    {(gate.missing_items || []).length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {gate.missing_items.map((item) => (
                          <li key={item} className="leading-relaxed">{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {missingFacts.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-text">What facts are missing</h4>
            <ul className="mt-2 grid gap-x-6 gap-y-2 text-sm leading-relaxed text-text-dim sm:grid-cols-2">
              {missingFacts.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}

        {allegations.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-text">Possible OCR questions</h4>
            <div className="mt-2 divide-y divide-border border-y border-border">
              {allegations.map((item) => (
                <section key={`${item.theory}-${item.protected_basis}`} className="py-3">
                  <div className="min-w-0">
                    <h5 className="text-sm font-bold text-text">{item.theory}</h5>
                    {item.protected_basis && <p className="mt-1 text-xs text-text-dim">Basis: {item.protected_basis}</p>}
                  </div>
                  {(item.supporting_facts || []).length > 0 && (
                    <ul className="mt-3 space-y-2 text-sm leading-relaxed text-text-dim">
                      {item.supporting_facts.map((fact) => <li key={fact}>{fact}</li>)}
                    </ul>
                  )}
                  {(item.missing_facts || []).length > 0 && (
                    <p className="mt-3 text-xs leading-relaxed text-warning">
                      More needed: {item.missing_facts.join('; ')}
                    </p>
                  )}
                </section>
              ))}
            </div>
          </div>
        )}

        {records.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-text">Records that could change this</h4>
            <ul className="mt-2 grid gap-x-6 gap-y-2 text-sm leading-relaxed text-text-dim sm:grid-cols-2">
              {records.map((record) => <li key={record}>{record}</li>)}
            </ul>
          </div>
        )}

        {nonOcrRoutes.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-text">Other routes to pursue</h4>
            <ul className="mt-2 grid gap-x-6 gap-y-2 text-sm leading-relaxed text-text-dim sm:grid-cols-2">
              {nonOcrRoutes.map((route) => <li key={route}>{route}</li>)}
            </ul>
          </div>
        )}

        {(reviewedEvidence.length > 0 || sources.length > 0) && (
          <details className="group border-y border-border py-3">
            <summary className="cursor-pointer text-sm font-bold text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Reviewed evidence and authorities
            </summary>
            {reviewedEvidence.length > 0 && (
              <div className="mt-3 divide-y divide-border">
                {reviewedEvidence.map((evidence) => {
                  const href = reviewedEvidenceHref(caseId, evidence);
                  return (
                    <Link
                      key={evidence.id || evidence.document_id}
                      to={href || '#'}
                      className="grid gap-1 py-3 text-sm transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <span className="flex min-w-0 items-center gap-2 font-semibold text-text">
                        <FileText className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                        <span className="truncate">{evidence.label || evidence.document_id}</span>
                        {evidence.role && (
                          <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-text-dim">
                            {OCR_ROLE_LABELS[evidence.role] || evidence.role}
                          </span>
                        )}
                      </span>
                      {evidence.snippet && <span className="line-clamp-2 text-text-dim">{evidence.snippet}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
            {sources.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sources.map((source) => (
                  <a
                    key={source.id}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-text-dim transition-colors hover:border-accent/50 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{source.title}</span>
                  </a>
                ))}
              </div>
            )}
          </details>
        )}

        {cautions.length > 0 && (
          <div className="rounded-md border border-border bg-background px-3 py-3 text-xs leading-relaxed text-text-dim">
            {cautions.map((caution) => <p key={caution}>{caution}</p>)}
          </div>
        )}
      </div>
    </Panel>
  );
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
  const [draftingNarrative, setDraftingNarrative] = useState(false);
  const [draftingOutcome, setDraftingOutcome] = useState(false);

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
  const currentOcrReadiness = hasCurrentOcrReadiness(result) ? result.ocr_readiness : null;
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
  const gapMetric = caseGapMetric({ caseRecord, documents, evaluation, checklist });
  const recordsMetric = recordsRequestMetric({ evaluation, recordsDrafts });
  const savedDesiredOutcome = outcomeTextFromCase(caseRecord);
  const hasDesiredOutcome = Boolean(savedDesiredOutcome.trim());
  const canDraftFamilyNarrative = caseHasDraftSource(caseRecord, documents, 'family_narrative');
  const canDraftDesiredOutcome = caseHasDraftSource(caseRecord, documents, 'desired_outcome');
  const policyReformSections = useMemo(() => getCasePolicyReforms(caseRecord), [caseRecord]);
  const totalPolicyReforms = policyReformCount(policyReformSections);
  const hasPolicyReforms = policyReformSections.length > 0;
  const caseReadSummary = evaluation
    ? packet?.what_usdwatch_sees || result?.executive_summary || 'Run a Case Read to generate a summary.'
    : 'Run a Case Read to generate a summary.';

  const nextActions = useMemo(() => {
    const actions = [];
    if (!(caseRecord?.family_narrative || caseRecord?.intake?.narrative)) actions.push('Add the family narrative: what happened, who was involved, and what changed afterward.');
    if (!hasDesiredOutcome) actions.push('Add the desired outcome: what needs to change next.');
    if (!documents.length) actions.push('Add the strongest document, email, screenshot, or incident note to the Evidence Locker.');
    if (!evaluation) actions.push('Run a Case Read after the story and evidence are in place.');
    if (gapMetric.value > 0) actions.push('Review missing evidence and decide which records requests should be sent first.');
    if (!packet && evaluation) actions.push('Open the packet tab after the Case Read is complete.');
    return actions.length ? actions.slice(0, 4) : ['Keep evidence current, track records responses, and refresh the Case Read when something important changes.'];
  }, [caseRecord?.family_narrative, caseRecord?.intake?.narrative, documents.length, evaluation, gapMetric.value, hasDesiredOutcome, packet]);

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

  const handleDraftAssist = async (target) => {
    if (!canEditCase) return;
    const canDraft = target === 'family_narrative' ? canDraftFamilyNarrative : canDraftDesiredOutcome;
    if (!canDraft) {
      setError(target === 'family_narrative'
        ? 'Add and save a story or evidence before using Draft.'
        : 'Add and save a story, desired outcome, or evidence before using Draft.');
      return;
    }
    const setDrafting = target === 'family_narrative' ? setDraftingNarrative : setDraftingOutcome;
    setDrafting(true);
    setError('');
    try {
      const result = await draftCaseText(caseId, target);
      if (target === 'family_narrative') {
        setFamilyNarrative(result.draft || '');
      } else {
        setDesiredOutcome(result.draft || '');
      }
    } catch (err) {
      setError(err.message || 'Could not draft text from this case file');
    } finally {
      setDrafting(false);
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
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 py-8 animate-fade-up">
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
        <Metric label="Gaps to Close" value={gapMetric.value} detail={gapMetric.detail} />
        <Metric label="Records Requests" value={recordsMetric.value} detail={recordsMetric.detail} />
      </div>

      <Panel
        title="Family Narrative"
        help={CASE_PLAN_HELP.familyNarrative}
        action={canEditCase ? (
          <div className="flex flex-wrap gap-2">
            <ActionButton
              disabled={draftingNarrative || !canDraftFamilyNarrative}
              onClick={() => handleDraftAssist('family_narrative')}
              variant="secondary"
              aria-label={canDraftFamilyNarrative ? 'Draft family narrative from the case file' : 'Add and save a story or evidence before using Draft'}
            >
              {draftingNarrative ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
              Draft
            </ActionButton>
            <ActionButton
              disabled={savingNarrative || familyNarrative === (caseRecord.family_narrative || caseRecord.intake?.narrative || '')}
              onClick={handleSaveNarrative}
              variant="primary"
            >
              {savingNarrative ? 'Saving...' : 'Save Narrative'}
            </ActionButton>
          </div>
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
        help={CASE_PLAN_HELP.desiredOutcome}
        action={canEditCase ? (
          <div className="flex flex-wrap gap-2">
            <ActionButton
              disabled={draftingOutcome || !canDraftDesiredOutcome}
              onClick={() => handleDraftAssist('desired_outcome')}
              variant="secondary"
              aria-label={canDraftDesiredOutcome ? 'Draft desired outcome from the case file' : 'Add and save a story, desired outcome, or evidence before using Draft'}
            >
              {draftingOutcome ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
              Draft
            </ActionButton>
            <ActionButton
              disabled={savingOutcome || desiredOutcome.trim() === savedDesiredOutcome.trim()}
              onClick={handleSaveDesiredOutcome}
              variant="primary"
            >
              {savingOutcome ? 'Saving...' : 'Save Desired Outcome'}
            </ActionButton>
          </div>
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

      {hasPolicyReforms && (
        <Panel
          title="What We're Asking For"
          help={CASE_PLAN_HELP.policyReforms}
          action={(
            <Link to="policy-reforms" className={actionButtonClasses('secondary', 'px-4')}>
              <Scale className="h-4 w-4" aria-hidden="true" />
              View Reforms
            </Link>
          )}
        >
          <p className="max-w-3xl text-sm leading-relaxed text-text-dim">
            {totalPolicyReforms} specific policy changes tied to this case. These are separate from the personal case outcome above.
          </p>
          <div className="mt-4 grid gap-x-6 gap-y-5 lg:grid-cols-3">
            {policyReformSections.map((section) => (
              <section key={section.id} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
                  <div>
                    <h4 className="text-sm font-bold text-text">{section.entity}</h4>
                    <p className="text-xs text-text-dim">{section.label}</p>
                  </div>
                  <span className="text-xs font-semibold text-text-dim">{section.reforms.length}</span>
                </div>
                <ol className="mt-3 space-y-3">
                  {section.reforms.map((reform, index) => (
                    <li key={reform.title} className="grid grid-cols-[1.5rem_1fr] gap-2 text-sm">
                      <span
                        className="mt-0.5 grid h-6 w-6 place-items-center rounded-full border text-xs font-bold"
                        style={{
                          borderColor: `color-mix(in srgb, var(${section.colorVar}) 45%, transparent)`,
                          color: `var(${section.colorVar})`,
                        }}
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold leading-snug text-text">{reform.title}</span>
                        <span className="mt-1 block leading-relaxed text-text-dim">{reform.summary}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="min-w-0 space-y-5">
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

        <main className="min-w-0 space-y-5">
          <Panel title="Case Read Summary" help={CASE_PLAN_HELP.caseReadSummary}>
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

          <OcrReadinessPanel readiness={currentOcrReadiness} caseId={caseId} />

        </main>
      </div>
    </div>
  );
}
