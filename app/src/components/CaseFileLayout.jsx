import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { Building2, ClipboardList, FileText, FolderOpen, Home, Scale, Users } from 'lucide-react';
import { fetchCase } from '../api/client';
import { CaseProvider } from '../data/useCase';

const PARENT_CASE_TABS = [
  { to: '', label: 'Case Plan', icon: Home, end: true },
  { to: 'locker', label: 'Evidence Locker', icon: FolderOpen },
  { to: 'records', label: 'Records Requests', icon: ClipboardList },
  { to: 'people', label: 'People', icon: Users },
  { to: 'packet', label: 'Packet', icon: FileText },
];

const DEMO_CASE_TABS = [
  ...PARENT_CASE_TABS,
  { to: 'entities', label: 'Agencies', icon: Building2 },
  { to: 'non-compliance', label: 'Non-Compliance', icon: Scale },
  { to: 'contradictions', label: 'Contradictions', icon: ClipboardList },
  { to: 'policy-reforms', label: 'Reforms', icon: FileText },
];

export default function CaseFileLayout() {
  const { caseId } = useParams();
  const [caseRecord, setCaseRecord] = useState(null);
  const isDemoCase = caseRecord?.status === 'demo';
  const tabs = isDemoCase ? DEMO_CASE_TABS : PARENT_CASE_TABS;

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
              <p className="text-xs font-medium text-accent/80">Case file</p>
              <h2 className="text-xl font-bold sm:text-2xl">
                {caseRecord?.title || 'Loading case...'}
              </h2>
              <p className="text-xs text-text-dim">
                {caseRecord?.intake?.district || 'Private workspace'} - {caseRecord?.status || 'scoped'}
              </p>
            </div>
            <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
              {tabs.map((item) => {
                const Icon = item.icon;
                return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-accent text-background'
                        : 'text-text-dim hover:bg-surface-alt hover:text-text'
                    }`
                  }
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.label}
                </NavLink>
                );
              })}
            </div>
          </div>
        </div>
        <Outlet />
      </div>
    </CaseProvider>
  );
}
