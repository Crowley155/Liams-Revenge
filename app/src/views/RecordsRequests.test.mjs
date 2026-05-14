import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('RecordsRequests uses national records language and API helpers', () => {
  const source = readFileSync(new URL('./RecordsRequests.jsx', import.meta.url), 'utf8');

  assert.match(source, /generateRecordsRequests/);
  assert.match(source, /fetchRecordsRequests/);
  assert.doesNotMatch(source, /generateKoraRequests/);
  assert.doesNotMatch(source, /fetchKoraRequests/);
  assert.doesNotMatch(source, /Regenerate KORA Requests|Generate KORA Requests|No KORA requests/);
  assert.match(source, /State\/federal grounding/);
});
