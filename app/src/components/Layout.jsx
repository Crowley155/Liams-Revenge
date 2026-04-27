import { useState } from 'react';
import { UserButton } from '@clerk/clerk-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clerkEnabled, useAuth } from '../auth/AuthContext';

const PUBLIC_NAV = [
  { to: '/', label: 'Home' },
  { to: '/whats-next', label: 'How It Works' },
  { href: '/trust', label: 'Trust' },
  { href: '/ai-disclosure', label: 'AI Disclosure' },
  { href: '/privacy', label: 'Privacy' },
];

const PROTECTED_NAV = [
  { to: '/evaluate', label: 'Evaluate' },
  { to: '/cases', label: 'Cases' },
];

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, workspace, logout } = useAuth();

  const navItems = isAuthenticated ? [...PROTECTED_NAV, ...PUBLIC_NAV] : PUBLIC_NAV;

  const closeMenu = () => setMenuOpen(false);

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
              USDWatch
            </h1>

            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map(({ to, href, label }) => (
                href ? (
                  <a
                    key={href}
                    href={href}
                    className="px-3 py-2 text-xs font-medium rounded-md transition-all duration-200 whitespace-nowrap text-text-dim hover:text-text hover:bg-surface-alt"
                  >
                    {label}
                  </a>
                ) : (
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
                )
              ))}

              <span className="w-px h-5 bg-border mx-1" />

              {isAuthenticated && clerkEnabled ? (
                <UserButton afterSignOutUrl="/" />
              ) : isAuthenticated ? (
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

        {menuOpen && (
          <div className="sm:hidden border-t border-border bg-surface-alt">
            <div className="px-4 py-2 space-y-1">
              {navItems.map(({ to, href, label }) => {
                if (href) {
                  return (
                    <a
                      key={href}
                      href={href}
                      onClick={closeMenu}
                      className="block px-3 py-3 text-sm font-medium rounded-md transition-colors text-text-dim hover:text-text hover:bg-surface"
                    >
                      {label}
                    </a>
                  );
                }
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
        <a
          href="https://elevate.cloud"
          target="_blank"
          rel="noopener noreferrer"
          title="Powered by Elevate"
          className="mx-auto mb-3 inline-flex min-h-7 items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-text-dim transition-colors hover:border-accent/50 hover:bg-surface-alt hover:text-text"
        >
          <span>Powered by</span>
          <img src="/images/elevate-logo-blue.svg" alt="Elevate" className="h-3 w-auto" />
        </a>
        <p className="text-xs font-medium text-text-dim tracking-wide">
          <a href="https://usdwatch.com" className="text-accent hover:text-accent-hover transition-colors">
            usdwatch.com
          </a>
        </p>
        <p className="text-[11px] text-text-dim/60">
          {workspace?.name || 'Free case evaluation'} - Public Advocacy Resource
        </p>
        <p className="text-[11px] text-text-dim/60 flex items-center justify-center gap-3">
          <a href="/trust" className="hover:text-text transition-colors">Trust</a>
          <a href="/ai-disclosure" className="hover:text-text transition-colors">AI Disclosure</a>
          <a href="/privacy" className="hover:text-text transition-colors">Privacy & Disclosures</a>
        </p>
      </footer>
    </div>
  );
}
