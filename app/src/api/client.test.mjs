import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearCaseChat,
  deleteGmailImportRule,
  draftCaseText,
  fetchCaseChatSession,
  grantCaseCollaborator,
  saveGmailImportRule,
  setAuthTokenGetter,
  streamCaseChatMessage,
} from './client.js';

function streamFromText(chunks) {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

function streamFromDelayedText(chunks, delayMs, signal) {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      signal?.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true });
      for (const chunk of chunks) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (signal?.aborted) return;
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

test('streamCaseChatMessage emits semantic SSE events and returns the completed session', async () => {
  const events = [];
  setAuthTokenGetter(async () => 'test-token');
  globalThis.localStorage = { removeItem() {}, getItem() { return ''; } };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8000/api/cases/case-1/chat/messages/stream');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(JSON.parse(options.body).content, 'What evidence do we have?');
    return new Response(streamFromText([
      'event: status\ndata: {"label":"Working"}\n\n',
      'event: message_delta\ndata: {"delta":"I found one source.","content":"I found one source.","message_parts":[]}\n\n',
      'event: source\ndata: {"id":"doc:1","label":"incident.pdf"}\n\n',
      'event: action\ndata: {"id":"act-1","type":"open_evidence_locker","status":"pending"}\n\n',
      'event: complete\ndata: {"session":{"id":"session-1","messages":[]}}\n\n',
    ]), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };

  const session = await streamCaseChatMessage('case-1', 'What evidence do we have?', {
    onEvent: (event) => events.push(event),
  });

  assert.equal(session.id, 'session-1');
  assert.deepEqual(events.map((event) => event.type), ['status', 'message_delta', 'source', 'action', 'complete']);
  assert.equal(events[2].data.label, 'incident.pdf');
});

test('streamCaseChatMessage times out stalled streams', async () => {
  setAuthTokenGetter(async () => 'test-token');
  globalThis.localStorage = { removeItem() {}, getItem() { return ''; } };
  let aborted = false;
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      aborted = true;
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });

  await assert.rejects(
    streamCaseChatMessage('case-1', 'Are you there?', { timeoutMs: 1 }),
    /timed out/i,
  );
  assert.equal(aborted, true);
});

