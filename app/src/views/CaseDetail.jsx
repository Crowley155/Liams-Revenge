import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EvaluationResults from '../components/EvaluationResults';
import {
  deleteDocument,
  fetchCase,
  fetchCaseDocuments,
  fetchCaseExport,
  fetchEvidenceChecklist,
  fetchLatestEvaluation,
  fetchRecordsRequestDrafts,
  fetchSelfAdvocacyPacket,
  startCaseEvaluation,
  updateSupportConsent,
  uploadCaseDocument,
} from '../api/client';
import { printDocument } from '../utils/printPdf';

const EVIDENCE_TYPES = [
  { value: 'communications', label: 'Emails, texts, portal messages' },
  { value: 'incident_report', label: 'Incident report' },
  { value: 'iep_504', label: 'IEP, 504, evaluation, prior notice' },
  { value: 'meeting_notes', label: 'Meeting notes' },
  { value: 'photo', label: 'Photo or screenshot' },
  { value: 'medical', label: 'Medical or safety record' },
  { value: 'agency_letter', label: 'Agency or complaint letter' },
  { value: 'other', label: 'Other evidence' },
];

const EMPTY_SUPPORT = {
  attorney_contact_opt_in: false,
  advocacy_contact_opt_in: false,
  media_contact_opt_in: false,
  contact_preference: '',
  sensitivity_notes: '',
  share_summary_consent: false,
};

function formatLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusPill({ status }) {
  const style = {
    indexed: 'bg-success/15 text-success border-success/30',
    processing: 'bg-accent/15 text-accent border-accent/30',
    uploaded: 'bg-accent/15 text-accent border-accent/30',
    needs_review: 'bg-warning/15 text-warning border-warning/30',
    failed: 'bg-danger/15 text-danger border-danger/30',
    complete: 'bg-success/15 text-success border-success/30',
    recommended: 'bg-warning/15 text-warning border-warning/30',
    missing: 'bg-danger/15 text-danger border-danger/30',
  }[status] || 'bg-text-dim/10 text-text-dim border-border';

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}>
      {formatLabel(status || 'pending')}
    </span>
  );
}

function Panel({ title, eyebrow, action, children }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent/80">{eyebrow}</p>}
          <h3 className="text-lg font-bold tracking-tight">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, detail }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed text-text-dim">{detail}</p>}
    </div>
  );
}

function checklistStatusCount(items, status) {
  return (items || []).filter((item) => item.status === status).length;
}

function buildPacketText(packet, caseRecord) {
  if (!packet) return '';
  const lines = [
    packet.title,
    '',
    packet.disclaimer,
    '',
    'Case Summary',
    `District: ${caseRecord?.intake?.district || 'Not entered'}`,
    `School: ${caseRecord?.intake?.school || 'Not entered'}`,
    `Issue categories: ${(caseRecord?.intake?.issue_categories || [caseRecord?.intake?.issue_type]).filter(Boolean).map(formatLabel).join(', ') || 'Not entered'}`,
    `Urgency: ${formatLabel(caseRecord?.intake?.urgency_level || 'routine')}`,
    '',
    'Parent Story',
    packet.parent_story || 'No story entered.',
    '',
    'What USDWatch Sees',
    packet.what_usdwatch_sees || 'Run an evaluation to generate this section.',
    '',
    'Evidence Checklist',
    ...(packet.evidence_checklist || []).map((item) => `- [${formatLabel(item.status)}] ${item.item}: ${item.why_it_matters}`),
    '',
    'Records To Request',
    ...(packet.records_request_drafts || []).map((record) => [
      `${record.title} (${formatLabel(record.priority)})`,
      `Custodian: ${record.custodian || 'Records custodian'}`,
      `Why: ${record.reason}`,
      `Request language: ${record.request_language}`,
    ].join('\n')),
    '',
    'Questions To Ask The School',
    ...(packet.questions_to_ask_school || []).map((question) => `- ${question}`),
    '',
    'Next Steps',
    ...(packet.next_steps || []).map((step) => `- ${step}`),
  ];
  return lines.filter((line) => line !== undefined && line !== null).join('\n');
}

