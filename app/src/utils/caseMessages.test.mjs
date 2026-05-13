import assert from 'node:assert/strict';
import test from 'node:test';

import { casesErrorCopy } from './caseMessages.js';

test('casesErrorCopy turns 401 fetch errors into recovery copy', () => {
  const copy = casesErrorCopy(new Error('Failed to fetch cases: 401'));

  assert.equal(copy.title, 'Your account is signed in, but USDWatch could not connect it yet');
  assert.match(copy.body, /refresh/i);
  assert.match(copy.body, /sign out/i);
});

test('casesErrorCopy keeps non-auth errors useful without exposing implementation noise', () => {
  const copy = casesErrorCopy(new Error('Failed to fetch cases: 500'));

  assert.equal(copy.title, 'Cases could not load');
  assert.match(copy.body, /try again/i);
});

test('casesErrorCopy explains case limits as a new-case limit, not a load failure', () => {
  const copy = casesErrorCopy(new Error('Your free plan includes 1 draft or active case.'));

  assert.equal(copy.title, 'New case limit reached');
  assert.match(copy.body, /current case/i);
  assert.doesNotMatch(copy.body, /load/i);
});
