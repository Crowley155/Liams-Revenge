import { createContext, useContext, useState } from 'react';
import rawData from '../../../data/case-data.json';

const CaseContext = createContext(null);

export function CaseProvider({ children }) {
  const [data] = useState(rawData);

  const lookup = {
    evidence: Object.fromEntries((data.evidence || []).map(e => [e.id, e])),
    actors: Object.fromEntries((data.actors || []).map(a => [a.id, a])),
    sources: Object.fromEntries((data.sources || []).map(s => [s.id, s])),
    threads: Object.fromEntries((data.threads || []).map(t => [t.id, t])),
  };

  return (
    <CaseContext.Provider value={{ ...data, lookup }}>
      {children}
    </CaseContext.Provider>
  );
}

export function useCase() {
  const ctx = useContext(CaseContext);
  if (!ctx) throw new Error('useCase must be used inside CaseProvider');
  return ctx;
}
