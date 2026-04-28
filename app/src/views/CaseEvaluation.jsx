import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EvaluationResults from '../components/EvaluationResults';
import {
  fetchLatestEvaluation,
  startCaseEvaluation,
} from '../api/client';
import { Panel, StatusPill, formatLabel } from './caseShared';

export default function CaseEvaluation() {
  const { caseId } = useParams();
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadEvaluation = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEvaluation(await fetchLatestEvaluation(caseId));
    } catch {
      setEvaluation(null);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadEvaluation();
  }, [loadEvaluation]);

  useEffect(() => {
    if (!evaluation || ['complete', 'failed'].includes(evaluation.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        setEvaluation(await fetchLatestEvaluation(caseId));
      } catch (err) {
        setError(err.message || 'Failed to refresh evaluation');
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [caseId, evaluation]);

  const handleRun = async () => {
    setBusy(true);
    setError('');
    try {
      setEvaluation(await startCaseEvaluation(caseId));
    } catch (err) {
      setError(err.message || 'Failed to start evaluation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8 animate-fade-up">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/80">Case analysis</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">Evaluation</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-dim">
            Refresh the case read after you add important evidence or receive records responses.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={handleRun}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {evaluation ? 'Refresh Evaluation' : 'Run Evaluation'}
        </button>
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <Panel title="Current Evaluation" eyebrow="Status">
        {loading && <p className="text-sm text-text-dim">Loading evaluation...</p>}
        {!loading && evaluation && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={evaluation.status} />
            {evaluation.model_tier && <StatusPill status={evaluation.model_tier} />}
            {evaluation.result?.evidence_strength && <StatusPill status={`${formatLabel(evaluation.result.evidence_strength)} evidence`} />}
          </div>
        )}
        {!loading && !evaluation && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-text-dim">
              No evaluation has run yet. You can start with only your story, then improve the read by adding documents to the Evidence Locker.
            </p>
            <Link to={`/cases/${caseId}/locker`} className="text-sm font-semibold text-accent hover:text-accent-hover">
              Open Evidence Locker
            </Link>
          </div>
        )}
      </Panel>

      <EvaluationResults evaluation={evaluation} />
    </div>
  );
}
