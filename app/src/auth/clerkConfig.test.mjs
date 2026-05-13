import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanEnvValue, firstCleanEnvValue } from './clerkConfig.js';

test('cleanEnvValue removes hidden BOM characters from Clerk config values', () => {
  assert.equal(cleanEnvValue('\uFEFFusdwatch'), 'usdwatch');
  assert.equal(cleanEnvValue(' \uFEFFusdwatch '), 'usdwatch');
});

test('firstCleanEnvValue ignores blank values after trimming hidden characters', () => {
  assert.equal(firstCleanEnvValue('', '\uFEFF', 'usdwatch'), 'usdwatch');
  assert.equal(firstCleanEnvValue('', '  '), undefined);
});
