import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { fetchCases, openOrCreateDraftCase } from '../api/client';

export default function Cases() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCases()
      .then((items) => {
        if (!cancelled) setCases(items);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStartCase = async () => {
    setStarting(true);
    setError('');
    try {
      const caseRecord = await openOrCreateDraftCase();
      navigate(`/cases/${caseRecord.id}?advocate=open`);
    } catch (err) {
      setError(err.message || 'Could not open your draft case');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="product-ui mx-auto max-w-5xl space-y-6 py-8 animate-fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-accent font-semibold">Workspace</p>
          <h2 className="text-3xl font-bold tracking-tight">Cases</h2>
        </div>
        <button
          type="button"
          onClick={handleStartCase}
          disabled={starting}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {starting ? 'Opening...' : 'New Case'}
        </button>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="grid gap-3">
        {cases.map((item) => (
          <Link
            key={item.id}
            to={`/cases/${item.id}`}
            className="bg-surface border border-border rounded-lg p-4 hover:border-accent/60 transition-colors"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm text-text-dim">{item.intake?.district || item.intake?.state || 'No district entered'}</p>
              </div>
              <span className="text-xs uppercase tracking-wide text-text-dim">{item.status}</span>
            </div>
          </Link>
        ))}
        {!cases.length && !error && (
          <div className="bg-surface border border-border rounded-lg p-5 text-sm text-text-dim">
            No cases yet. Start with a Draft Case and let the Case Advocate help you build it.
          </div>
        )}
      </div>
    </div>
  );
}
