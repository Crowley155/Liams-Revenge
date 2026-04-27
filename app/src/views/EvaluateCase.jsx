import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import EvaluationResults from '../components/EvaluationResults';
import {
  createCase,
  fetchCaseEvaluation,
  fetchCases,
  startCaseEvaluation,
  uploadCaseDocument,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';

const ISSUE_OPTIONS = [
  { value: 'student_safety', label: 'Safety or supervision' },
  { value: 'special_education', label: 'IEP, 504, or services' },
  { value: 'bullying_harassment', label: 'Bullying or harassment' },
  { value: 'discipline', label: 'Discipline or suspension' },
  { value: 'records', label: 'Records access' },
  { value: 'retaliation', label: 'Retaliation concern' },
  { value: 'other', label: 'Something else' },
];

const PRIOR_ACTIONS = [
  'Contacted teacher or staff',
  'Contacted principal',
  'Contacted district office',
  'Requested records',
  'Filed a complaint',
  'Met with the school',
  'Contacted an agency',
];

const OUTCOME_OPTIONS = [
  'Understand what records to request',
  'Prepare for a school meeting',
  'Document safety concerns',
  'Evaluate complaint options',
  'Find attorney or advocate support',
  'Prepare a public accountability story',
];

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

const STEPS = [
  { key: 'story', label: 'Your story' },
  { key: 'impacted', label: 'Who was impacted' },
  { key: 'evidence', label: 'Evidence Locker' },
  { key: 'actions', label: 'What you tried' },
  { key: 'support', label: 'Support preferences' },
  { key: 'review', label: 'Review' },
];

const initialForm = {
  title: '',
  state: 'KS',
  district: '',
  school: '',
  issue_type: 'student_safety',
  issue_categories: ['student_safety'],
  incident_date: '',
  narrative: '',
  desired_outcomes: ['Understand what records to request'],
  desired_outcome: '',
  student_age: '',
  impacted_party_age: '',
  grade_level: '',
  school_setting: '',
  relationship_to_child: 'parent_guardian',
  iep_504_status: '',
  urgency_level: 'routine',
  safety_risk: false,
  retaliation_concern: false,
  prior_actions: [],
  urgent: false,
  support_consent: {
    attorney_contact_opt_in: false,
    advocacy_contact_opt_in: false,
    media_contact_opt_in: false,
    contact_preference: '',
    sensitivity_notes: '',
    share_summary_consent: false,
  },
};

function toggleListValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function FieldLabel({ children, hint }) {
  return (
    <label className="block space-y-2">
      <span className="block text-xs font-semibold uppercase tracking-wide text-text-dim">{children}</span>
      {hint && <span className="block text-xs leading-relaxed text-text-dim/80">{hint}</span>}
    </label>
  );
}

function ChoiceButton({ selected, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
        selected
          ? 'border-accent bg-accent/12 text-text'
          : 'border-border bg-background text-text-dim hover:border-accent/50 hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }) {
  const style = {
    indexed: 'bg-success/15 text-success',
    processing: 'bg-accent/15 text-accent',
    uploaded: 'bg-accent/15 text-accent',
    needs_review: 'bg-warning/15 text-warning',
    failed: 'bg-danger/15 text-danger',
  }[status] || 'bg-text-dim/15 text-text-dim';
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}>{status}</span>;
}

export default function EvaluateCase() {
  const { entitlements } = useAuth();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [lockerItems, setLockerItems] = useState([]);
  const [cases, setCases] = useState([]);
  const [createdCase, setCreatedCase] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchCases()
      .then((items) => {
        if (!cancelled) setCases(items.filter((item) => item.status === 'active'));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!createdCase || !evaluation || ['complete', 'failed'].includes(evaluation.status)) return undefined;
    const timer = window.setInterval(async () => {
      const next = await fetchCaseEvaluation(createdCase.id, evaluation.id);
      setEvaluation(next);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [createdCase, evaluation]);

  const activeStep = STEPS[stepIndex];
  const freeLimitReached = entitlements?.plan === 'free' && cases.length >= entitlements.max_active_cases && !createdCase;
  const canGoNext = useMemo(() => {
    if (activeStep.key === 'story') return form.narrative.trim().length >= 20 && form.district.trim();
    if (activeStep.key === 'impacted') return form.relationship_to_child && (form.impacted_party_age || form.grade_level);
    return true;
  }, [activeStep.key, form]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateConsent = (field, value) => {
    setForm((current) => ({
      ...current,
      support_consent: { ...current.support_consent, [field]: value },
    }));
  };

  const addLockerFiles = (files) => {
    const next = Array.from(files || []).map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
      file,
      evidenceType: 'communications',
      userDescription: '',
      documentDate: '',
      sourcePerson: '',
      status: 'uploaded',
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
    if (!canGoNext) {
      setError(activeStep.key === 'story'
        ? 'Start with a short story and the district name. You can refine it later.'
        : 'Tell us who was impacted so the packet can be tailored.');
      return;
    }
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const supportConsent = { ...form.support_consent };
      const anySupport = supportConsent.attorney_contact_opt_in || supportConsent.advocacy_contact_opt_in || supportConsent.media_contact_opt_in;
      if (!anySupport) supportConsent.share_summary_consent = false;

      const payload = {
        ...form,
        support_consent: supportConsent,
        title: form.title || `${form.district || 'School'} case`,
        student_age: form.impacted_party_age ? Number(form.impacted_party_age) : (form.student_age ? Number(form.student_age) : null),
        impacted_party_age: form.impacted_party_age ? Number(form.impacted_party_age) : null,
        incident_date: form.incident_date || null,
        desired_outcome: form.desired_outcome || form.desired_outcomes.join('; '),
        urgent: form.urgency_level !== 'routine' || form.safety_risk,
      };
      const nextCase = await createCase(payload);
      setCreatedCase(nextCase);

      for (const item of lockerItems) {
        updateLockerItem(item.id, { status: 'processing' });
        try {
          const uploaded = await uploadCaseDocument(nextCase.id, item.file, item);
          updateLockerItem(item.id, { status: uploaded.processing_status || uploaded.status, uploaded });
        } catch (uploadError) {
          updateLockerItem(item.id, { status: 'failed', failureReason: uploadError.message });
        }
      }

      const nextEvaluation = await startCaseEvaluation(nextCase.id);
      setEvaluation(nextEvaluation);
      setCases((current) => [nextCase, ...current]);
      setStepIndex(STEPS.length - 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (freeLimitReached) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 py-10 animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Workspace</p>
        <h2 className="text-3xl font-bold tracking-tight">Your free case is ready</h2>
        <p className="text-sm leading-relaxed text-text-dim">
          The free tier includes one active case evaluation. Continue from your case workspace.
        </p>
        <div className="grid gap-3">
          {cases.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(`/cases/${item.id}`)}
              className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/60"
            >
              <span className="block font-semibold">{item.title}</span>
              <span className="block text-sm text-text-dim">{item.intake?.district || item.intake?.state}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl py-8 animate-fade-up">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Evaluate My Case</p>
            <h2 className="text-3xl font-bold tracking-tight">Share your story in your own words.</h2>
            <p className="text-sm leading-relaxed text-text-dim">
              We will help organize the facts, spot gaps, and build a self-advocacy packet you can use.
            </p>
          </div>
          <div className="space-y-2">
            {STEPS.map((step, index) => (
              <button
                key={step.key}
                type="button"
                onClick={() => setStepIndex(index)}
                className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  index === stepIndex
                    ? 'border-accent bg-accent/12 text-text'
                    : index < stepIndex
                      ? 'border-success/30 bg-success/8 text-text'
                      : 'border-border bg-surface text-text-dim hover:text-text'
                }`}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-[11px]">{index + 1}</span>
                {step.label}
              </button>
            ))}
          </div>
          <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-text-dim">
            Evidence in your locker stays private to your workspace unless you explicitly choose to share a summary for support.
          </p>
          <Link to="/cases" className="text-sm font-semibold text-accent hover:text-accent-hover">
            View cases
          </Link>
        </aside>

        <form onSubmit={handleSubmit} className="space-y-6">
          {activeStep.key === 'story' && (
            <section className="space-y-5">
              <div>
                <h3 className="text-2xl font-bold">What happened?</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-dim">
                  Do not worry about sounding legal. Tell it the way you would tell a trusted advocate: what happened, who was involved, and what worries you now.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FieldLabel hint="Example: USD 232, Chicago Public Schools, Austin ISD">District</FieldLabel>
                <input className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.district} onChange={(event) => updateField('district', event.target.value)} required />
                <FieldLabel>School</FieldLabel>
                <input className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.school} onChange={(event) => updateField('school', event.target.value)} />
                <FieldLabel>State</FieldLabel>
                <input className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.state} onChange={(event) => updateField('state', event.target.value)} />
                <FieldLabel>Approximate incident date</FieldLabel>
                <input className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" type="date" value={form.incident_date} onChange={(event) => updateField('incident_date', event.target.value)} />
              </div>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Share your story</span>
                <textarea
                  className="min-h-56 w-full rounded-md border border-border bg-background px-3 py-3 text-sm leading-relaxed outline-none focus:border-accent"
                  value={form.narrative}
                  onChange={(event) => updateField('narrative', event.target.value)}
                  placeholder="Start wherever it makes sense. What happened? What did the school say? What did you try? What are you afraid will happen next?"
                  required
                />
              </label>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-dim">What kind of issue is this?</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {ISSUE_OPTIONS.map((option) => (
                    <ChoiceButton
                      key={option.value}
                      selected={form.issue_categories.includes(option.value)}
                      onClick={() => {
                        const next = toggleListValue(form.issue_categories, option.value);
                        updateField('issue_categories', next.length ? next : [option.value]);
                        updateField('issue_type', next[0] || option.value);
                      }}
                    >
                      {option.label}
                    </ChoiceButton>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeStep.key === 'impacted' && (
            <section className="space-y-5">
              <div>
                <h3 className="text-2xl font-bold">Who was impacted?</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-dim">
                  A kindergarten safety case, a high-school discipline case, and a 504 services case need different questions. This helps tailor the packet.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Your relationship</span>
                  <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.relationship_to_child} onChange={(event) => updateField('relationship_to_child', event.target.value)}>
                    <option value="parent_guardian">Parent or guardian</option>
                    <option value="family_member">Family member</option>
                    <option value="advocate">Advocate helping the family</option>
                    <option value="attorney">Attorney</option>
                    <option value="other_authorized_helper">Other authorized helper</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Age</span>
                  <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" type="number" min="3" max="22" value={form.impacted_party_age} onChange={(event) => updateField('impacted_party_age', event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Grade level</span>
                  <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.grade_level} onChange={(event) => updateField('grade_level', event.target.value)} placeholder="Kindergarten, 7th grade, senior..." />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">School setting</span>
                  <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.school_setting} onChange={(event) => updateField('school_setting', event.target.value)} placeholder="Public school, charter, after-school program..." />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">IEP / 504 status</span>
                  <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.iep_504_status} onChange={(event) => updateField('iep_504_status', event.target.value)}>
                    <option value="">Not sure or not applicable</option>
                    <option value="iep">Has an IEP</option>
                    <option value="504">Has a 504 plan</option>
                    <option value="evaluation_requested">Evaluation requested</option>
                    <option value="suspected_disability">Suspected disability</option>
                    <option value="denied_services">Denied services or accommodations</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Urgency</span>
                  <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.urgency_level} onChange={(event) => updateField('urgency_level', event.target.value)}>
                    <option value="routine">Important, but not immediate</option>
                    <option value="urgent">Needs action soon</option>
                    <option value="immediate">Immediate safety or placement concern</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-3 rounded-md border border-border bg-surface p-3 text-sm text-text-dim">
                  <input type="checkbox" className="mt-1" checked={form.safety_risk} onChange={(event) => updateField('safety_risk', event.target.checked)} />
                  There is a current safety concern.
                </label>
                <label className="flex items-start gap-3 rounded-md border border-border bg-surface p-3 text-sm text-text-dim">
                  <input type="checkbox" className="mt-1" checked={form.retaliation_concern} onChange={(event) => updateField('retaliation_concern', event.target.checked)} />
                  I am worried about retaliation if I push harder.
                </label>
              </div>
            </section>
          )}

          {activeStep.key === 'evidence' && (
            <section className="space-y-5">
              <div>
                <h3 className="text-2xl font-bold">Evidence Locker</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-dim">
                  Upload what you have. Emails, screenshots, IEP or 504 records, incident reports, meeting notes, photos, and agency letters all help. You can still run an evaluation without documents.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-background px-4 py-8 text-center transition-colors hover:border-accent/60">
                  <span className="text-sm font-semibold text-text">Add evidence to your locker</span>
                  <span className="mt-1 text-xs text-text-dim">PDF, image, Word, email, text, or markdown. Up to 15 MB each.</span>
                  <input className="hidden" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.webp,.bmp,.docx,.eml,.txt,.md" onChange={(event) => addLockerFiles(event.target.files)} />
                </label>
              </div>
              <div className="space-y-3">
                {lockerItems.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">{item.file.name}</p>
                          <StatusPill status={item.status} />
                        </div>
                        <p className="mt-1 text-xs text-text-dim">{(item.file.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button type="button" onClick={() => removeLockerItem(item.id)} className="text-xs font-semibold text-text-dim hover:text-danger">
                        Remove
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs text-text-dim">Evidence type</span>
                        <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={item.evidenceType} onChange={(event) => updateLockerItem(item.id, { evidenceType: event.target.value })}>
                          {EVIDENCE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-text-dim">Document date</span>
                        <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" type="date" value={item.documentDate} onChange={(event) => updateLockerItem(item.id, { documentDate: event.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-text-dim">Who is this from?</span>
                        <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={item.sourcePerson} onChange={(event) => updateLockerItem(item.id, { sourcePerson: event.target.value })} placeholder="Principal, teacher, district, doctor..." />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-text-dim">Why it matters</span>
                        <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={item.userDescription} onChange={(event) => updateLockerItem(item.id, { userDescription: event.target.value })} placeholder="This shows what they knew..." />
                      </label>
                    </div>
                    {item.failureReason && <p className="mt-3 text-xs text-danger">{item.failureReason}</p>}
                  </div>
                ))}
                {!lockerItems.length && (
                  <div className="rounded-lg border border-border bg-surface p-4 text-sm text-text-dim">
                    No evidence uploaded yet. That is okay. USDWatch can still create a first-pass checklist from your story.
                  </div>
                )}
              </div>
            </section>
          )}

          {activeStep.key === 'actions' && (
            <section className="space-y-5">
              <div>
                <h3 className="text-2xl font-bold">What have you already tried?</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-dim">
                  This helps the evaluation tell the difference between "start with the school" and "you may need records, escalation, or outside help."
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PRIOR_ACTIONS.map((action) => (
                  <ChoiceButton key={action} selected={form.prior_actions.includes(action)} onClick={() => updateField('prior_actions', toggleListValue(form.prior_actions, action))}>
                    {action}
                  </ChoiceButton>
                ))}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-dim">What are you hoping for?</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {OUTCOME_OPTIONS.map((outcome) => (
                    <ChoiceButton key={outcome} selected={form.desired_outcomes.includes(outcome)} onClick={() => updateField('desired_outcomes', toggleListValue(form.desired_outcomes, outcome))}>
                      {outcome}
                    </ChoiceButton>
                  ))}
                </div>
              </div>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Anything specific you want to happen?</span>
                <textarea className="min-h-28 w-full rounded-md border border-border bg-background px-3 py-3 text-sm leading-relaxed outline-none focus:border-accent" value={form.desired_outcome} onChange={(event) => updateField('desired_outcome', event.target.value)} placeholder="Example: I want a written safety plan, records, and a meeting with someone who has authority to fix this." />
              </label>
            </section>
          )}

          {activeStep.key === 'support' && (
            <section className="space-y-5">
              <div>
                <h3 className="text-2xl font-bold">Would you want support?</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-dim">
                  This is optional. Nothing is shared automatically. If you opt in, USDWatch can flag your case for manual review before any attorney, advocate, media contact, or parent group sees a summary.
                </p>
              </div>
              <div className="grid gap-3">
                <label className="flex items-start gap-3 rounded-md border border-border bg-surface p-4 text-sm">
                  <input type="checkbox" className="mt-1" checked={form.support_consent.attorney_contact_opt_in} onChange={(event) => updateConsent('attorney_contact_opt_in', event.target.checked)} />
                  <span><strong className="text-text">Attorney contact</strong><span className="block text-text-dim">I may want a qualified attorney to review whether this needs legal help.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-md border border-border bg-surface p-4 text-sm">
                  <input type="checkbox" className="mt-1" checked={form.support_consent.advocacy_contact_opt_in} onChange={(event) => updateConsent('advocacy_contact_opt_in', event.target.checked)} />
                  <span><strong className="text-text">Advocacy or parent-group support</strong><span className="block text-text-dim">I may want help preparing for meetings, records requests, or complaint options.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-md border border-border bg-surface p-4 text-sm">
                  <input type="checkbox" className="mt-1" checked={form.support_consent.media_contact_opt_in} onChange={(event) => updateConsent('media_contact_opt_in', event.target.checked)} />
                  <span><strong className="text-text">Media interest</strong><span className="block text-text-dim">I may be open to a reporter if the case appears to show a broader public problem.</span></span>
                </label>
              </div>
              <label className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning/8 p-4 text-sm text-text-dim">
                <input type="checkbox" className="mt-1" checked={form.support_consent.share_summary_consent} onChange={(event) => updateConsent('share_summary_consent', event.target.checked)} />
                I understand this only gives USDWatch permission to manually review and prepare a limited case summary for the support categories I selected. It does not publicly post my case.
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Best way to contact you</span>
                  <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.support_consent.contact_preference} onChange={(event) => updateConsent('contact_preference', event.target.value)} placeholder="Email, phone, evenings, etc." />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Sensitivity notes</span>
                  <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.support_consent.sensitivity_notes} onChange={(event) => updateConsent('sensitivity_notes', event.target.value)} placeholder="Do not contact during school hours, no media yet..." />
                </label>
              </div>
            </section>
          )}

          {activeStep.key === 'review' && (
            <section className="space-y-5">
              <div>
                <h3 className="text-2xl font-bold">Review and run your free evaluation</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-dim">
                  USDWatch will create your private case, process your Evidence Locker items, and start a first-pass evaluation.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-xs uppercase tracking-wide text-text-dim">Story</p>
                  <p className="mt-2 text-sm text-text">{form.narrative ? `${form.narrative.slice(0, 160)}${form.narrative.length > 160 ? '...' : ''}` : 'No story yet'}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-xs uppercase tracking-wide text-text-dim">Impacted party</p>
                  <p className="mt-2 text-sm text-text">{form.grade_level || 'Grade unknown'} {form.impacted_party_age ? `- age ${form.impacted_party_age}` : ''}</p>
                  <p className="mt-1 text-xs text-text-dim">{form.iep_504_status || 'IEP/504 not specified'}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-xs uppercase tracking-wide text-text-dim">Evidence Locker</p>
                  <p className="mt-2 text-sm text-text">{lockerItems.length} file{lockerItems.length === 1 ? '' : 's'} ready</p>
                  <p className="mt-1 text-xs text-text-dim">Private unless you explicitly share a summary.</p>
                </div>
              </div>
              {createdCase ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-bold">{createdCase.title}</h3>
                    <Link to={`/cases/${createdCase.id}`} className="text-sm text-accent hover:text-accent-hover">Open case</Link>
                  </div>
                  <EvaluationResults evaluation={evaluation} />
                </div>
              ) : (
                <button disabled={loading} className="rounded-md bg-accent px-5 py-3 font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                  {loading ? 'Creating your case...' : 'Create My Self-Advocacy Packet'}
                </button>
              )}
            </section>
          )}

          {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          {!createdCase && (
            <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                disabled={stepIndex === 0 || loading}
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt disabled:opacity-40"
              >
                Back
              </button>
              {activeStep.key === 'review' ? (
                <button disabled={loading} className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                  {loading ? 'Creating your case...' : 'Create My Self-Advocacy Packet'}
                </button>
              ) : (
                <button type="button" onClick={goNext} disabled={loading} className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60">
                  Continue
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
