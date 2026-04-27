import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EvaluationResults from '../components/EvaluationResults';
import {
  fetchCase,
  fetchCaseDocuments,
  fetchLatestEvaluation,
  startCaseEvaluation,
  uploadCaseDocument,
} from '../api/client';

export default function CaseDetail() {
  const { caseId } = useParams();
  const [caseRecord, setCaseRecord] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [nextCase, nextDocs, nextEval] = await Promise.all([
          fetchCase(caseId),
          fetchCaseDocuments(caseId),
          fetchLatestEvaluation(caseId),
        ]);
        if (!cancelled) {
          setCaseRecord(nextCase);
          setDocuments(nextDocs);
          setEvaluation(nextEval);
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
    }, 1800);
    return () => window.clearInterval(timer);
  }, [evaluation, caseId]);

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const doc = await uploadCaseDocument(caseId, file);
      setDocuments((current) => [doc, ...current]);
      setFile(null);
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

  if (error && !caseRecord) {
    return <div className="max-w-3xl mx-auto py-10 text-sm text-red-300">{error}</div>;
  }

  if (!caseRecord) {
    return <div className="min-h-[40vh] grid place-items-center text-sm text-text-dim">Loading case...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto py-8 space-y-8 animate-fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Link to="/cases" className="text-sm text-accent hover:text-accent-hover">Cases</Link>
          <h2 className="text-3xl font-bold tracking-tight">{caseRecord.title}</h2>
          <p className="text-sm text-text-dim">
            {caseRecord.intake?.district || 'District not entered'} - {caseRecord.intake?.issue_type}
          </p>
        </div>
        <button disabled={busy} onClick={handleRun} className="px-4 py-2 rounded-md bg-accent text-background text-sm font-semibold hover:bg-accent-hover disabled:opacity-60 transition-colors">
          Run Evaluation
        </button>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-5">
          <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold">Intake</h3>
            <p className="text-sm leading-relaxed text-text-dim">{caseRecord.intake?.narrative}</p>
            {caseRecord.intake?.desired_outcome && (
              <p className="text-sm leading-relaxed text-text">{caseRecord.intake.desired_outcome}</p>
            )}
          </section>

          <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold">Documents</h3>
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="rounded-md border border-border px-3 py-2">
                  <p className="text-sm font-medium">{doc.filename}</p>
                  <p className="text-xs text-text-dim">{doc.status} - {doc.chunk_count || 0} chunks</p>
                </div>
              ))}
              {!documents.length && <p className="text-sm text-text-dim">No documents uploaded.</p>}
            </div>
            <div className="space-y-2">
              <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              <button disabled={!file || busy} onClick={handleUpload} className="w-full px-3 py-2 rounded-md border border-border text-sm hover:bg-surface-alt disabled:opacity-60 transition-colors">
                Upload
              </button>
            </div>
          </section>
        </aside>

        <EvaluationResults evaluation={evaluation} />
      </div>
    </div>
  );
}
