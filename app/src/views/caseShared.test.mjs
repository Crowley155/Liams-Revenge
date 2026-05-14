import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('help tooltip uses an opaque surface instead of a transparent background utility', () => {
  const source = readFileSync(new URL('./caseShared.jsx', import.meta.url), 'utf8');
  const tooltipClassLine = source
    .split('\n')
    .find((line) => line.includes('group-hover/help:block')) || '';

  assert.match(tooltipClassLine, /bg-\[var\(--color-surface-alt\)\]/);
  assert.doesNotMatch(tooltipClassLine, /\bbg-background\b/);
  assert.match(tooltipClassLine, /\bhidden\b/);
  assert.match(tooltipClassLine, /text-text/);
  assert.match(tooltipClassLine, /shadow-elevated/);
});
