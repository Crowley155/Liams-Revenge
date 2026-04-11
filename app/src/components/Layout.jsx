import { NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/people', label: 'People' },
  { to: '/non-compliance', label: 'Non-Compliance' },
  { to: '/sources', label: 'Evidence Catalog' },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <h1 className="text-sm font-bold tracking-wide text-accent uppercase">
              Case Command Center
            </h1>
            <nav className="flex gap-1 overflow-x-auto">
              {NAV.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-accent/15 text-accent'
                        : 'text-text-dim hover:text-text hover:bg-surface-alt'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-border py-3 text-center text-xs text-text-dim">
        Crowley v. USD 232 / JCPRD — Privileged & Confidential Work Product
      </footer>
    </div>
  );
}
