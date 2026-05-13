import assert from 'node:assert/strict';
import test from 'node:test';

import { caseGapMetric, recordsRequestMetric } from './caseMetrics.js';

const starterChecklist = [
  { item: 'Story', status: 'missing' },
  { item: 'Messages', status: 'recommended' },
  { item: 'Records', status: 'recommended' },
  { item: 'Outcome', status: 'missing' },
];

test('empty new cases do not present starter checklist items as evidence gaps', () => {
  const metric = caseGapMetric({
    caseRecord: { intake: {} },
    documents: [],
    evaluation: null,
    checklist: starterChecklist,
  });

  assert.equal(metric.value, 0);
  assert.match(metric.detail, /add a story or evidence/i);
});

test('case gap metric uses Case Read gaps once an evaluation exists', () => {
  const metric = caseGapMetric({
    caseRecord: { intake: {} },
    documents: [],
    evaluation: { result: { gaps: [{ gap: 'Timeline' }, { gap: 'Policy' }] } },
    checklist: starterChecklist,
  });

  assert.equal(metric.value, 2);
  assert.match(metric.detail, /case read/i);
});

test('records request metric does not count starter templates before a Case Read', () => {
  const metric = recordsRequestMetric({
    evaluation: null,
    recordsDrafts: [{ title: 'Generic request' }, { title: 'Generic policy request' }],
  });

  assert.equal(metric.value, 0);
  assert.match(metric.detail, /run a case read/i);
});

test('records request metric counts drafts after a Case Read exists', () => {
  const metric = recordsRequestMetric({
    evaluation: { status: 'complete', result: {} },
    recordsDrafts: [{ title: 'Incident records' }, { title: 'Policy records' }],
  });

  assert.equal(metric.value, 2);
  assert.match(metric.detail, /case read/i);
});
