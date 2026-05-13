const API_BASE =
  import.meta.env?.PUBLIC_API_URL ||
  import.meta.env?.VITE_API_URL ||
  'http://localhost:8000';
const TOKEN_KEY = 'usdwatch_token';
const DEFAULT_CHAT_STREAM_TIMEOUT_MS = 45000;

let authTokenGetter = async () => localStorage.getItem(TOKEN_KEY);

export function setAuthTokenGetter(getter) {
  authTokenGetter = getter || (async () => localStorage.getItem(TOKEN_KEY));
}

async function authFetch(url, options = {}) {
  const token = await authTokenGetter();
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) localStorage.removeItem(TOKEN_KEY);
  return res;
}

function requireCaseId(caseId) {
  if (!caseId) {
    throw new Error('caseId is required');
  }
  return caseId;
}

async function caseChatFetch(caseId, chatPath, advocatePath, options = {}) {
  requireCaseId(caseId);
  const chatRes = await authFetch(`${API_BASE}/api/cases/${caseId}/chat/${chatPath}`, options);
  if (chatRes.status !== 404) return chatRes;
  return authFetch(`${API_BASE}/api/cases/${caseId}/advocate/${advocatePath}`, options);
}

// --- Protected endpoints ---

export async function fetchProfiles(caseId = '') {
  const params = caseId ? `?case_id=${encodeURIComponent(caseId)}` : '';
  const res = await authFetch(`${API_BASE}/api/profiles${params}`);
  if (!res.ok) throw new Error(`Failed to fetch profiles: ${res.status}`);
  return res.json();
}

export async function fetchEntities(caseId = '') {
  const params = caseId ? `?case_id=${encodeURIComponent(caseId)}` : '';
  const res = await authFetch(`${API_BASE}/api/entities${params}`);
  if (!res.ok) throw new Error(`Failed to fetch entities: ${res.status}`);
  return res.json();
}

export async function fetchProfile(id) {
  const res = await authFetch(`${API_BASE}/api/profiles/${id}`);
  if (!res.ok) throw new Error(`Profile not found: ${res.status}`);
  return res.json();
}

export async function fetchEntity(id) {
  const res = await authFetch(`${API_BASE}/api/entities/${id}`);
  if (!res.ok) throw new Error(`Entity not found: ${res.status}`);
  return res.json();
}

export async function fetchEntityMembers(id) {
  const res = await authFetch(`${API_BASE}/api/entities/${id}/members`);
  if (!res.ok) throw new Error(`Failed to fetch members: ${res.status}`);
  return res.json();
}

export async function seedData() {
  const res = await authFetch(`${API_BASE}/api/seed`, { method: 'POST' });
  if (!res.ok) throw new Error(`Seed failed: ${res.status}`);
  return res.json();
}

export async function startResearch(personCreate) {
  const res = await authFetch(`${API_BASE}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(personCreate),
  });
  if (!res.ok) throw new Error(`Research failed: ${res.status}`);
  return res.json();
}

export async function getJobStatus(jobId) {
  const res = await authFetch(`${API_BASE}/api/research/${jobId}`);
  if (!res.ok) throw new Error(`Job not found: ${res.status}`);
  return res.json();
}

export async function cancelJob(jobId) {
  const res = await authFetch(`${API_BASE}/api/research/${jobId}/cancel`, { method: 'POST' });
  if (!res.ok) throw new Error(`Cancel failed: ${res.status}`);
  return res.json();
}

export async function discoverMembers(entityId, prompt) {
  const res = await authFetch(`${API_BASE}/api/entities/${entityId}/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Discovery failed: ${res.status}`);
  return res.json();
}

export async function acceptEntityMember(entityId, discoveredName) {
  const res = await authFetch(`${API_BASE}/api/entities/${entityId}/members/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ discovered_name: discoveredName }),
  });
  if (!res.ok) throw new Error(`Accept failed: ${res.status}`);
  return res.json();
}

export async function rejectEntityMember(entityId, discoveredName) {
  const res = await authFetch(`${API_BASE}/api/entities/${entityId}/members/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ discovered_name: discoveredName }),
  });
  if (!res.ok) throw new Error(`Reject failed: ${res.status}`);
  return res.json();
}

export async function startEnrichment(personId) {
  const res = await authFetch(`${API_BASE}/api/enrich/${personId}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Enrichment failed: ${res.status}`);
  return res.json();
}

export async function updateIdentity(personId, data) {
  const res = await authFetch(`${API_BASE}/api/profiles/${personId}/identity`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Identity update failed: ${res.status}`);
  return res.json();
}

