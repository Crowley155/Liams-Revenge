import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCases } from '../api/client';

export default function Cases() {
  const [cases, setCases] = useState([]);
  const [error, setError] = useState('');

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

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6 animate-fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-accent font-semibold">Workspace</p>
          <h2 className="text-3xl font-bold tracking-tight">Cases</h2>
        </div>
        <Link to="/evaluate" className="px-4 py-2 rounded-md bg-accent text-background text-sm font-semibold hover:bg-accent-hover transition-colors">
          Evaluate My Case
        </Link>
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
            No cases yet. Start with a free evaluation.
          </div>
        )}
      </div>
    </div>
  );
}
