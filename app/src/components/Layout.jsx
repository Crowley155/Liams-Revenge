import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const PUBLIC_NAV = [
  { to: '/', label: 'Overview' },
  { to: '/policy-reforms', label: 'Policy Reforms' },
  { to: '/whats-next', label: "What's Next" },
];

const PROTECTED_NAV = [
  { to: '/people', label: 'People' },
  { to: '/entities', label: 'Entities' },
  { to: '/non-compliance', label: 'Non-Compliance' },
  { to: '/contradictions', label: 'Contradictions' },
  { to: '/evidence-gaps', label: 'Evidence Gaps' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/sources', label: 'Evidence Catalog' },
];

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();

  const closeMenu = () => setMenuOpen(false);

  const NAV = isAuthenticated ? [...PUBLIC_NAV, ...PROTECTED_NAV] : PUBLIC_NAV;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <h1 className="text-sm font-bold tracking-wide text-accent uppercase">
              Case Command Center
            </h1>

            {/* Desktop nav */}
            <nav className="hidden sm:flex items-center gap-1">
              {NAV.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `px-3 py-2 text-xs font-medium rounded-md transition-all duration-200 whitespace-nowrap ${
                      isActive
                        ? 'bg-accent/15 text-accent shadow-[0_0_8px_var(--color-accent-glow)]'
                        : 'text-text-dim hover:text-text hover:bg-surface-alt'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}

              <span className="w-px h-5 bg-border mx-1" />

              {isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 text-xs font-medium text-text-dim hover:text-text hover:bg-surface-alt rounded-md transition-colors"
                  title={user?.email}
                >
                  Sign Out
                </button>
              ) : (
                <NavLink
                  to="/login"
                  className={({ isActive }) =>
                    `px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-accent/15 text-accent'
                        : 'text-text-dim hover:text-text hover:bg-surface-alt'
                    }`
                  }
                >
                  Sign In
                </NavLink>
              )}
            </nav>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="sm:hidden p-2 text-text-dim hover:text-text"
              aria-label="Toggle menu"
            >
              {menuOpen ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l12 12M16 4L4 16" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 5h14M3 10h14M3 15h14" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {menuOpen && (
          <div className="sm:hidden border-t border-border bg-surface-alt">
            <div className="px-4 py-2 space-y-1">
              {NAV.map(({ to, label }) => {
                const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={closeMenu}
                    className={`block px-3 py-3 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-accent/15 text-accent'
                        : 'text-text-dim hover:text-text hover:bg-surface'
                    }`}
                  >
                    {label}
                  </NavLink>
                );
              })}

              <div className="border-t border-border pt-2 mt-2">
                {isAuthenticated ? (
                  <button
                    onClick={() => { handleLogout(); closeMenu(); }}
                    className="block w-full text-left px-3 py-3 text-sm font-medium text-text-dim hover:text-text hover:bg-surface rounded-md transition-colors"
                  >
                    Sign Out
                  </button>
                ) : (
                  <NavLink
                    to="/login"
                    onClick={closeMenu}
                    className="block px-3 py-3 text-sm font-medium text-text-dim hover:text-text hover:bg-surface rounded-md transition-colors"
                  >
                    Sign In
                  </NavLink>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-border py-5 text-center space-y-1">
        <p className="text-xs font-medium text-text-dim tracking-wide">
          <a href="https://usdwatch.com" className="text-accent hover:text-accent-hover transition-colors">
            usdwatch.com
          </a>
        </p>
        <p className="text-[11px] text-text-dim/60">
          Crowley v. USD 232 / JCPRD — Public Advocacy Resource
        </p>
      </footer>
    </div>
  );
}