export async function resetResearch(personId) {
  const res = await authFetch(`${API_BASE}/api/profiles/${personId}/research`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Reset failed: ${res.status}`);
  return res.json();
}

export async function confirmSocialProfile(personId, url) {
  const res = await authFetch(`${API_BASE}/api/profiles/${personId}/social-profiles/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Confirm failed: ${res.status}`);
  return res.json();
}

export async function dismissSocialProfile(personId, url) {
  const res = await authFetch(`${API_BASE}/api/profiles/${personId}/social-profiles/dismiss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Dismiss failed: ${res.status}`);
  return res.json();
}

// Entity CRUD & research
export async function createEntity(data, caseId = '') {
  const params = caseId ? `?case_id=${encodeURIComponent(caseId)}` : '';
  const res = await authFetch(`${API_BASE}/api/entities${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Create entity failed: ${res.status}`);
  return res.json();
}

export async function updateEntity(id, data) {
  const res = await authFetch(`${API_BASE}/api/entities/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Update entity failed: ${res.status}`);
  return res.json();
}

export async function startEntityResearch(entityId) {
  const res = await authFetch(`${API_BASE}/api/entities/${entityId}/research`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Entity research failed: ${res.status}`);
  return res.json();
}

export async function verifyEntityFact(entityId, factId) {
  const res = await authFetch(`${API_BASE}/api/entities/${entityId}/facts/${factId}/verify`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Verify fact failed: ${res.status}`);
  return res.json();
}

export async function deleteEntityFact(entityId, factId) {
  const res = await authFetch(`${API_BASE}/api/entities/${entityId}/facts/${factId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Delete fact failed: ${res.status}`);
  return res.json();
}

export async function fetchEntityGraph(caseId = '') {
  const params = caseId ? `?case_id=${encodeURIComponent(caseId)}` : '';
  const res = await authFetch(`${API_BASE}/api/entities/graph${params}`);
  if (!res.ok) throw new Error(`Failed to fetch entity graph: ${res.status}`);
  return res.json();
}

// KORA requests
export async function generateKoraRequests(caseId) {
  const params = `?case_id=${encodeURIComponent(requireCaseId(caseId))}`;
  const res = await authFetch(`${API_BASE}/api/kora/generate${params}`, { method: 'POST' });
  if (!res.ok) throw new Error(`KORA generation failed: ${res.status}`);
  return res.json();
}

export async function fetchKoraRequests(entityId = '', caseId = '') {
  const params = new URLSearchParams();
  if (entityId) params.set('entity_id', entityId);
  if (caseId) params.set('case_id', caseId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await authFetch(`${API_BASE}/api/kora/requests${suffix}`);
  if (!res.ok) throw new Error(`Failed to fetch KORA requests: ${res.status}`);
  return res.json();
}

export async function updateKoraRequest(id, data) {
  const res = await authFetch(`${API_BASE}/api/kora/requests/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Update failed: ${res.status}`);
  return res.json();
}

export async function markKoraSent(id) {
  const res = await authFetch(`${API_BASE}/api/kora/requests/${id}/mark-sent`, { method: 'POST' });
  if (!res.ok) throw new Error(`Mark sent failed: ${res.status}`);
  return res.json();
}

// Document upload
export async function uploadDocument(file, {
  entityIds = [],
  personIds = [],
  koraRequestId = '',
  caseId = '',
  source = 'manual_upload',
  evidenceType = '',
  userDescription = '',
  documentDate = '',
  sourcePerson = '',
} = {}) {
  requireCaseId(caseId);
  const form = new FormData();
  form.append('file', file);
  form.append('entity_ids', entityIds.join(','));
  form.append('person_ids', personIds.join(','));
  form.append('kora_request_id', koraRequestId);
  form.append('case_id', caseId);
  form.append('source', source);
  form.append('evidence_type', evidenceType);
  form.append('user_description', userDescription);
  if (documentDate) form.append('document_date', documentDate);
  form.append('source_person', sourcePerson);
  const token = await authTokenGetter();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/documents/upload`, { method: 'POST', body: form, headers });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
  }
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function fetchDocuments(entityId = '', caseId = '') {
  const params = new URLSearchParams();
  if (entityId) params.set('entity_id', entityId);
  if (caseId) params.set('case_id', caseId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await authFetch(`${API_BASE}/api/documents${suffix}`);
  if (!res.ok) throw new Error(`Failed to fetch documents: ${res.status}`);
  return res.json();
}

// Workspaces and case reads
export async function fetchWorkspace() {
  const res = await authFetch(`${API_BASE}/api/workspace`);
  if (!res.ok) throw new Error(`Failed to fetch workspace: ${res.status}`);
  return res.json();
}

export async function fetchCases() {
  const res = await authFetch(`${API_BASE}/api/cases`);
  if (!res.ok) throw new Error(`Failed to fetch cases: ${res.status}`);
  return res.json();
}

export async function createCase(data) {
  const res = await authFetch(`${API_BASE}/api/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Create case failed: ${res.status}`);
  }
  return res.json();
}

export async function openOrCreateDraftCase() {
  const res = await authFetch(`${API_BASE}/api/cases/draft`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to open draft case: ${res.status}`);
  }
  return res.json();
}

export async function createIntakeSession() {
  const res = await authFetch(`${API_BASE}/api/intake/sessions`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to start chat: ${res.status}`);
  return res.json();
}

export async function sendIntakeMessage(sessionId, content) {
  const res = await authFetch(`${API_BASE}/api/intake/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Chat failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchCaseChatSession(caseId) {
  const res = await caseChatFetch(caseId, 'session', 'session');
  if (!res.ok) throw new Error(`Failed to load chat: ${res.status}`);
  return res.json();
}

export async function fetchCaseAdvocateSession(caseId) {
  return fetchCaseChatSession(caseId);
}

export async function sendCaseChatMessage(caseId, content, { intentHint = '' } = {}) {
  const res = await caseChatFetch(caseId, 'messages', 'messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, intent_hint: intentHint }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Chat failed: ${res.status}`);
  }
  return res.json();
}

export async function sendCaseAdvocateMessage(caseId, content) {
  return sendCaseChatMessage(caseId, content);
}

export async function clearCaseChat(caseId) {
  const res = await caseChatFetch(caseId, 'session/clear', 'session/clear', {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Clear chat failed: ${res.status}`);
  }
  return res.json();
}

function parseSseChunk(buffer, onEvent) {
  let rest = buffer;
  let boundary = rest.indexOf('\n\n');
  while (boundary !== -1) {
    const rawEvent = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    let event = 'message';
    const dataLines = [];
    rawEvent.split('\n').forEach((line) => {
      const trimmed = line.trimEnd();
      if (trimmed.startsWith('event:')) event = trimmed.slice(6).trim();
      if (trimmed.startsWith('data:')) dataLines.push(trimmed.slice(5).trim());
    });
    if (dataLines.length) {
      const dataText = dataLines.join('\n');
      const data = JSON.parse(dataText);
      onEvent?.({ type: event, data });
    }
    boundary = rest.indexOf('\n\n');
  }
  return rest;
}

function streamAbortContext(signal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId = null;
  const armTimeout = () => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return;
    if (timeoutId) globalThis.clearTimeout(timeoutId);
    timeoutId = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };
  const abortFromCaller = () => {
    if (!controller.signal.aborted) controller.abort(signal?.reason);
  };
  if (signal?.aborted) {
    abortFromCaller();
  } else if (signal) {
    signal.addEventListener('abort', abortFromCaller, { once: true });
  }
  armTimeout();
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    reset: armTimeout,
    cleanup: () => {
      if (timeoutId) globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener?.('abort', abortFromCaller);
    },
  };
}

export async function streamCaseChatMessage(caseId, content, {
  onEvent,
  intentHint = '',
  signal,
  timeoutMs = DEFAULT_CHAT_STREAM_TIMEOUT_MS,
} = {}) {
  requireCaseId(caseId);
  const abortContext = streamAbortContext(signal, timeoutMs);
  try {
    const res = await caseChatFetch(caseId, 'messages/stream', 'messages/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, intent_hint: intentHint }),
      signal: abortContext.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Chat failed: ${res.status}`);
    }
    if (!res.body) {
      const data = await res.json();
      onEvent?.({ type: 'complete', data });
      return data.session || data;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalSession = null;
    let streamError = null;
    const emit = (event) => {
      if (event.type === 'complete') finalSession = event.data.session;
      if (event.type === 'error') streamError = new Error(event.data.detail || 'Chat failed');
      onEvent?.(event);
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      abortContext.reset();
      buffer = parseSseChunk(buffer + decoder.decode(value, { stream: true }), emit);
    }
    buffer = parseSseChunk(buffer + decoder.decode(), emit);
    if (streamError) throw streamError;
    return finalSession;
  } catch (err) {
    if (abortContext.timedOut()) {
      throw new Error('Chat response timed out. Please try again.');
    }
    throw err;
  } finally {
    abortContext.cleanup();
  }
}

export async function streamCaseAdvocateMessage(caseId, content, options = {}) {
  return streamCaseChatMessage(caseId, content, options);
}

export async function approveCaseChatAction(caseId, actionId) {
  const res = await caseChatFetch(caseId, `actions/${actionId}/approve`, `actions/${actionId}/approve`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Chat action failed: ${res.status}`);
  }
  return res.json();
}

export async function approveCaseAdvocateAction(caseId, actionId) {
  return approveCaseChatAction(caseId, actionId);
}

export async function rejectCaseChatAction(caseId, actionId) {
  const res = await caseChatFetch(caseId, `actions/${actionId}/reject`, `actions/${actionId}/reject`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Chat action failed: ${res.status}`);
  }
  return res.json();
}

