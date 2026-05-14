import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasCurrentOcrReadiness,
  ocrGateLabel,
  ocrStatusLabel,
  ocrStatusTone,
  reviewedEvidenceHref,
  summarizeOcrSources,
} from './ocrReadiness.js';

test('ocr screen labels avoid legal conclusion and fake-confidence language', () => {
  assert.equal(ocrStatusLabel('no_ocr_theory_indicated'), 'No OCR theory indicated yet');
  assert.equal(ocrStatusLabel('needs_more_info'), 'Needs more information');
  assert.equal(ocrStatusLabel('possible_ocr_question'), 'Possible OCR question');
  assert.equal(ocrStatusLabel('evidence_supported_ocr_question'), 'Evidence-supported OCR question');

  for (const status of ['no_ocr_theory_indicated', 'needs_more_info', 'possible_ocr_question', 'evidence_supported_ocr_question']) {
    assert.doesNotMatch(ocrStatusLabel(status).toLowerCase(), /violation|guaranteed|legal finding|high confidence/);
  }
});

test('ocr status tone keeps potential issues calm instead of panic red', () => {
  assert.equal(ocrStatusTone('no_ocr_theory_indicated'), 'neutral');
  assert.equal(ocrStatusTone('needs_more_info'), 'warning');
  assert.equal(ocrStatusTone('possible_ocr_question'), 'info');
  assert.equal(ocrStatusTone('evidence_supported_ocr_question'), 'success');
});

test('gate labels are parent readable', () => {
  assert.equal(ocrGateLabel({ label: 'Protected civil-rights basis', status: 'met' }), 'Protected civil-rights basis');
  assert.equal(ocrGateLabel({ key: 'factual_sufficiency', status: 'partially_supported' }), 'Concrete facts');
});

test('source summary shows authority count without overwhelming parent', () => {
  assert.equal(summarizeOcrSources([]), 'No authority references attached yet.');
  assert.equal(summarizeOcrSources([{ id: 'ocr-cpm' }]), '1 authority reference');
  assert.equal(summarizeOcrSources([{ id: 'a' }, { id: 'b' }]), '2 authority references');
});

test('current OCR results require the v2 schema marker', () => {
  assert.equal(hasCurrentOcrReadiness({ ocr_readiness: { schema_version: 'ocr_readiness_v2' } }), true);
  assert.equal(hasCurrentOcrReadiness({ ocr_readiness: { overall_status: 'strong_readiness' } }), false);
  assert.equal(hasCurrentOcrReadiness({}), false);
});

test('reviewed evidence links point to document review', () => {
  assert.equal(
    reviewedEvidenceHref('case-1', { document_id: 'doc-1' }),
    '/cases/case-1/locker/doc-1',
  );
  assert.equal(reviewedEvidenceHref('case-1', { route: '/cases/case-1/locker/doc-2' }), '/cases/case-1/locker/doc-2');
});
