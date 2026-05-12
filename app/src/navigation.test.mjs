import assert from 'node:assert/strict';
import test from 'node:test';

import { isNavItemActive, navItemsForAuth } from './navigation.js';

test('signed-out navigation is public only and starts with Home', () => {
  const labels = navItemsForAuth(false).map((item) => item.label);

  assert.deepEqual(labels, ['Home', 'How It Works', 'Trust', 'AI Disclosure', 'Privacy']);
  assert.equal(labels.includes('Cases'), false);
});

test('authenticated navigation keeps Home first and includes Cases second', () => {
  const labels = navItemsForAuth(true).map((item) => item.label);

  assert.deepEqual(labels, ['Home', 'Cases', 'How It Works', 'Trust', 'AI Disclosure', 'Privacy']);
});

test('active route matching treats Home as exact and static pages by path', () => {
  assert.equal(isNavItemActive('/whats-next/', { href: '/whats-next' }), true);
  assert.equal(isNavItemActive('/whats-next/', { href: '/' }), false);
  assert.equal(isNavItemActive('/cases/abc123/locker', { href: '/cases', to: '/cases' }), true);
});