export async function rejectCaseAdvocateAction(caseId, actionId) {
  return rejectCaseChatAction(caseId, actionId);
}

export async function updateIntakeFacts(sessionId, facts) {
  const res = await authFetch(`${API_BASE}/api/intake/sessions/${sessionId}/facts`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ facts }),
  });
  if (!res.ok) throw new Error(`Failed to update case facts: ${res.status}`);
  return res.json();
}

export async function createCaseFromIntake(sessionId, supportConsent) {
  const res = await authFetch(`${API_BASE}/api/intake/sessions/${sessionId}/create-case`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ support_consent: supportConsent }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Create case failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchCase(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}`);
  if (!res.ok) throw new Error(`Case not found: ${res.status}`);
  return res.json();
}

export async function fetchCaseAccess(caseId) {
  requireCaseId(caseId);
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/access`);
  if (!res.ok) throw new Error(`Case access not found: ${res.status}`);
  return res.json();
}

export async function fetchCaseShares(caseId) {
  requireCaseId(caseId);
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/shares`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Case sharing failed: ${res.status}`);
  }
  return res.json();
}

export async function inviteCaseCollaborator(caseId, data) {
  requireCaseId(caseId);
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Invite failed: ${res.status}`);
  }
  return res.json();
}

export async function acceptCaseInvitation(token) {
  const res = await authFetch(`${API_BASE}/api/case-invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Invitation failed: ${res.status}`);
  }
  return res.json();
}

export async function updateCaseShareRole(caseId, grantId, role) {
  requireCaseId(caseId);
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/shares/${grantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Role update failed: ${res.status}`);
  }
  return res.json();
}

