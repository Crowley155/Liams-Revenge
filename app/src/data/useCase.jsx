import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchCaseFile } from '../api/client';

const CaseContext = createContext(null);

const EMPTY_CASE_FILE = {
  actors: [],
  entities: [],
  evidence: [],
  sources: [],
  threads: [],
  timeline: [],
  violations: [],
  contradictions: [],
  evidenceGaps: [],
  policyReforms: [],
};

export function CaseProvider({ caseId, children }) {
  const [data, setData] = useState(EMPTY_CASE_FILE);
  const [loading, setLoading] = useState(Boolean(caseId));
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!caseId) {
      setData(EMPTY_CASE_FILE);
      setLoading(false);
      setError('');
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError('');
    fetchCaseFile(caseId)
      .then((next) => {
        if (!cancelled) setData({ ...EMPTY_CASE_FILE, ...next });
      })
      .catch((err) => {
        if (!cancelled) {
          setData(EMPTY_CASE_FILE);
          setError(err.message || 'Unable to load case file');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const value = useMemo(() => {
    const lookup = {
      evidence: Object.fromEntries((data.evidence || []).map(e => [e.id, e])),
      actors: Object.fromEntries((data.actors || []).map(a => [a.id, a])),
      sources: Object.fromEntries((data.sources || []).map(s => [s.id, s])),
      threads: Object.fromEntries((data.threads || []).map(t => [t.id, t])),
    };
    return { ...data, lookup, loading, error, caseId };
  }, [caseId, data, error, loading]);

  return (
    <CaseContext.Provider value={value}>
      {children}
    </CaseContext.Provider>
  );
}

export function useCase() {
  const ctx = useContext(CaseContext);
  if (!ctx) throw new Error('useCase must be used inside CaseProvider');
  return ctx;
}
