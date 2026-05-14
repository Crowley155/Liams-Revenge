import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./CaseFileLayout.jsx', import.meta.url), 'utf8');

test('case header tabs wrap instead of creating an internal horizontal scrollbar', () => {
  assert.doesNotMatch(source, /overflow-x-auto/);
  assert.match(source, /flex-wrap/);
  assert.match(source, /aria-label="Case sections"/);
});
