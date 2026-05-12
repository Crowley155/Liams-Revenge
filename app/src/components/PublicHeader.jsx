import { useEffect, useState } from 'react';
import { ClerkProvider, OrganizationSwitcher, UserButton, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { Menu, X } from 'lucide-react';
import { clerkAppearance } from '../auth/clerkAppearance';
import { isNavItemActive, navItemsForAuth } from '../navigation';

const DEV_TOKEN_KEY = 'usdwatch_dev_token';
const CLERK_KEY =
  import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  '';

function pathFromWindow(initialPath = '/') {
  if (typeof window === 'undefined') return initialPath;
  return window.location.pathname || '/';
}

function NavMenu({ items, pathname, onNavigate, mobile = false }) {
  return (
    <>
      {items.map((item) => {
        const active = isNavItemActive(pathname, item);
        return (
          <a
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={[
              mobile
                ? 'flex min-h-11 items-center rounded-md px-3 text-sm font-semibold transition-colors'
                : 'inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium transition-colors',
              active
                ? 'bg-accent/15 text-accent'
                : 'text-text-dim hover:bg-surface-alt hover:text-text',
            ].join(' ')}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </a>
        );
      })}
    </>
  );
}

function PublicHeaderFrame({ isAuthenticated, initialPath = '/', onSignOut, accountControl, mobileAccountControl }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pathname, setPathname] = useState(() => pathFromWindow(initialPath));
  const items = navItemsForAuth(isAuthenticated);

  useEffect(() => {
    setPathname(pathFromWindow(initialPath));
  }, [initialPath]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex min-h-14 items-center justify-between gap-3">
          <a href="/" className="inline-flex min-h-11 items-center text-sm font-bold uppercase tracking-wide text-accent">
            USDWatch
          </a>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            <NavMenu items={items} pathname={pathname} />
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            {isAuthenticated ? (
              accountControl || (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium text-text-dim transition-colors hover:bg-surface-alt hover:text-text"
                >
                  Sign Out
                </button>
              )
            ) : (
              <a
                href="/login"
                className={[
                  'inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium transition-colors',
                  isNavItemActive(pathname, { href: '/login' })
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-dim hover:bg-surface-alt hover:text-text',
                ].join(' ')}
                aria-current={isNavItemActive(pathname, { href: '/login' }) ? 'page' : undefined}
              >
                Sign In
              </a>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-grid min-h-11 min-w-11 place-items-center rounded-md text-text-dim transition-colors hover:bg-surface-alt hover:text-text lg:hidden"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-border bg-surface-alt lg:hidden">
          <nav className="mx-auto grid max-w-7xl gap-1 px-4 py-2" aria-label="Mobile primary">
            <NavMenu items={items} pathname={pathname} onNavigate={closeMenu} mobile />
            <div className="mt-2 border-t border-border pt-2">
              {isAuthenticated ? (
                mobileAccountControl || accountControl || (
                  <button
                    type="button"
                    onClick={() => {
                      onSignOut?.();
                      closeMenu();
                    }}
                    className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-semibold text-text-dim transition-colors hover:bg-surface hover:text-text"
                  >
                    Sign Out
                  </button>
                )
              ) : (
                <a
                  href="/login"
                  onClick={closeMenu}
                  className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-text-dim transition-colors hover:bg-surface hover:text-text"
                >
                  Sign In
                </a>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function ClerkPublicHeader({ initialPath }) {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const accountControl = isLoaded && isSignedIn ? (
    <div className="flex min-h-11 items-center gap-2">
      <OrganizationSwitcher
        afterCreateOrganizationUrl="/cases"
        afterLeaveOrganizationUrl="/cases"
        afterSelectOrganizationUrl="/cases"
        appearance={clerkAppearance}
        hideSlug
      />
      <UserButton afterSignOutUrl="/" appearance={clerkAppearance} />
    </div>
  ) : null;

  return (
    <PublicHeaderFrame
      initialPath={initialPath}
      isAuthenticated={isLoaded && Boolean(isSignedIn)}
      accountControl={accountControl}
      mobileAccountControl={accountControl}
    />
  );
}

function DevPublicHeader({ initialPath }) {
  const [token, setToken] = useState('');

  useEffect(() => {
    setToken(localStorage.getItem(DEV_TOKEN_KEY) || '');
  }, []);

  const signOut = () => {
    localStorage.removeItem(DEV_TOKEN_KEY);
    setToken('');
  };

  return <PublicHeaderFrame initialPath={initialPath} isAuthenticated={Boolean(token)} onSignOut={signOut} />;
}

export default function PublicHeader({ initialPath = '/' }) {
  if (CLERK_KEY) {
    return (
      <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/" appearance={clerkAppearance}>
        <ClerkPublicHeader initialPath={initialPath} />
      </ClerkProvider>
    );
  }

  return <DevPublicHeader initialPath={initialPath} />;
}