export async function revokeCaseShare(caseId, grantId) {
  requireCaseId(caseId);
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/shares/${grantId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Revoke failed: ${res.status}`);
  }
  return res.json();
}

export async function revokeCaseInvitation(caseId, invitationId) {
  requireCaseId(caseId);
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/invites/${invitationId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Invite revoke failed: ${res.status}`);
  }
  return res.json();
}

export async function updateCase(caseId, data) {
  requireCaseId(caseId);
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Update case failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchCaseFile(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/file`);
  if (!res.ok) throw new Error(`Case file not found: ${res.status}`);
  return res.json();
}

export async function uploadCaseDocument(caseId, file, metadata = {}) {
  requireCaseId(caseId);
  const form = new FormData();
  form.append('file', file);
  form.append('evidence_type', metadata.evidenceType || metadata.evidence_type || '');
  form.append('user_description', metadata.userDescription || metadata.user_description || '');
  if (metadata.documentDate || metadata.document_date) {
    form.append('document_date', metadata.documentDate || metadata.document_date);
  }
  form.append('source_person', metadata.sourcePerson || metadata.source_person || '');
  const token = await authTokenGetter();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/cases/${caseId}/documents`, {
    method: 'POST',
    body: form,
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Document upload failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchCaseDocuments(caseId, filters = {}) {
  requireCaseId(caseId);
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/documents${suffix}`);
  if (!res.ok) throw new Error(`Failed to fetch case documents: ${res.status}`);
  return res.json();
}

export async function searchCaseDocuments(caseId, filters = {}) {
  requireCaseId(caseId);
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/documents/search${suffix}`);
  if (!res.ok) throw new Error(`Evidence search failed: ${res.status}`);
  return res.json();
}

export async function fetchDocumentPreview(docId) {
  const res = await authFetch(`${API_BASE}/api/documents/${docId}/preview`);
  if (!res.ok) throw new Error(`Failed to preview document: ${res.status}`);
  return res.json();
}

export async function fetchDocumentContentBlob(docId) {
  const res = await authFetch(`${API_BASE}/api/documents/${docId}/content`);
  if (!res.ok) throw new Error(`Failed to load document file: ${res.status}`);
  return res.blob();
}

export async function updateDocument(docId, data) {
  const res = await authFetch(`${API_BASE}/api/documents/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Update document failed: ${res.status}`);
  return res.json();
}

export async function fetchGmailStatus(caseId = '') {
  const params = caseId ? `?case_id=${encodeURIComponent(caseId)}` : '';
  const res = await authFetch(`${API_BASE}/api/gmail/status${params}`);
  if (!res.ok) throw new Error(`Failed to fetch Gmail status: ${res.status}`);
  return res.json();
}

export async function saveGmailImportRule(data) {
  const res = await authFetch(`${API_BASE}/api/gmail/import-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save Gmail import rule: ${res.status}`);
  return res.json();
}

export async function startGmailOAuth(caseId) {
  const res = await authFetch(`${API_BASE}/api/gmail/oauth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_id: caseId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to start Gmail OAuth: ${res.status}`);
  }
  return res.json();
}

export async function searchGmailMessages(data) {
  const res = await authFetch(`${API_BASE}/api/gmail/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gmail search failed: ${res.status}`);
  }
  return res.json();
}

