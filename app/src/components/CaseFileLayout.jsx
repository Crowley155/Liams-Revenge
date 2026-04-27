import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { fetchCase } from '../api/client';
import { CaseProvider } from '../data/useCase';

const CASE_FILE_TABS = [
  { to: '', label: 'Evaluation', end: true },
  { to: 'overview', label: 'Overview' },
  { to: 'timeline', label: 'Timeline' },
  { to: 'evidence-gaps', label: 'Gaps' },
  { to: 'people', label: 'People' },
  { to: 'entities', label: 'Entities' },
  { to: 'non-compliance', label: 'Non-Compliance' },
  { to: 'contradictions', label: 'Contradictions' },
  { to: 'sources', label: 'Evidence' },
  { to: 'policy-reforms', label: 'Reforms' },
];

export default function CaseFileLayout() {
  const { caseId } = useParams();
  const [caseRecord, setCaseRecord] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchCase(caseId)
      .then((record) => {
        if (!cancelled) setCaseRecord(record);
      })
      .catch(() => {
        if (!cancelled) setCaseRecord(null);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  return (
    <CaseProvider caseId={caseId}>
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-surface/80 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/80">Case file</p>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                {caseRecord?.title || 'Loading case...'}
              </h2>
              <p className="text-xs text-text-dim">
                {caseRecord?.intake?.district || 'Private workspace'} - {caseRecord?.status || 'scoped'}
              </p>
            </div>
            <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
              {CASE_FILE_TABS.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `shrink-0 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-accent text-background'
                        : 'text-text-dim hover:bg-surface-alt hover:text-text'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
        <Outlet />
      </div>
    </CaseProvider>
  );
}