test('streamCaseChatMessage keeps active reasoning streams alive', async () => {
  const events = [];
  setAuthTokenGetter(async () => 'test-token');
  globalThis.localStorage = { removeItem() {}, getItem() { return ''; } };
  globalThis.fetch = async (_url, options) => new Response(streamFromDelayedText([
    'event: status\ndata: {"label":"Checking the case file"}\n\n',
    'event: status\ndata: {"label":"Still checking the case file"}\n\n',
    'event: message_delta\ndata: {"content":"This is ready.","delta":"This is ready."}\n\n',
    'event: complete\ndata: {"session":{"id":"session-active","messages":[]}}\n\n',
  ], 8, options.signal), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

  const session = await streamCaseChatMessage('case-1', 'Think for a bit.', {
    timeoutMs: 15,
    onEvent: (event) => events.push(event),
  });

  assert.equal(session.id, 'session-active');
  assert.deepEqual(events.map((event) => event.type), ['status', 'status', 'message_delta', 'complete']);
});

test('fetchCaseChatSession falls back to legacy advocate route when production chat route is missing', async () => {
  const urls = [];
  setAuthTokenGetter(async () => 'test-token');
  globalThis.localStorage = { removeItem() {}, getItem() { return ''; } };
  globalThis.fetch = async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    if (url.endsWith('/chat/session')) {
      return new Response(JSON.stringify({ detail: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    assert.equal(url, 'http://localhost:8000/api/cases/case-1/advocate/session');
    return new Response(JSON.stringify({ id: 'legacy-session', messages: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const session = await fetchCaseChatSession('case-1');

  assert.equal(session.id, 'legacy-session');
  assert.deepEqual(urls, [
    'http://localhost:8000/api/cases/case-1/chat/session',
    'http://localhost:8000/api/cases/case-1/advocate/session',
  ]);
});

test('streamCaseChatMessage falls back to legacy advocate stream when production chat route is missing', async () => {
  const urls = [];
  const events = [];
  setAuthTokenGetter(async () => 'test-token');
  globalThis.localStorage = { removeItem() {}, getItem() { return ''; } };
  globalThis.fetch = async (url, options) => {
    urls.push(url);
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(options.body).content, 'Can you summarize my case?');
    if (url.endsWith('/chat/messages/stream')) {
      return new Response(JSON.stringify({ detail: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    assert.equal(url, 'http://localhost:8000/api/cases/case-1/advocate/messages/stream');
    return new Response(streamFromText([
      'event: message\ndata: {"content":"Legacy stream answer."}\n\n',
      'event: complete\ndata: {"session":{"id":"legacy-session","messages":[]}}\n\n',
    ]), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };

  const session = await streamCaseChatMessage('case-1', 'Can you summarize my case?', {
    onEvent: (event) => events.push(event),
  });

  assert.equal(session.id, 'legacy-session');
  assert.deepEqual(urls, [
    'http://localhost:8000/api/cases/case-1/chat/messages/stream',
    'http://localhost:8000/api/cases/case-1/advocate/messages/stream',
  ]);
  assert.deepEqual(events.map((event) => event.type), ['message', 'complete']);
});

test('clearCaseChat posts to the case chat clear endpoint', async () => {
  setAuthTokenGetter(async () => 'test-token');
  globalThis.localStorage = { removeItem() {}, getItem() { return ''; } };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8000/api/cases/case-1/chat/session/clear');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return new Response(JSON.stringify({ id: 'session-1', messages: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const session = await clearCaseChat('case-1');
  assert.equal(session.id, 'session-1');
});

test('grantCaseCollaborator creates direct case share grants', async () => {
  setAuthTokenGetter(async () => 'test-token');
  globalThis.localStorage = { removeItem() {}, getItem() { return ''; } };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8000/api/cases/case-1/shares');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(options.body), { email: 'helper@example.com', role: 'viewer' });
    return new Response(JSON.stringify({
      grant: { id: 'grant-1', email: 'helper@example.com', role: 'viewer' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await grantCaseCollaborator('case-1', { email: 'helper@example.com', role: 'viewer' });

  assert.equal(result.grant.id, 'grant-1');
});

test('draftCaseText posts a non-mutating draft assist request', async () => {
  setAuthTokenGetter(async () => 'test-token');
  globalThis.localStorage = { removeItem() {}, getItem() { return ''; } };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8000/api/cases/case-1/draft-assist');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(options.body), { target: 'family_narrative' });
    return new Response(JSON.stringify({
      target: 'family_narrative',
      draft: 'Draft text',
      model_route: 'local-fallback:model',
      sources: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await draftCaseText('case-1', 'family_narrative');
  assert.equal(result.draft, 'Draft text');
});

test('saveGmailImportRule replaces the case Gmail rule through the rule endpoint', async () => {
  setAuthTokenGetter(async () => 'test-token');
  globalThis.localStorage = { removeItem() {}, getItem() { return ''; } };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8000/api/gmail/rule');
    assert.equal(options.method, 'PUT');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.deepEqual(JSON.parse(options.body), {
      case_id: 'case-1',
      domains: ['usd232.org', 'jcocogov.org'],
      email_addresses: [],
      keywords: ['incident'],
      include_attachments: true,
    });
    return new Response(JSON.stringify({
      connection: {
        id: 'gmail-1',
        rule: { domains: ['jcocogov.org', 'usd232.org'], email_addresses: [], keywords: ['incident'], include_attachments: true },
        query: '(from:jcocogov.org OR to:jcocogov.org OR from:usd232.org OR to:usd232.org) incident',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await saveGmailImportRule({
    case_id: 'case-1',
    domains: ['usd232.org', 'jcocogov.org'],
    email_addresses: [],
    keywords: ['incident'],
    include_attachments: true,
  });

  assert.equal(result.connection.id, 'gmail-1');
});

test('deleteGmailImportRule clears the saved case Gmail rule', async () => {
  setAuthTokenGetter(async () => 'test-token');
  globalThis.localStorage = { removeItem() {}, getItem() { return ''; } };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:8000/api/gmail/rule?case_id=case-1');
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return new Response(JSON.stringify({
      connection: { id: 'gmail-1', has_rule: false },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await deleteGmailImportRule('case-1');

  assert.equal(result.connection.has_rule, false);
});
