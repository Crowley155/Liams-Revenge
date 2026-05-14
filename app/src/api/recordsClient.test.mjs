import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchRecordsRequests,
  generateRecordsRequests,
  markRecordsRequestSent,
  setAuthTokenGetter,
  updateRecordsRequest,
} from './client.js';

test('records client uses national records endpoints without kora fallback', async () => {
  const calls = [];
  setAuthTokenGetter(async () => 'test-token');
  globalThis.localStorage = { removeItem() {}, getItem() { return ''; } };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    assert.doesNotMatch(url, /\/api\/kora\//);
    if (url.endsWith('/api/records/generate?case_id=case-1')) {
      return new Response(JSON.stringify({ id: 'job-1', status: 'complete' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/api/records/requests?case_id=case-1')) {
      return new Response(JSON.stringify([{ id: 'rr-1', request_law_code: 'MO_SUNSHINE' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/api/records/requests/rr-1/mark-sent')) {
      return new Response(JSON.stringify({ id: 'rr-1', status: 'sent' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/api/records/requests/rr-1')) {
      assert.equal(options.method, 'PUT');
      assert.deepEqual(JSON.parse(options.body), { status: 'fulfilled' });
      return new Response(JSON.stringify({ id: 'rr-1', status: 'fulfilled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  assert.equal((await generateRecordsRequests('case-1')).id, 'job-1');
  assert.equal((await fetchRecordsRequests('', 'case-1'))[0].request_law_code, 'MO_SUNSHINE');
  assert.equal((await markRecordsRequestSent('rr-1')).status, 'sent');
  assert.equal((await updateRecordsRequest('rr-1', { status: 'fulfilled' })).status, 'fulfilled');
  assert.deepEqual(calls.map((call) => call.options.headers?.Authorization).filter(Boolean), [
    'Bearer test-token',
    'Bearer test-token',
    'Bearer test-token',
    'Bearer test-token',
  ]);
});
