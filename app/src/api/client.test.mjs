import assert from 'node:assert/strict';
import test from 'node:test';

import { setAuthTokenGetter, streamCaseAdvocateMessage } from './client.js';

function streamFromText(chunks) {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

test('streamCaseAdvocateMessage emits SSE events and returns the completed session', async () => {
  const events = [];
  setAuthTokenGetter(async () => 'test-token');
  globalThis.localStorage = { removeItem() {}, getItem() { return ''; } };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8000/api/cases/case-1/advocate/messages/stream');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(JSON.parse(options.body).content, 'What evidence do we have?');
    return new Response(streamFromText([
      'event: status\ndata: {"label":"Working"}\n\n',
      'event: message\ndata: {"content":"I found one source.","message_parts":[]}\n\n',
      'event: source\ndata: {"id":"doc:1","label":"incident.pdf"}\n\n',
      'event: action\ndata: {"id":"act-1","type":"open_evidence_locker","status":"pending"}\n\n',
      'event: complete\ndata: {"session":{"id":"session-1","messages":[]}}\n\n',
    ]), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };

  const session = await streamCaseAdvocateMessage('case-1', 'What evidence do we have?', {
    onEvent: (event) => events.push(event),
  });

  assert.equal(session.id, 'session-1');
  assert.deepEqual(events.map((event) => event.type), ['status', 'message', 'source', 'action', 'complete']);
  assert.equal(events[2].data.label, 'incident.pdf');
});
