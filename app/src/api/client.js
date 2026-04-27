const API_BASE =
  import.meta.env.PUBLIC_API_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8000';
const TOKEN_KEY = 'usdwatch_token';

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
export async function generateKoraRequests(caseId = 'crowley-v-usd232') {
  const params = caseId ? `?case_id=${encodeURIComponent(caseId)}` : '';
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
  caseId = 'crowley-v-usd232',
  source = 'manual_upload',
  evidenceType = '',
  userDescription = '',
  documentDate = '',
  sourcePerson = '',
} = {}) {
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

// Workspaces and case evaluations
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

export async function fetchCase(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}`);
  if (!res.ok) throw new Error(`Case not found: ${res.status}`);
  return res.json();
}

export async function fetchCaseFile(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/file`);
  if (!res.ok) throw new Error(`Case file not found: ${res.status}`);
  return res.json();
}

export async function uploadCaseDocument(caseId, file, metadata = {}) {
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

export async function fetchCaseDocuments(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/documents`);
  if (!res.ok) throw new Error(`Failed to fetch case documents: ${res.status}`);
  return res.json();
}

export async function startCaseEvaluation(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/evaluations`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Evaluation failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchLatestEvaluation(caseId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/evaluations/latest`);
  if (!res.ok) throw new Error(`Failed to fetch evaluation: ${res.status}`);
  return res.json();
}

export async function fetchCaseEvaluation(caseId, evaluationId) {
  const res = await authFetch(`${API_BASE}/api/cases/${caseId}/evaluations/${evaluationId}`);
  if (!res.ok) throw new Error(`Evaluation not found: ${res.status}`);
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
