import { lazy, Suspense, useState } from 'react';
import { OrganizationSwitcher, UserButton } from '@clerk/clerk-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clerkEnabled, useAuth } from '../auth/AuthContext';
import { clerkAppearance } from '../auth/clerkAppearance';
import { gmailOAuthScopes } from '../auth/gmailAccess';
import { appRouteForNavItem, isNavItemActive, navItemsForAuth } from '../navigation';

const FloatingCaseAdvocate = lazy(() => import('./FloatingCaseAdvocate'));

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, workspace, logout } = useAuth();

  const navItems = navItemsForAuth(isAuthenticated);

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex min-h-14 items-center justify-between gap-3">
            <h1 className="text-sm font-bold uppercase tracking-wide text-accent">
              USDWatch
            </h1>

            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map(({ to, href, label }) => {
                const internalTo = appRouteForNavItem({ to, href, label });
                return internalTo ? (
                  <NavLink
                    key={href || internalTo}
                    to={internalTo}
                    end={internalTo === '/'}
                    className={({ isActive }) =>
                      `inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-accent/15 text-accent'
                          : 'text-text-dim hover:text-text hover:bg-surface-alt'
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ) : (
                  <a
                    key={href}
                    href={href}
                    className={`inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                      isNavItemActive(location.pathname, { href })
                        ? 'bg-accent/15 text-accent'
                        : 'text-text-dim hover:text-text hover:bg-surface-alt'
                    }`}
                    aria-current={isNavItemActive(location.pathname, { href }) ? 'page' : undefined}
                  >
                    {label}
                  </a>
                );
              })}

              <span className="w-px h-5 bg-border mx-1" />

              {isAuthenticated && clerkEnabled ? (
                <div className="flex min-h-11 items-center gap-2">
                  <OrganizationSwitcher
                    afterCreateOrganizationUrl="/cases"
                    afterLeaveOrganizationUrl="/cases"
                    afterSelectOrganizationUrl="/cases"
                    appearance={clerkAppearance}
                    hideSlug
                  />
                  <UserButton
                    afterSignOutUrl="/"
                    appearance={clerkAppearance}
                    userProfileProps={{ additionalOAuthScopes: gmailOAuthScopes }}
                  />
                </div>
              ) : isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium text-text-dim transition-colors hover:text-text hover:bg-surface-alt"
                  title={user?.email}
                >
                  Sign Out
                </button>
              ) : (
                <NavLink
                  to="/login"
                  className={({ isActive }) =>
                    `inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium transition-colors ${
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
              className="grid min-h-11 min-w-11 place-items-center rounded-md text-text-dim transition-colors hover:bg-surface-alt hover:text-text lg:hidden"
              aria-label="Toggle menu"
              aria-controls="primary-mobile-menu"
              aria-expanded={menuOpen}
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
          <div id="primary-mobile-menu" className="border-t border-border bg-surface-alt lg:hidden">
            <div className="px-4 py-2 space-y-1">
              {navItems.map(({ to, href, label }) => {
                const internalTo = appRouteForNavItem({ to, href, label });
                if (internalTo) {
                  const isActive = isNavItemActive(location.pathname, { to: internalTo });
                  return (
                    <NavLink
                      key={href || internalTo}
                      to={internalTo}
                      end={internalTo === '/'}
                      onClick={closeMenu}
                      className={`flex min-h-11 items-center rounded-md px-3 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-accent/15 text-accent'
                          : 'text-text-dim hover:text-text hover:bg-surface'
                      }`}
                    >
                      {label}
                    </NavLink>
                  );
                }
                return (
                  <a
                    key={href}
                    href={href}
                    onClick={closeMenu}
                    className={`flex min-h-11 items-center rounded-md px-3 text-sm font-semibold transition-colors ${
                      isNavItemActive(location.pathname, { href })
                        ? 'bg-accent/15 text-accent'
                        : 'text-text-dim hover:text-text hover:bg-surface'
                    }`}
                    aria-current={isNavItemActive(location.pathname, { href }) ? 'page' : undefined}
                  >
                    {label}
                  </a>
                );
              })}

              <div className="border-t border-border pt-2 mt-2">
                {isAuthenticated && clerkEnabled ? (
                  <div className="space-y-2">
                    <div className="flex min-h-11 items-center rounded-md border border-border bg-surface px-2">
                      <OrganizationSwitcher
                        afterCreateOrganizationUrl="/cases"
                        afterLeaveOrganizationUrl="/cases"
                        afterSelectOrganizationUrl="/cases"
                        appearance={clerkAppearance}
                        hideSlug
                      />
                    </div>
                    <button
                      onClick={() => { handleLogout(); closeMenu(); }}
                      className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-semibold text-text-dim transition-colors hover:text-text hover:bg-surface"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : isAuthenticated ? (
                  <button
                    onClick={() => { handleLogout(); closeMenu(); }}
                    className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-semibold text-text-dim transition-colors hover:text-text hover:bg-surface"
                  >
                    Sign Out
                  </button>
                ) : (
                  <NavLink
                    to="/login"
                    onClick={closeMenu}
                    className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-text-dim transition-colors hover:text-text hover:bg-surface"
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

      {isAuthenticated && (
        <Suspense fallback={null}>
          <FloatingCaseAdvocate />
        </Suspense>
      )}

      <footer className="border-t border-border py-5 text-center space-y-1">
        <a
          href="https://elevate.cloud"
          target="_blank"
          rel="noopener noreferrer"
          title="Powered by Elevate"
          className="mx-auto mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-text-dim transition-colors hover:border-accent/50 hover:bg-surface-alt hover:text-text"
        >
          <span>Powered by</span>
          <img src="/images/elevate-logo-blue.svg" alt="Elevate" className="h-3 w-auto" />
        </a>
        <p className="text-xs font-medium text-text-dim tracking-wide">
          <a href="https://usdwatch.com" className="inline-flex min-h-11 items-center px-3 text-accent transition-colors hover:text-accent-hover">
            usdwatch.com
          </a>
        </p>
        <p className="text-[11px] text-text-dim/60">
          {workspace?.name || 'Free draft case workspace'} - Public Advocacy Resource
        </p>
        <p className="text-[11px] text-text-dim/60 flex flex-wrap items-center justify-center gap-2 px-4">
          <Link to="/trust" className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 transition-colors hover:text-text">Trust</Link>
          <Link to="/ai-disclosure" className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 transition-colors hover:text-text">AI Disclosure</Link>
          <Link to="/privacy" className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 transition-colors hover:text-text">Privacy & Disclosures</Link>
        </p>
      </footer>
    </div>
  );
}
