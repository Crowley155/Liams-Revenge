import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { Building2, ClipboardList, FileText, FolderOpen, Home, Scale, Settings, Users } from 'lucide-react';
import { fetchCase, fetchCaseAccess } from '../api/client';
import { CaseProvider } from '../data/useCase';
import { sharedAccessLabel } from '../utils/caseAccess';
import { hasCasePolicyReforms } from '../utils/casePolicyReforms';

const PARENT_CASE_TABS = [
  { to: '', label: 'Case Plan', icon: Home, end: true },
  { to: 'locker', label: 'Evidence Locker', icon: FolderOpen },
  { to: 'records', label: 'Records Requests', icon: ClipboardList },
  { to: 'people', label: 'People', icon: Users },
  { to: 'packet', label: 'Packet', icon: FileText },
  { to: 'settings', label: 'Settings', icon: Settings },
];

const POLICY_REFORMS_TAB = { to: 'policy-reforms', label: 'Reforms', icon: FileText };

const DEMO_CASE_TABS = [
  { to: 'entities', label: 'Agencies', icon: Building2 },
  { to: 'non-compliance', label: 'Non-Compliance', icon: Scale },
  { to: 'contradictions', label: 'Contradictions', icon: ClipboardList },
];

export default function CaseFileLayout() {
  const { caseId } = useParams();
  const [caseRecord, setCaseRecord] = useState(null);
  const [access, setAccess] = useState(null);
  const isDemoCase = caseRecord?.status === 'demo';
  const showPolicyReforms = hasCasePolicyReforms(caseRecord);
  const tabs = [
    ...PARENT_CASE_TABS,
    ...(showPolicyReforms ? [POLICY_REFORMS_TAB] : []),
    ...(isDemoCase ? DEMO_CASE_TABS : []),
  ];
  const accessLabel = sharedAccessLabel(access);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCase(caseId),
      fetchCaseAccess(caseId).catch(() => null),
    ])
      .then(([record, nextAccess]) => {
        if (!cancelled) setCaseRecord(record);
        if (!cancelled) setAccess(nextAccess);
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
      <div className="product-ui w-full min-w-0 max-w-full space-y-6 overflow-hidden">
        <div className="min-w-0 overflow-hidden rounded-md border border-border bg-surface/80 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 space-y-1">
              <h1 className="wrap-anywhere text-xl font-bold sm:text-2xl">
                {caseRecord?.title || 'Loading case...'}
              </h1>
              <p className="text-xs text-text-dim">
                {caseRecord?.intake?.district || 'Private workspace'} - {caseRecord?.status || 'scoped'}
              </p>
              {accessLabel && (
                <p className="inline-flex min-h-7 items-center rounded-md border border-info/35 bg-info/10 px-2 py-1 text-xs font-semibold text-info">
                  {accessLabel}
                </p>
              )}
            </div>
            <div className="flex w-full min-w-0 max-w-full gap-1 overflow-x-auto pb-1 lg:w-auto">
              {tabs.map((item) => {
                const Icon = item.icon;
                return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
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