export default function CaseDetail() {
  const { caseId } = useParams();
  const [caseRecord, setCaseRecord] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [packet, setPacket] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [recordsDrafts, setRecordsDrafts] = useState([]);
  const [file, setFile] = useState(null);
  const [uploadMeta, setUploadMeta] = useState({
    evidenceType: 'communications',
    userDescription: '',
    documentDate: '',
    sourcePerson: '',
  });
  const [supportForm, setSupportForm] = useState(EMPTY_SUPPORT);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingSupport, setSavingSupport] = useState(false);

  const refreshArtifacts = useCallback(async () => {
    const [nextPacket, nextChecklist, nextRecords] = await Promise.all([
      fetchSelfAdvocacyPacket(caseId),
      fetchEvidenceChecklist(caseId),
      fetchRecordsRequestDrafts(caseId),
    ]);
    setPacket(nextPacket);
    setChecklist(nextChecklist.items || []);
    setRecordsDrafts(nextRecords.records || []);
  }, [caseId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [nextCase, nextDocs, nextEval, nextPacket, nextChecklist, nextRecords] = await Promise.all([
          fetchCase(caseId),
          fetchCaseDocuments(caseId),
          fetchLatestEvaluation(caseId),
          fetchSelfAdvocacyPacket(caseId),
          fetchEvidenceChecklist(caseId),
          fetchRecordsRequestDrafts(caseId),
        ]);
        if (!cancelled) {
          setCaseRecord(nextCase);
          setDocuments(nextDocs);
          setEvaluation(nextEval);
          setPacket(nextPacket);
          setChecklist(nextChecklist.items || []);
          setRecordsDrafts(nextRecords.records || []);
          setSupportForm({ ...EMPTY_SUPPORT, ...(nextCase.support_consent || {}) });
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  useEffect(() => {
    if (!evaluation || ['complete', 'failed'].includes(evaluation.status)) return undefined;
    const timer = window.setInterval(async () => {
      const next = await fetchLatestEvaluation(caseId);
      setEvaluation(next);
      if (next?.status === 'complete') {
        await refreshArtifacts();
      }
    }, 1800);
    return () => window.clearInterval(timer);
  }, [evaluation, caseId, refreshArtifacts]);

  const result = evaluation?.result;
  const issueCategories = caseRecord?.intake?.issue_categories?.length
    ? caseRecord.intake.issue_categories
    : [caseRecord?.intake?.issue_type].filter(Boolean);
  const missingCount = checklistStatusCount(checklist, 'missing') + checklistStatusCount(checklist, 'recommended');
  const anySupport = supportForm.attorney_contact_opt_in || supportForm.advocacy_contact_opt_in || supportForm.media_contact_opt_in;

  const nextActions = useMemo(() => {
    if (result?.next_steps?.length) return result.next_steps.slice(0, 4);
    const actions = ['Upload the strongest document or screenshot you already have.'];
    if (!evaluation) actions.push('Run the free evaluation to generate a first case read.');
    actions.push('Use the records request drafts to fill the biggest evidence gaps.');
    return actions;
  }, [evaluation, result]);

  const updateSupportField = (field, value) => {
    setSupportForm((current) => ({ ...current, [field]: value }));
  };

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const doc = await uploadCaseDocument(caseId, file, uploadMeta);
      setDocuments((current) => [doc, ...current]);
      setFile(null);
      setUploadMeta({
        evidenceType: 'communications',
        userDescription: '',
        documentDate: '',
        sourcePerson: '',
      });
      await refreshArtifacts();
    } catch (err) {
      setError(err.message);
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
      await refreshArtifacts();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRun = async () => {
    setBusy(true);
    setError('');
    try {
      const next = await startCaseEvaluation(caseId);
      setEvaluation(next);
    } catch (err) {
      setError(err.message);
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
      await refreshArtifacts();
    } catch (err) {
      setError(err.message);
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
      await refreshArtifacts();
    } catch (err) {
      setError(err.message);
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
      setError(err.message);
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
            Your private case workspace: story, Evidence Locker, evaluation, records drafts, and self-advocacy packet.
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
            disabled={busy}
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
            onClick={handleRun}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {evaluation ? 'Refresh Evaluation' : 'Run Evaluation'}
          </button>
        </div>
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Evidence Strength" value={formatLabel(result?.evidence_strength || packet?.evidence_strength || 'unknown')} detail="Based on the current story, documents, and gaps." />
        <Metric label="Evidence Locker" value={documents.length} detail={`${documents.filter((doc) => doc.processing_status === 'indexed' || doc.status === 'indexed').length} indexed`} />
        <Metric label="Gaps To Close" value={missingCount} detail="Recommended or missing items in the checklist." />
        <Metric label="Records Drafts" value={recordsDrafts.length} detail="Requests you can adapt before sending." />
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <Panel title="What To Do Today" eyebrow="Next actions">
            <ol className="space-y-2">
              {nextActions.map((action, index) => (
                <li key={action} className="grid grid-cols-[28px_1fr] gap-3 rounded-md border border-border bg-background p-3 text-sm">
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-accent/40 text-xs font-bold text-accent">{index + 1}</span>
                  <span className="leading-relaxed text-text">{action}</span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="What USDWatch Sees" eyebrow="Case read">
            <p className="text-sm leading-relaxed text-text-dim">
              {packet?.what_usdwatch_sees || 'Run an evaluation to generate a fuller case read.'}
            </p>
            <div className="mt-4 space-y-2 text-sm text-text-dim">
              <p><strong className="text-text">District:</strong> {caseRecord.intake?.district || 'Not entered'}</p>
              <p><strong className="text-text">School:</strong> {caseRecord.intake?.school || 'Not entered'}</p>
              <p><strong className="text-text">Impacted:</strong> {caseRecord.intake?.grade_level || 'Grade not entered'} {caseRecord.intake?.impacted_party_age ? `(age ${caseRecord.intake.impacted_party_age})` : ''}</p>
              <p><strong className="text-text">IEP / 504:</strong> {formatLabel(caseRecord.intake?.iep_504_status || 'not specified')}</p>
            </div>
          </Panel>

          <Panel title="Evidence Locker" eyebrow="Private files">
            <p className="mb-4 text-xs leading-relaxed text-text-dim">
              Your evidence is private to this workspace unless you explicitly choose to share a limited summary for support review.
            </p>
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.id} className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{doc.filename}</p>
                      <p className="mt-1 text-xs text-text-dim">
                        {formatLabel(doc.evidence_type || 'evidence')} {doc.document_date ? `- ${doc.document_date}` : ''}
                      </p>
                    </div>
                    <StatusPill status={doc.processing_status || doc.status} />
                  </div>
                  {doc.user_description && <p className="mt-2 text-xs leading-relaxed text-text-dim">{doc.user_description}</p>}
                  {doc.failure_reason && <p className="mt-2 text-xs text-danger">{doc.failure_reason}</p>}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDelete(doc.id)}
                    className="mt-3 text-xs font-semibold text-text-dim transition-colors hover:text-danger disabled:opacity-60"
                  >
                    Remove from locker
                  </button>
                </div>
              ))}
              {!documents.length && <p className="rounded-md border border-border bg-background p-3 text-sm text-text-dim">No evidence uploaded yet. You can still work from your story.</p>}
            </div>
            <div className="mt-4 space-y-3 border-t border-border pt-4">
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
                className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                value={uploadMeta.userDescription}
                onChange={(event) => setUploadMeta((current) => ({ ...current, userDescription: event.target.value }))}
                placeholder="Why this evidence matters"
              />
              <button
                disabled={!file || busy}
                onClick={handleUpload}
                className="w-full rounded-md border border-border px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface-alt disabled:opacity-60"
              >
                Add To Evidence Locker
              </button>
            </div>
          </Panel>
        </aside>

        <main className="space-y-5">
          <Panel title="Self-Advocacy Packet" eyebrow="Your working output">
            <div className="grid gap-3 md:grid-cols-2">
              {(packet?.evidence_checklist || checklist).slice(0, 6).map((item) => (
                <article key={item.item} className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-semibold leading-snug">{item.item}</h4>
                    <StatusPill status={item.status} />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-text-dim">{item.why_it_matters}</p>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Records To Request" eyebrow="Draft language">
            <div className="space-y-3">
              {recordsDrafts.map((record) => (
                <article key={`${record.title}-${record.custodian}`} className="rounded-md border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold">{record.title}</h4>
                    <StatusPill status={record.priority} />
                    {record.record_type && <StatusPill status={record.record_type} />}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-text-dim">{record.reason}</p>
                  <p className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-text">
                    {record.request_language}
                  </p>
                </article>
              ))}
              {!recordsDrafts.length && <p className="text-sm text-text-dim">Run an evaluation to generate records request drafts.</p>}
            </div>
          </Panel>

          <Panel title="Questions To Ask The School" eyebrow="Meeting prep">
            <div className="grid gap-3 md:grid-cols-2">
              {(packet?.questions_to_ask_school || []).map((question) => (
                <div key={question} className="rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-text">
                  {question}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Possible Escalation Paths" eyebrow="Options, not advice">
            <div className="grid gap-3 md:grid-cols-3">
              {(packet?.possible_escalation_paths || []).map((path) => (
                <div key={path} className="rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-text-dim">
                  {path}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Support Options" eyebrow="Manual opt-in only">
            <p className="mb-4 text-sm leading-relaxed text-text-dim">
              Default is no sharing. These preferences only let USDWatch manually review your case before any limited summary is shared with the support category you choose.
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

          <EvaluationResults evaluation={evaluation} />
        </main>
      </div>
    </div>
  );
}
