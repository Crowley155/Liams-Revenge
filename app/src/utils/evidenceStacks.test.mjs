import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSmartStacks,
  documentInsightSummary,
  filterEvidenceDocuments,
  filterDocumentsByStack,
} from './evidence.js';

const docs = [
  {
    id: 'incident-1',
    filename: 'incident-report.pdf',
    inferred_category: 'incident_safety',
    processing_status: 'indexed',
    document_summary: 'Staff documented an injury during after-school care.',
    case_relevance: 'Supports notice and supervision questions.',
    relevance_score: 0.91,
    document_date: '2026-04-15',
    source_person: 'JCPRD',
    uploaded_at: '2026-04-28T12:00:00Z',
  },
  {
    id: 'medical-1',
    filename: 'ER visit.pdf',
    inferred_category: 'medical_provider',
    processing_status: 'needs_review',
    insight_status: 'skipped',
    document_date: '',
    uploaded_at: '2026-04-27T12:00:00Z',
  },
  {
    id: 'message-1',
    filename: 'principal email.eml',
    inferred_category: 'messages',
    processing_status: 'indexed',
    document_summary: '',
    insight_status: 'pending',
    document_date: '2026-04-16',
    source_person: 'Principal',
    uploaded_at: '2026-04-26T12:00:00Z',
  },
];

test('buildSmartStacks derives multi-membership document groups', () => {
  const stacks = buildSmartStacks(docs);
  const byKey = Object.fromEntries(stacks.map((stack) => [stack.key, stack.count]));

  assert.equal(byKey.needs_attention, 1);
  assert.equal(byKey.highly_relevant, 1);
  assert.equal(byKey.incident_safety, 1);
  assert.equal(byKey.medical_provider, 1);
  assert.equal(byKey.messages, 1);
  assert.equal(byKey.no_date, 1);
  assert.equal(byKey.recently_added, 3);
});

test('filterDocumentsByStack keeps smart stacks as filters rather than folders', () => {
  assert.deepEqual(filterDocumentsByStack(docs, 'highly_relevant').map((doc) => doc.id), ['incident-1']);
  assert.deepEqual(filterDocumentsByStack(docs, 'needs_attention').map((doc) => doc.id), ['medical-1']);
  assert.deepEqual(filterDocumentsByStack(docs, 'all').map((doc) => doc.id), docs.map((doc) => doc.id));
});

test('filterEvidenceDocuments supports category, status, and text filters', () => {
  assert.deepEqual(
    filterEvidenceDocuments(docs, { category: 'messages', status: '', q: '' }).map((doc) => doc.id),
    ['message-1'],
  );
  assert.deepEqual(
    filterEvidenceDocuments(docs, { category: '', status: 'needs_review', q: '' }).map((doc) => doc.id),
    ['medical-1'],
  );
  assert.deepEqual(
    filterEvidenceDocuments(docs, { category: '', status: '', q: 'supervision' }).map((doc) => doc.id),
    ['incident-1'],
  );
});

test('documentInsightSummary shows parent-readable insight fallback text', () => {
  assert.equal(documentInsightSummary(docs[0]).summary, 'Staff documented an injury during after-school care.');
  assert.equal(documentInsightSummary(docs[0]).relevance, 'Supports notice and supervision questions.');
  assert.equal(documentInsightSummary(docs[1]).summary, 'Text review needed before USDWatch can summarize this document.');
  assert.equal(documentInsightSummary(docs[2]).summary, 'USDWatch is preparing a document summary.');
});