export async function importGmailMessages(data) {
  const res = await authFetch(`${API_BASE}/api/gmail/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gmail import failed: ${res.status}`);
  }
  return res.json();
}

export async function syncGmailMessages(data) {
  const res = await authFetch(`${API_BASE}/api/gmail/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gmail sync failed: ${res.status}`);
  }
  return res.json();
}

export async function disconnectGmail(caseId) {
  const res = await authFetch(`${API_BASE}/api/gmail/disconnect?case_id=${encodeURIComponent(caseId)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to disconnect Gmail: ${res.status}`);
  return res.json();
}

export async function startCaseEvaluation(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/evaluations`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Case Read failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchLatestEvaluation(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/evaluations/latest`);
  if (!res.ok) throw new Error(`Failed to fetch Case Read: ${res.status}`);
  return res.json();
}

export async function fetchCaseEvaluation(caseId, evaluationId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/evaluations/${evaluationId}`);
  if (!res.ok) throw new Error(`Case Read not found: ${res.status}`);
  return res.json();
}

export async function updateSupportConsent(caseId, data) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/support-consent`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Support preferences failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchSelfAdvocacyPacket(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/artifacts/self-advocacy-packet`);
  if (!res.ok) throw new Error(`Failed to fetch self-advocacy packet: ${res.status}`);
  return res.json();
}

export async function fetchEvidenceChecklist(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/artifacts/evidence-checklist`);
  if (!res.ok) throw new Error(`Failed to fetch evidence checklist: ${res.status}`);
  return res.json();
}

export async function fetchRecordsRequestDrafts(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/artifacts/records-request-drafts`);
  if (!res.ok) throw new Error(`Failed to fetch records drafts: ${res.status}`);
  return res.json();
}

export async function fetchCaseExport(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/export`);
  if (!res.ok) throw new Error(`Failed to export case: ${res.status}`);
  return res.json();
}

export async function deleteDocument(docId) {
  const res = await authFetch(`${API_BASE}/api/documents/${docId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete document failed: ${res.status}`);
  return res.json();
}
