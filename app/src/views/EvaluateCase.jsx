import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, FileUp, Loader2, MessageSquareText, ShieldCheck, Trash2 } from 'lucide-react';
import EvaluationResults from '../components/EvaluationResults';
import {
  createCaseFromIntake,
  createIntakeSession,
  fetchCaseEvaluation,
  fetchCases,
  sendIntakeMessage,
  startCaseEvaluation,
  updateIntakeFacts,
  uploadCaseDocument,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';

const STEPS = [
  { key: 'advocate', label: 'Case Advocate' },
  { key: 'evidence', label: 'Evidence Locker' },
  { key: 'support', label: 'Support Preferences' },
  { key: 'review', label: 'Review & Create' },
];

const ISSUE_OPTIONS = [
  { value: 'student_safety', label: 'Safety or supervision' },
  { value: 'special_education', label: 'IEP, 504, or services' },
  { value: 'bullying_harassment', label: 'Bullying or harassment' },
  { value: 'discipline', label: 'Discipline or suspension' },
  { value: 'records', label: 'Records access' },
  { value: 'retaliation', label: 'Retaliation concern' },
  { value: 'other', label: 'Something else' },
];

const EMPTY_SUPPORT = {
  attorney_contact_opt_in: false,
  advocacy_contact_opt_in: false,
  media_contact_opt_in: false,
  contact_preference: '',
  sensitivity_notes: '',
  share_summary_consent: false,
};

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.tiff,.tif,.webp,.bmp,.docx,.eml,.txt,.md';
const IMAGE_COMPRESS_THRESHOLD = 10 * 1024 * 1024;
const MAX_DIMENSION = 2600;

function formatBytes(value = 0) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeFactValue(field, value) {
  if (field === 'impacted_party_age' || field === 'student_age') {
    return value === '' ? null : Number(value);
  }
  return value;
}

function statusClass(status) {
  return {
    uploaded: 'border-accent/30 bg-accent/10 text-accent',
    processing: 'border-accent/30 bg-accent/10 text-accent',
    indexed: 'border-success/30 bg-success/10 text-success',
    needs_review: 'border-warning/30 bg-warning/10 text-warning',
    failed: 'border-danger/30 bg-danger/10 text-danger',
  }[status] || 'border-border bg-surface text-text-dim';
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

function StepNav({ activeStep, setStepIndex }) {
  return (
    <div className="space-y-2">
      {STEPS.map((step, index) => (
        <button
          key={step.key}
          type="button"
          onClick={() => setStepIndex(index)}
          className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
            step.key === activeStep
              ? 'border-accent bg-accent/12 text-text'
              : 'border-border bg-surface text-text-dim hover:text-text'
          }`}
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-[11px]">
            {index + 1}
          </span>
          {step.label}
        </button>
      ))}
    </div>
  );
}

function FactInput({ label, value, onChange, type = 'text' }) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{label}</span>
      <input
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        type={type}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function FactsPanel({ session, onPatch }) {
  const facts = session?.facts || {};
  const issueCategories = facts.issue_categories || [];
  const toggleIssue = (value) => {
    const next = issueCategories.includes(value)
      ? issueCategories.filter((item) => item !== value)
      : [...issueCategories, value];
    onPatch({ issue_categories: next.length ? next : ['other'], issue_type: next[0] || 'other' });
  };

  return (
    <aside className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/80">What we understand so far</p>
        <p className="mt-2 text-xs leading-relaxed text-text-dim">
          These facts are draft notes from the conversation. You can correct anything before creating the case.
        </p>
      </div>
      <div className="grid gap-3">
        <FactInput label="Working title" value={facts.title} onChange={(value) => onPatch({ title: value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FactInput label="District or agency" value={facts.district} onChange={(value) => onPatch({ district: value })} />
          <FactInput label="School or program" value={facts.school} onChange={(value) => onPatch({ school: value })} />
          <FactInput label="State" value={facts.state} onChange={(value) => onPatch({ state: value.toUpperCase() })} />
          <FactInput label="Approx. date" value={facts.incident_date} onChange={(value) => onPatch({ incident_date: value || null })} />
          <FactInput label="Age" type="number" value={facts.impacted_party_age || ''} onChange={(value) => onPatch({ impacted_party_age: normalizeFactValue('impacted_party_age', value), student_age: normalizeFactValue('student_age', value) })} />
          <FactInput label="Grade" value={facts.grade_level} onChange={(value) => onPatch({ grade_level: value })} />
        </div>
        <label className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">Urgency</span>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            value={facts.urgency_level || 'routine'}
            onChange={(event) => onPatch({ urgency_level: event.target.value, urgent: event.target.value !== 'routine' })}
          >
            <option value="routine">Important, not immediate</option>
            <option value="urgent">Needs action soon</option>
            <option value="immediate">Immediate safety or placement concern</option>
          </select>
        </label>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-dim">Issue tags</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ISSUE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleIssue(option.value)}
                className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  issueCategories.includes(option.value)
                    ? 'border-accent bg-accent/12 text-text'
                    : 'border-border bg-background text-text-dim hover:border-accent/50 hover:text-text'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <textarea
          className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          value={facts.desired_outcome || ''}
          onChange={(event) => onPatch({ desired_outcome: event.target.value, desired_outcomes: event.target.value ? [event.target.value] : [] })}
          placeholder="Desired outcome, if you know it"
        />
        <div className="grid gap-2 text-sm text-text-dim sm:grid-cols-2">
          <label className="flex items-start gap-2 rounded-md border border-border bg-background p-3">
            <input type="checkbox" className="mt-1" checked={Boolean(facts.safety_risk)} onChange={(event) => onPatch({ safety_risk: event.target.checked, urgent: event.target.checked || facts.urgency_level !== 'routine' })} />
            Current safety concern
          </label>
          <label className="flex items-start gap-2 rounded-md border border-border bg-background p-3">
            <input type="checkbox" className="mt-1" checked={Boolean(facts.retaliation_concern)} onChange={(event) => onPatch({ retaliation_concern: event.target.checked })} />
            Retaliation concern
          </label>
        </div>
      </div>
    </aside>
  );
}

export default function EvaluateCase() {
  const { entitlements } = useAuth();
  const navigate = useNavigate();
  const chatEndRef = useRef(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [session, setSession] = useState(null);
  const [message, setMessage] = useState('');
  const [lockerItems, setLockerItems] = useState([]);
  const [supportConsent, setSupportConsent] = useState(EMPTY_SUPPORT);
  const [cases, setCases] = useState([]);
  const [createdCase, setCreatedCase] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const activeStep = STEPS[stepIndex].key;
  const facts = session?.facts || {};
  const freeLimitReached = entitlements?.plan === 'free' && cases.length >= entitlements.max_active_cases && !createdCase;
  const hasStory = (facts.narrative || '').trim().length >= 20 || (session?.messages || []).some((item) => item.role === 'user' && item.content.trim().length >= 20);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCases().catch(() => []),
      createIntakeSession(),
    ]).then(([caseItems, nextSession]) => {
      if (cancelled) return;
      setCases(caseItems.filter((item) => item.status === 'active'));
      setSession(nextSession);
    }).catch((err) => {
      if (!cancelled) setError(err.message || 'Failed to start Case Advocate');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session?.messages?.length]);

  useEffect(() => {
    if (!createdCase || !evaluation || ['complete', 'failed'].includes(evaluation.status)) return undefined;
    const timer = window.setInterval(async () => {
      const next = await fetchCaseEvaluation(createdCase.id, evaluation.id);
      setEvaluation(next);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [createdCase, evaluation]);

  const canContinue = useMemo(() => {
    if (activeStep === 'advocate') return hasStory;
    return true;
  }, [activeStep, hasStory]);

  const updateConsent = (field, value) => {
    setSupportConsent((current) => ({ ...current, [field]: value }));
  };

  const patchFacts = async (patch) => {
    if (!session) return;
    const localFacts = { ...session.facts, ...patch };
    setSession((current) => current ? { ...current, facts: localFacts } : current);
    try {
      const next = await updateIntakeFacts(session.id, patch);
      setSession(next);
    } catch (err) {
      setError(err.message || 'Failed to update facts');
    }
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const content = message.trim();
    if (!content || !session) return;
    setMessage('');
    setSending(true);
    setError('');
    const optimistic = {
      ...session,
      messages: [...session.messages, { id: `local-${Date.now()}`, role: 'user', content, created_at: new Date().toISOString() }],
    };
    setSession(optimistic);
    try {
      setSession(await sendIntakeMessage(session.id, content));
    } catch (err) {
      setError(err.message || 'Case Advocate could not respond');
    } finally {
      setSending(false);
    }
  };

  const addLockerFiles = (files) => {
    const next = Array.from(files || []).map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
      file,
      status: 'uploaded',
      compressed: false,
    }));
    setLockerItems((current) => [...current, ...next]);
  };

  const updateLockerItem = (id, patch) => {
    setLockerItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const removeLockerItem = (id) => {
    setLockerItems((current) => current.filter((item) => item.id !== id));
  };

  const goNext = () => {
    setError('');
    if (!canContinue) {
      setError('Tell the Case Advocate a little about what happened first. You can be messy; USDWatch will organize it.');
      return;
    }
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const handleCreateCase = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const anySupport = supportConsent.attorney_contact_opt_in || supportConsent.advocacy_contact_opt_in || supportConsent.media_contact_opt_in;
      const consent = { ...supportConsent, share_summary_consent: anySupport ? supportConsent.share_summary_consent : false };
      const nextCase = await createCaseFromIntake(session.id, consent);
      setCreatedCase(nextCase);

      for (const item of lockerItems) {
        updateLockerItem(item.id, { status: 'processing' });
        try {
          const prepared = await maybeCompressImage(item.file);
          const uploaded = await uploadCaseDocument(nextCase.id, prepared.file, {});
          updateLockerItem(item.id, {
            status: uploaded.processing_status || uploaded.status,
            uploaded,
            compressed: prepared.compressed,
          });
        } catch (uploadError) {
          updateLockerItem(item.id, { status: 'failed', failureReason: uploadError.message });
        }
      }

      const nextEvaluation = await startCaseEvaluation(nextCase.id);
      setEvaluation(nextEvaluation);
      setCases((current) => [nextCase, ...current]);
    } catch (err) {
      setError(err.message || 'Failed to create case');
    } finally {
      setLoading(false);
    }
  };

  if (freeLimitReached) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 py-10 animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Workspace</p>
        <h2 className="text-3xl font-bold tracking-tight">Your free case is ready</h2>
        <p className="text-sm leading-relaxed text-text-dim">The free tier includes one active case evaluation. Continue from your case workspace.</p>
        <div className="grid gap-3">
          {cases.map((item) => (
            <button key={item.id} onClick={() => navigate(`/cases/${item.id}`)} className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/60">
              <span className="block font-semibold">{item.title}</span>
              <span className="block text-sm text-text-dim">{item.intake?.district || item.intake?.school || 'Private case'}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl py-8 animate-fade-up">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Evaluate My Case</p>
            <h2 className="text-3xl font-bold tracking-tight">Case Advocate</h2>
            <p className="text-sm leading-relaxed text-text-dim">
              Tell USDWatch what happened. We will organize the facts, ask what matters next, and help build your first case file.
            </p>
          </div>
          <StepNav activeStep={activeStep} setStepIndex={setStepIndex} />
          <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-text-dim">
            Your Evidence Locker stays private to your workspace unless you explicitly authorize a limited support summary.
          </p>
          <Link to="/cases" className="text-sm font-semibold text-accent hover:text-accent-hover">View cases</Link>
        </aside>

        <main className="space-y-6">
          {activeStep === 'advocate' && (
            <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-start gap-3 border-b border-border pb-4">
                  <MessageSquareText className="mt-1 h-5 w-5 text-accent" aria-hidden="true" />
                  <div>
                    <h3 className="text-2xl font-bold">Talk to the Case Advocate</h3>
                    <p className="mt-1 text-sm leading-relaxed text-text-dim">
                      Start anywhere. You do not need to know the legal category, exact date, district name, or what records to request.
                    </p>
                  </div>
                </div>
                <div className="max-h-[520px] space-y-3 overflow-y-auto py-4 pr-1">
                  {(session?.messages || []).map((item) => (
                    <div key={item.id} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[86%] rounded-lg border px-4 py-3 text-sm leading-relaxed ${
                        item.role === 'user'
                          ? 'border-accent/30 bg-accent/12 text-text'
                          : 'border-border bg-background text-text-dim'
                      }`}>
                        {item.content}
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="flex items-center gap-2 text-sm text-text-dim">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      USDWatch is organizing the facts...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSend} className="border-t border-border pt-4">
                  <textarea
                    className="min-h-28 w-full rounded-md border border-border bg-background px-3 py-3 text-sm leading-relaxed outline-none focus:border-accent"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="What happened? What did the school say? What have you already tried? What are you worried will happen next?"
                  />
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-text-dim">The structured facts update after each message. You can override them on the right.</p>
                    <button type="submit" disabled={!message.trim() || sending} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                      {sending ? 'Reading...' : 'Send to Advocate'}
                    </button>
                  </div>
                </form>
              </div>
              <FactsPanel session={session} onPatch={patchFacts} />
            </section>
          )}

          {activeStep === 'evidence' && (
            <section className="space-y-5">
              <div>
                <h3 className="text-2xl font-bold">Evidence Locker</h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-dim">
                  Add whatever you have: emails, screenshots, PDFs, IEP or 504 records, incident reports, meeting notes, photos, and agency letters. USDWatch will infer categories after upload.
                </p>
              </div>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center transition-colors hover:border-accent/60">
                <FileUp className="h-8 w-8 text-accent" aria-hidden="true" />
                <span className="mt-3 text-sm font-semibold text-text">Drop files here or browse</span>
                <span className="mt-1 max-w-xl text-xs leading-relaxed text-text-dim">
                  Multiple files are fine. Up to 50 MB each. Large images may be compressed for storage and indexing while keeping the evidence usable.
                </span>
                <input className="hidden" type="file" multiple accept={ACCEPTED} onChange={(event) => addLockerFiles(event.target.files)} />
              </label>
              <div className="space-y-3">
                {lockerItems.map((item) => (
                  <article key={item.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-sm font-semibold">{item.file.name}</h4>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass(item.status)}`}>
                            {formatLabel(item.status)}
                          </span>
                          {item.compressed && <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">Compressed copy</span>}
                        </div>
                        <p className="mt-1 text-xs text-text-dim">{formatBytes(item.file.size)}</p>
                      </div>
                      <button type="button" onClick={() => removeLockerItem(item.id)} className="rounded-md p-2 text-text-dim transition-colors hover:bg-danger/10 hover:text-danger" title="Remove from upload queue" aria-label={`Remove ${item.file.name}`}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    {item.failureReason && <p className="mt-3 text-xs text-danger">{item.failureReason}</p>}
                  </article>
                ))}
                {!lockerItems.length && (
                  <div className="rounded-lg border border-border bg-surface p-4 text-sm text-text-dim">
                    No evidence uploaded yet. You can still create the first case file from the conversation and add documents later.
                  </div>
                )}
              </div>
            </section>
          )}

          {activeStep === 'support' && (
            <section className="space-y-5">
              <div>
                <h3 className="text-2xl font-bold">Support Preferences</h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-dim">
                  This is optional. Default is no sharing. Each support path needs separate consent and human review.
                </p>
              </div>
              <div className="grid gap-3">
                {[
                  ['attorney_contact_opt_in', 'Attorney contact', 'I may want a qualified attorney to review whether this needs legal help.'],
                  ['advocacy_contact_opt_in', 'Advocacy or parent-group support', 'I may want help preparing for meetings, records requests, or complaint options.'],
                  ['media_contact_opt_in', 'Media interest', 'I may be open to a reporter if the case appears to show a broader public problem.'],
                ].map(([field, title, description]) => (
                  <label key={field} className="flex items-start gap-3 rounded-md border border-border bg-surface p-4 text-sm">
                    <input type="checkbox" className="mt-1" checked={supportConsent[field]} onChange={(event) => updateConsent(field, event.target.checked)} />
                    <span><strong className="text-text">{title}</strong><span className="block text-text-dim">{description}</span></span>
                  </label>
                ))}
              </div>
              <label className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning/8 p-4 text-sm text-text-dim">
                <input type="checkbox" className="mt-1" checked={supportConsent.share_summary_consent} onChange={(event) => updateConsent('share_summary_consent', event.target.checked)} />
                I authorize USDWatch to manually review my case and prepare a limited case summary for the support categories I selected. USDWatch will not publicly post or share my case without separate permission.
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <input className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={supportConsent.contact_preference} onChange={(event) => updateConsent('contact_preference', event.target.value)} placeholder="Best way to contact you" />
                <input className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={supportConsent.sensitivity_notes} onChange={(event) => updateConsent('sensitivity_notes', event.target.value)} placeholder="Sensitivity notes" />
              </div>
            </section>
          )}

          {activeStep === 'review' && (
            <section className="space-y-5">
              <div>
                <h3 className="text-2xl font-bold">Review & create your case file</h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-dim">
                  USDWatch will create your private case, upload queued Evidence Locker files, and start a first-pass evaluation. Your Self-Advocacy Packet is generated from the case after evaluation.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-xs uppercase tracking-wide text-text-dim">Case Advocate</p>
                  <p className="mt-2 text-sm text-text">{(facts.narrative || '').slice(0, 170) || 'No story yet'}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-xs uppercase tracking-wide text-text-dim">Draft facts</p>
                  <p className="mt-2 text-sm text-text">{facts.district || facts.school || 'District/school not identified yet'}</p>
                  <p className="mt-1 text-xs text-text-dim">{(facts.issue_categories || []).map(formatLabel).join(', ') || 'Issue tags pending'}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-xs uppercase tracking-wide text-text-dim">Evidence Locker</p>
                  <p className="mt-2 text-sm text-text">{lockerItems.length} file{lockerItems.length === 1 ? '' : 's'} queued</p>
                  <p className="mt-1 text-xs text-text-dim">Private unless you explicitly share a support summary.</p>
                </div>
              </div>
              {createdCase ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 rounded-lg border border-success/30 bg-success/8 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                      <div>
                        <h3 className="font-semibold">{createdCase.title}</h3>
                        <p className="text-xs text-text-dim">Your case file is created and the evaluation is running.</p>
                      </div>
                    </div>
                    <Link to={`/cases/${createdCase.id}`} className="text-sm font-semibold text-accent hover:text-accent-hover">Open case</Link>
                  </div>
                  <EvaluationResults evaluation={evaluation} />
                </div>
              ) : (
                <button disabled={loading || !hasStory} onClick={handleCreateCase} className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                  {loading ? 'Creating your case...' : 'Create Case File & Run Evaluation'}
                </button>
              )}
            </section>
          )}

          {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          {!createdCase && (
            <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" disabled={stepIndex === 0 || loading} onClick={() => setStepIndex((current) => Math.max(0, current - 1))} className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt disabled:opacity-40">
                Back
              </button>
              {activeStep !== 'review' && (
                <button type="button" onClick={goNext} disabled={loading} className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                  Continue
                </button>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
