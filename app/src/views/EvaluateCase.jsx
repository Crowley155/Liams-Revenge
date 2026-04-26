import { useEffect, useState } from 'react';
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

const initialForm = {
  title: '',
  state: 'KS',
  district: '',
  school: '',
  issue_type: 'special_education',
  incident_date: '',
  narrative: '',
  desired_outcome: '',
  student_age: '',
  urgent: false,
};

export default function EvaluateCase() {
  const { entitlements } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);
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

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...form,
        title: form.title || `${form.district || 'School'} case`,
        student_age: form.student_age ? Number(form.student_age) : null,
        incident_date: form.incident_date || null,
      };
      const nextCase = await createCase(payload);
      setCreatedCase(nextCase);
      if (file) await uploadCaseDocument(nextCase.id, file);
      const nextEvaluation = await startCaseEvaluation(nextCase.id);
      setEvaluation(nextEvaluation);
      setCases((current) => [nextCase, ...current]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const freeLimitReached = entitlements?.plan === 'free' && cases.length >= entitlements.max_active_cases && !createdCase;

  if (freeLimitReached) {
    return (
      <div className="max-w-3xl mx-auto py-10 space-y-5 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.18em] text-accent font-semibold">Workspace</p>
        <h2 className="text-3xl font-bold tracking-tight">Your free case is ready</h2>
        <p className="text-sm leading-relaxed text-text-dim">
          The free tier includes one active case evaluation. Continue from your case workspace.
        </p>
        <div className="grid gap-3">
          {cases.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(`/cases/${item.id}`)}
              className="text-left bg-surface border border-border rounded-lg p-4 hover:border-accent/60 transition-colors"
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
    <div className="max-w-5xl mx-auto py-8 space-y-8 animate-fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-accent font-semibold">Evaluate My Case</p>
          <h2 className="text-3xl font-bold tracking-tight">Start a free case evaluation</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-text-dim">
            One active case is free. Paid organization workspaces unlock team review, larger document sets, and deeper model passes.
          </p>
        </div>
        <Link to="/cases" className="text-sm font-semibold text-accent hover:text-accent-hover">
          View cases
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-5 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Case title</span>
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.title} onChange={(event) => updateField('title', event.target.value)} placeholder="My district case" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">District</span>
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.district} onChange={(event) => updateField('district', event.target.value)} required />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">School</span>
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.school} onChange={(event) => updateField('school', event.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Issue area</span>
            <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" value={form.issue_type} onChange={(event) => updateField('issue_type', event.target.value)}>
              <option value="special_education">Special education / IEP / 504</option>
              <option value="student_safety">Student safety</option>
              <option value="discipline">Discipline</option>
              <option value="records">Records access</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Incident date</span>
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" type="date" value={form.incident_date} onChange={(event) => updateField('incident_date', event.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Student age</span>
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" type="number" min="3" max="22" value={form.student_age} onChange={(event) => updateField('student_age', event.target.value)} />
          </label>
        </div>

        <label className="space-y-2 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">What happened?</span>
          <textarea className="min-h-36 w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent" value={form.narrative} onChange={(event) => updateField('narrative', event.target.value)} required />
        </label>

        <label className="space-y-2 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Desired outcome</span>
          <textarea className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent" value={form.desired_outcome} onChange={(event) => updateField('desired_outcome', event.target.value)} />
        </label>

        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">Upload evidence</span>
            <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
          <label className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-dim">
            <input type="checkbox" checked={form.urgent} onChange={(event) => updateField('urgent', event.target.checked)} />
            Urgent
          </label>
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}
        <button disabled={loading} className="px-5 py-3 rounded-md bg-accent text-background font-semibold hover:bg-accent-hover disabled:opacity-60 transition-colors">
          {loading ? 'Starting evaluation...' : 'Run Free Evaluation'}
        </button>
      </form>

      {createdCase && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-bold">{createdCase.title}</h3>
            <Link to={`/cases/${createdCase.id}`} className="text-sm text-accent hover:text-accent-hover">Open case</Link>
          </div>
          <EvaluationResults evaluation={evaluation} />
        </div>
      )}
    </div>
  );
}
