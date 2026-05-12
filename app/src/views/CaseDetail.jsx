import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileText, Loader2, Printer } from 'lucide-react';
import {
  fetchCase,
  fetchCaseDocuments,
  fetchCaseEvaluation,
  fetchCaseExport,
  fetchEvidenceChecklist,
  fetchLatestEvaluation,
  fetchRecordsRequestDrafts,
  fetchSelfAdvocacyPacket,
  startCaseEvaluation,
  updateCase,
  updateSupportConsent,
} from '../api/client';
import { printDocument } from '../utils/printPdf';
import {
  ActionButton,
  EMPTY_SUPPORT,
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
  const [documents, setDocuments] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [packet, setPacket] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [recordsDrafts, setRecordsDrafts] = useState([]);
  const [supportForm, setSupportForm] = useState(EMPTY_SUPPORT);
  const [familyNarrative, setFamilyNarrative] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingNarrative, setSavingNarrative] = useState(false);
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [savingSupport, setSavingSupport] = useState(false);

  const loadCase = useCallback(async () => {
    setError('');
    try {
      const [
        nextCase,
        nextDocs,
        nextEval,
        nextPacket,
        nextChecklist,
        nextRecords,
      ] = await Promise.all([
        fetchCase(caseId),
        fetchCaseDocuments(caseId).catch(() => []),
        fetchLatestEvaluation(caseId).catch(() => null),
        fetchSelfAdvocacyPacket(caseId).catch(() => null),
        fetchEvidenceChecklist(caseId).catch(() => ({ items: [] })),
        fetchRecordsRequestDrafts(caseId).catch(() => ({ records: [] })),
      ]);
      setCaseRecord(nextCase);
      setFamilyNarrative(nextCase.family_narrative || nextCase.intake?.narrative || '');
      setDesiredOutcome(outcomeTextFromCase(nextCase));
      setDocuments(nextDocs);
      setEvaluation(nextEval);
      setPacket(nextPacket);
      setChecklist(nextChecklist.items || []);
      setRecordsDrafts(nextRecords.records || []);
      setSupportForm({ ...EMPTY_SUPPORT, ...(nextCase.support_consent || {}) });
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
  const issueCategories = caseRecord?.intake?.issue_categories?.length
    ? caseRecord.intake.issue_categories
    : [caseRecord?.intake?.issue_type].filter(Boolean);
  const indexedCount = documents.filter((doc) => ['indexed', 'complete'].includes(doc.processing_status || doc.status)).length;
  const reviewCount = documents.filter((doc) => (doc.processing_status || doc.status) === 'needs_review').length;
  const missingCount = checklistStatusCount(checklist, 'missing') + checklistStatusCount(checklist, 'recommended');
  const activeRecordCount = recordsDrafts.length;
  const anySupport = supportForm.attorney_contact_opt_in || supportForm.advocacy_contact_opt_in || supportForm.media_contact_opt_in;
  const savedDesiredOutcome = outcomeTextFromCase(caseRecord);
  const hasDesiredOutcome = Boolean(savedDesiredOutcome.trim());

  const nextActions = useMemo(() => {
    const actions = [];
    if (!(caseRecord?.family_narrative || caseRecord?.intake?.narrative)) actions.push('Tell the Case Advocate what happened so USDWatch can start a Family Narrative.');
    if (!hasDesiredOutcome) actions.push('Summarize what a good outcome would look like, including any safety changes, records, supports, or policy fixes you want.');
    if (!documents.length) actions.push('Add the strongest document, email, screenshot, or incident note to the Evidence Locker.');
    if (!evaluation) actions.push('Run the first Case Read so USDWatch can organize what it sees from the story and evidence.');
    if (missingCount > 0) actions.push('Review missing evidence and decide which records requests should be sent first.');
    if (!packet && evaluation) actions.push('Open the packet tab after the Case Read to print a self-advocacy plan.');
    return actions.length ? actions.slice(0, 4) : ['Keep evidence current, track records responses, and refresh the Case Read when something important changes.'];
  }, [caseRecord?.family_narrative, caseRecord?.intake?.narrative, documents.length, evaluation, hasDesiredOutcome, missingCount, packet]);

  const updateSupportField = (field, value) => {
    setSupportForm((current) => ({ ...current, [field]: value }));
  };

  const handleRunEvaluation = async () => {
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

  const handleSaveSupport = async () => {
    setSavingSupport(true);
    setError('');
    try {
      const payload = { ...supportForm };
      if (!anySupport) payload.share_summary_consent = false;
      const nextCase = await updateSupportConsent(caseId, payload);
      setCaseRecord(nextCase);
      setSupportForm({ ...EMPTY_SUPPORT, ...(nextCase.support_consent || {}) });
    } catch (err) {
      setError(err.message || 'Failed to save support preferences');
    } finally {
      setSavingSupport(false);
    }
  };

  const handleRevokeSupport = async () => {
    setSavingSupport(true);
    setError('');
    try {
      const nextCase = await updateSupportConsent(caseId, EMPTY_SUPPORT);
      setCaseRecord(nextCase);
      setSupportForm({ ...EMPTY_SUPPORT, ...(nextCase.support_consent || {}) });
    } catch (err) {
      setError(err.message || 'Failed to revoke support consent');
    } finally {
      setSavingSupport(false);
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Link to="/cases" className="text-sm font-semibold text-accent hover:text-accent-hover">Cases</Link>
          <h2 className="text-3xl font-bold">{caseRecord.title}</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-text-dim">
            A calmer working desk for your Family Narrative, evidence, records requests, Case Read, and self-advocacy packet.
          </p>
          <div className="flex flex-wrap gap-2">
            <StatusPill status={caseRecord.status} />
            <StatusPill status={caseRecord.intake?.urgency_level || 'routine'} />
            {issueCategories.map((category) => <StatusPill key={category} status={category} />)}
            {caseRecord.intake?.safety_risk && <StatusPill status="safety risk" />}
            {caseRecord.intake?.retaliation_concern && <StatusPill status="retaliation concern" />}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
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
            disabled={busy || caseReadInProgress}
            onClick={handleRunEvaluation}
            variant="primary"
            className="px-4"
          >
            {busy || caseReadInProgress ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
            {caseReadInProgress ? 'Case Read running...' : evaluation ? 'Refresh Case Read' : 'Run Case Read'}
          </ActionButton>
        </div>
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Evidence Strength" value={formatLabel(result?.evidence_strength || packet?.evidence_strength || 'unknown')} detail="Current support from story and files." />
        <Metric label="Evidence Files" value={documents.length} detail={`${indexedCount} ready${reviewCount ? `, ${reviewCount} need review` : ''}`} />
        <Metric label="Gaps To Close" value={missingCount} detail="Missing or recommended evidence." />
        <Metric label="Records Requests" value={activeRecordCount} detail="Drafts and tracked requests." />
      </div>

      <Panel
        title="Family Narrative"
        eyebrow={caseRecord.advocate_state?.family_narrative_manual ? 'Parent-edited' : 'Case Advocate draft'}
        action={(
          <ActionButton
            disabled={savingNarrative || familyNarrative === (caseRecord.family_narrative || caseRecord.intake?.narrative || '')}
            onClick={handleSaveNarrative}
            variant="primary"
          >
            {savingNarrative ? 'Saving...' : 'Save Narrative'}
          </ActionButton>
        )}
      >
        <p className="mb-3 max-w-3xl text-sm leading-relaxed text-text-dim">
          This is the parent-centered story the Case Advocate helps assemble. Edits you save here stay in control unless you later accept a suggested revision.
        </p>
        <textarea
          value={familyNarrative}
          onChange={(event) => setFamilyNarrative(event.target.value)}
          className="min-h-[150px] w-full rounded-md border border-border bg-background px-3 py-3 text-sm leading-relaxed text-text outline-none transition-colors focus:border-accent"
          placeholder="Tell the story the way you would tell a trusted advocate: what happened, who was affected, what worries you now, and what you need next."
        />
      </Panel>

      <Panel
        title="Desired Outcome"
        eyebrow="What you want changed"
        action={(
          <ActionButton
            disabled={savingOutcome || desiredOutcome.trim() === savedDesiredOutcome.trim()}
            onClick={handleSaveDesiredOutcome}
            variant="primary"
          >
            {savingOutcome ? 'Saving...' : 'Save Desired Outcome'}
          </ActionButton>
        )}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <p className="mb-3 max-w-3xl text-sm leading-relaxed text-text-dim">
              Write what a practical resolution would look like. This can be one clear ask or a short list: safety changes, records, accountability, support for your child, or policy fixes you want the program to make.
            </p>
            <textarea
              value={desiredOutcome}
              onChange={(event) => setDesiredOutcome(event.target.value)}
              className="min-h-[130px] w-full rounded-md border border-border bg-background px-3 py-3 text-sm leading-relaxed text-text outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45"
              placeholder="Example: I want a written safety plan, a corrected incident report, age-group separation during outdoor play, and clear parent notification after serious injuries."
            />
          </div>
          <aside className="rounded-md border border-border bg-background/65 p-3">
            <p className="text-xs font-semibold text-text">Helpful prompts</p>
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-text-dim">
              <li>What needs to happen for your child to be safe?</li>
              <li>What records, corrections, or explanations do you still need?</li>
              <li>What should JCPRD, the school, or the district change before this happens again?</li>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-text-dim">
              Later, USDWatch can suggest specific policy reforms from this section. For now, it keeps your ask tied to this case.
            </p>
          </aside>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-5">
          <Panel title="What To Do Next" eyebrow="Case plan">
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
          <Panel title="What USDWatch Sees" eyebrow="Current read">
            <p className="max-w-3xl text-sm leading-relaxed text-text-dim">
              {packet?.what_usdwatch_sees || result?.executive_summary || 'Run a Case Read to generate a fuller current read.'}
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

          <Panel title="Support Options" eyebrow="Manual opt-in only">
            <p className="mb-4 max-w-3xl text-sm leading-relaxed text-text-dim">
              Default is no sharing. These preferences only allow USDWatch to manually review your case before any limited summary is shared with the support category you choose.
            </p>
            <div className="grid gap-3">
              <label className="flex min-h-11 items-start gap-3 rounded-md border border-border bg-background p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={supportForm.attorney_contact_opt_in} onChange={(event) => updateSupportField('attorney_contact_opt_in', event.target.checked)} />
                <span><strong className="text-text">Attorney contact</strong><span className="block text-text-dim">I may want a qualified attorney to review whether this needs legal help.</span></span>
              </label>
              <label className="flex min-h-11 items-start gap-3 rounded-md border border-border bg-background p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={supportForm.advocacy_contact_opt_in} onChange={(event) => updateSupportField('advocacy_contact_opt_in', event.target.checked)} />
                <span><strong className="text-text">Advocacy or parent-group support</strong><span className="block text-text-dim">I may want help with meetings, records requests, or complaint options.</span></span>
              </label>
              <label className="flex min-h-11 items-start gap-3 rounded-md border border-border bg-background p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={supportForm.media_contact_opt_in} onChange={(event) => updateSupportField('media_contact_opt_in', event.target.checked)} />
                <span><strong className="text-text">Media interest</strong><span className="block text-text-dim">I may be open to a reporter if this appears to show a broader public problem.</span></span>
              </label>
              <label className="flex min-h-11 items-start gap-3 rounded-md border border-warning/30 bg-warning/8 p-3 text-sm text-text-dim">
                <input type="checkbox" className="mt-1" checked={supportForm.share_summary_consent} onChange={(event) => updateSupportField('share_summary_consent', event.target.checked)} />
                I consent to USDWatch manually reviewing and preparing a limited case summary for the support categories I selected.
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-text-dim">Best way to reach you</span>
                <input
                  className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  value={supportForm.contact_preference}
                  onChange={(event) => updateSupportField('contact_preference', event.target.value)}
                  placeholder="Email after 5pm, text first, etc."
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-text-dim">Sensitive details to protect</span>
                <input
                  className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  value={supportForm.sensitivity_notes}
                  onChange={(event) => updateSupportField('sensitivity_notes', event.target.value)}
                  placeholder="No media contact, avoid names, etc."
                />
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <ActionButton
                disabled={savingSupport}
                onClick={handleSaveSupport}
                variant="primary"
                className="px-4"
              >
                Save Support Preferences
              </ActionButton>
              <ActionButton
                disabled={savingSupport}
                onClick={handleRevokeSupport}
                variant="danger"
                className="px-4"
              >
                Revoke Support Consent
              </ActionButton>
            </div>
          </Panel>
        </main>
      </div>
    </div>
  );
}
