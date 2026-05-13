import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('New Case action creates a fresh case instead of reopening the draft route', () => {
  const source = readFileSync(new URL('./Cases.jsx', import.meta.url), 'utf8');

  assert.match(source, /import \{ fetchCases, createCase \} from '\.\.\/api\/client';/);
  assert.doesNotMatch(source, /\bopenOrCreateDraftCase\b/);
  assert.match(source, /await createCase\(\{\}\)/);
  assert.match(source, /starting \? 'Creating\.\.\.' : 'New Case'/);
});
