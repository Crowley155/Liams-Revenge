import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ocrGateLabel,
  ocrStatusLabel,
  ocrStatusTone,
  summarizeOcrSources,
} from './ocrReadiness.js';

test('ocr readiness labels avoid legal conclusion language', () => {
  assert.equal(ocrStatusLabel('not_ready'), 'Not ready');
  assert.equal(ocrStatusLabel('needs_more_info'), 'Needs more information');
  assert.equal(ocrStatusLabel('plausible_for_ocr_review'), 'Potential OCR issue');
  assert.equal(ocrStatusLabel('strong_readiness'), 'Strong OCR readiness');

  for (const status of ['not_ready', 'needs_more_info', 'plausible_for_ocr_review', 'strong_readiness']) {
    assert.doesNotMatch(ocrStatusLabel(status).toLowerCase(), /violation|guaranteed|legal finding/);
  }
});

test('ocr status tone keeps potential issues calm instead of panic red', () => {
  assert.equal(ocrStatusTone('not_ready'), 'neutral');
  assert.equal(ocrStatusTone('needs_more_info'), 'warning');
  assert.equal(ocrStatusTone('plausible_for_ocr_review'), 'info');
  assert.equal(ocrStatusTone('strong_readiness'), 'success');
});

test('gate labels are parent readable', () => {
  assert.equal(ocrGateLabel({ label: 'Protected civil-rights basis', status: 'pass' }), 'Protected civil-rights basis');
  assert.equal(ocrGateLabel({ key: 'factual_sufficiency', status: 'weak' }), 'Concrete facts');
});

test('source summary shows authority count without overwhelming parent', () => {
  assert.equal(summarizeOcrSources([]), 'No authority references attached yet.');
  assert.equal(summarizeOcrSources([{ id: 'ocr-cpm' }]), '1 authority reference');
  assert.equal(summarizeOcrSources([{ id: 'a' }, { id: 'b' }]), '2 authority references');
});
