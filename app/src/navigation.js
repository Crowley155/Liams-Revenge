export const PUBLIC_NAV = [
  { href: '/', to: '/', label: 'Home' },
  { href: '/whats-next', label: 'How It Works' },
  { href: '/trust', label: 'Trust' },
  { href: '/ai-disclosure', label: 'AI Disclosure' },
  { href: '/privacy', label: 'Privacy' },
];

export const PROTECTED_NAV = [
  { href: '/cases', to: '/cases', label: 'Cases' },
];

export function navItemsForAuth(isAuthenticated) {
  return isAuthenticated ? [...PROTECTED_NAV, ...PUBLIC_NAV] : PUBLIC_NAV;
}

export function isNavItemActive(pathname, item) {
  const target = (item.to || item.href || '/').replace(/\/$/, '') || '/';
  const current = (pathname || '/').replace(/\/$/, '') || '/';
  if (target === '/') return current === '/';
  return current === target || current.startsWith(`${target}/`);
}
