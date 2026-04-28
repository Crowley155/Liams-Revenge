import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchCase,
  fetchCaseDocuments,
  fetchCaseExport,
  fetchEvidenceChecklist,
  fetchLatestEvaluation,
  fetchRecordsRequestDrafts,
  fetchSelfAdvocacyPacket,
  startCaseEvaluation,
  updateSupportConsent,
} from '../api/client';
import { printDocument } from '../utils/printPdf';
import {
  EMPTY_SUPPORT,
  Metric,
  Panel,
  StatusPill,
  buildPacketText,
  checklistStatusCount,
  formatLabel,
} from './caseShared';

function ActionLink({ to, title, detail }) {
  return (
    <Link
      to={to}
      className="block rounded-md border border-border px-3 py-3 text-sm transition-colors hover:border-accent/40 hover:bg-surface-alt"
    >
      <span className="font-semibold text-text">{title}</span>
      <span className="mt-1 block leading-relaxed text-text-dim">{detail}</span>
    </Link>
  );
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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

  const result = evaluation?.result;
  const issueCategories = caseRecord?.intake?.issue_categories?.length
    ? caseRecord.intake.issue_categories
    : [caseRecord?.intake?.issue_type].filter(Boolean);
  const indexedCount = documents.filter((doc) => ['indexed', 'complete'].includes(doc.processing_status || doc.status)).length;
  const reviewCount = documents.filter((doc) => (doc.processing_status || doc.status) === 'needs_review').length;
  const missingCount = checklistStatusCount(checklist, 'missing') + checklistStatusCount(checklist, 'recommended');
  const activeRecordCount = recordsDrafts.length;
  const anySupport = supportForm.attorney_contact_opt_in || supportForm.advocacy_contact_opt_in || supportForm.media_contact_opt_in;

  const nextActions = useMemo(() => {
    const actions = [];
    if (!documents.length) actions.push('Add the strongest document, email, screenshot, or incident note to the Evidence Locker.');
    if (!evaluation) actions.push('Run the free evaluation so USDWatch can organize the first case read.');
    if (missingCount > 0) actions.push('Review missing evidence and decide which records requests should be sent first.');
    if (!packet) actions.push('Open the packet tab after evaluation to print a self-advocacy plan.');
    return actions.length ? actions.slice(0, 4) : ['Keep evidence current, track records responses, and refresh the evaluation when something important changes.'];
  }, [documents.length, evaluation, missingCount, packet]);

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
      setError(err.message || 'Failed to start evaluation');
    } finally {
      setBusy(false);
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
          <h2 className="text-3xl font-bold tracking-tight">{caseRecord.title}</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-text-dim">
            A calmer working desk for your story, evidence, records requests, evaluation, and self-advocacy packet.
          </p>
          <div className="flex flex-wrap gap-2">
            <StatusPill status={caseRecord.intake?.urgency_level || 'routine'} />
            {issueCategories.map((category) => <StatusPill key={category} status={category} />)}
            {caseRecord.intake?.safety_risk && <StatusPill status="safety risk" />}
            {caseRecord.intake?.retaliation_concern && <StatusPill status="retaliation concern" />}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            disabled={busy || !packet}
            onClick={handlePrintPacket}
            className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60"
          >
            Print Packet
          </button>
          <button
            disabled={busy}
            onClick={handleExportCase}
            className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60"
          >
            Export Case
          </button>
          <button
            disabled={busy}
            onClick={handleRunEvaluation}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {evaluation ? 'Refresh Evaluation' : 'Run Evaluation'}
          </button>
        </div>
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Evidence Strength" value={formatLabel(result?.evidence_strength || packet?.evidence_strength || 'unknown')} detail="Current confidence from story and files." />
        <Metric label="Evidence Locker" value={documents.length} detail={`${indexedCount} indexed${reviewCount ? `, ${reviewCount} need review` : ''}`} />
        <Metric label="Gaps To Close" value={missingCount} detail="Missing or recommended evidence." />
        <Metric label="Records Requests" value={activeRecordCount} detail="Drafts and tracked requests." />
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <Panel title="What To Do Next" eyebrow="Case plan">
            <ol className="divide-y divide-border">
              {nextActions.map((action, index) => (
                <li key={action} className="grid grid-cols-[28px_1fr] gap-3 py-3 text-sm">
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-accent/40 text-xs font-bold text-accent">{index + 1}</span>
                  <span className="leading-relaxed text-text">{action}</span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Go To" eyebrow="Focused work">
            <div className="space-y-2">
              <ActionLink to="locker" title="Evidence Locker" detail="Upload, describe, review, and remove case files." />
              <ActionLink to="records" title="Records Requests" detail="Generate requests and track sent, partial, fulfilled, or denied responses." />
              <ActionLink to="evaluation" title="Evaluation" detail="Refresh USDWatch analysis after you add important evidence." />
              <ActionLink to="packet" title="Packet" detail="Print or export your self-advocacy packet." />
            </div>
          </Panel>
        </aside>

        <main className="space-y-5">
          <Panel title="What USDWatch Sees" eyebrow="Current read">
            <p className="max-w-3xl text-sm leading-relaxed text-text-dim">
              {packet?.what_usdwatch_sees || result?.executive_summary || 'Run an evaluation to generate a fuller case read.'}
            </p>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-text-dim">District</dt>
                <dd className="mt-1 text-text">{caseRecord.intake?.district || 'Not entered'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-text-dim">School</dt>
                <dd className="mt-1 text-text">{caseRecord.intake?.school || 'Not entered'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-text-dim">Impacted person</dt>
                <dd className="mt-1 text-text">
                  {caseRecord.intake?.grade_level || 'Grade not entered'}
                  {caseRecord.intake?.impacted_party_age ? `, age ${caseRecord.intake.impacted_party_age}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-text-dim">IEP / 504</dt>
                <dd className="mt-1 text-text">{formatLabel(caseRecord.intake?.iep_504_status || 'not specified')}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Support Options" eyebrow="Manual opt-in only">
            <p className="mb-4 max-w-3xl text-sm leading-relaxed text-text-dim">
              Default is no sharing. These preferences only allow USDWatch to manually review your case before any limited summary is shared with the support category you choose.
            </p>
            <div className="grid gap-3">
              <label className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={supportForm.attorney_contact_opt_in} onChange={(event) => updateSupportField('attorney_contact_opt_in', event.target.checked)} />
                <span><strong className="text-text">Attorney contact</strong><span className="block text-text-dim">I may want a qualified attorney to review whether this needs legal help.</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={supportForm.advocacy_contact_opt_in} onChange={(event) => updateSupportField('advocacy_contact_opt_in', event.target.checked)} />
                <span><strong className="text-text">Advocacy or parent-group support</strong><span className="block text-text-dim">I may want help with meetings, records requests, or complaint options.</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={supportForm.media_contact_opt_in} onChange={(event) => updateSupportField('media_contact_opt_in', event.target.checked)} />
                <span><strong className="text-text">Media interest</strong><span className="block text-text-dim">I may be open to a reporter if this appears to show a broader public problem.</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning/8 p-3 text-sm text-text-dim">
                <input type="checkbox" className="mt-1" checked={supportForm.share_summary_consent} onChange={(event) => updateSupportField('share_summary_consent', event.target.checked)} />
                I consent to USDWatch manually reviewing and preparing a limited case summary for the support categories I selected.
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                value={supportForm.contact_preference}
                onChange={(event) => updateSupportField('contact_preference', event.target.value)}
                placeholder="Best contact preference"
              />
              <input
                className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                value={supportForm.sensitivity_notes}
                onChange={(event) => updateSupportField('sensitivity_notes', event.target.value)}
                placeholder="Sensitivity notes"
              />
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                disabled={savingSupport}
                onClick={handleSaveSupport}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                Save Support Preferences
              </button>
              <button
                disabled={savingSupport}
                onClick={handleRevokeSupport}
                className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60"
              >
                Revoke Support Consent
              </button>
            </div>
          </Panel>
        </main>
      </div>
    </div>
  );
}
