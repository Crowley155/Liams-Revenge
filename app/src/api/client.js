const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'usdwatch_token';

function authFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return fetch(url, { ...options, headers }).then((res) => {
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.hash = '#/login';
    }
    return res;
  });
}

// --- Public endpoints (no auth required) ---

export async function fetchProfiles() {
  const res = await fetch(`${API_BASE}/api/profiles`);
  if (!res.ok) throw new Error(`Failed to fetch profiles: ${res.status}`);
  return res.json();
}

export async function fetchEntities() {
  const res = await fetch(`${API_BASE}/api/entities`);
  if (!res.ok) throw new Error(`Failed to fetch entities: ${res.status}`);
  return res.json();
}

// --- Protected endpoints ---

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

export async function confirmIdentity(personId) {
  const res = await authFetch(`${API_BASE}/api/profiles/${personId}/confirm-identity`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Confirm failed: ${res.status}`);
  return res.json();
}

export async function resetResearch(personId) {
  const res = await authFetch(`${API_BASE}/api/profiles/${personId}/research`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Reset failed: ${res.status}`);
  return res.json();
}

export async function deleteProfile(personId) {
  const res = await authFetch(`${API_BASE}/api/profiles/${personId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
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

// KORA requests
export async function generateKoraRequests() {
  const res = await authFetch(`${API_BASE}/api/kora/generate`, { method: 'POST' });
  if (!res.ok) throw new Error(`KORA generation failed: ${res.status}`);
  return res.json();
}

export async function fetchKoraRequests(entityId = '') {
  const params = entityId ? `?entity_id=${entityId}` : '';
  const res = await authFetch(`${API_BASE}/api/kora/requests${params}`);
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
export async function uploadDocument(file, { entityIds = [], personIds = [], koraRequestId = '', source = 'manual_upload' } = {}) {
  const form = new FormData();
  form.append('file', file);
  form.append('entity_ids', entityIds.join(','));
  form.append('person_ids', personIds.join(','));
  form.append('kora_request_id', koraRequestId);
  form.append('source', source);
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/documents/upload`, { method: 'POST', body: form, headers });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.hash = '#/login';
  }
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function fetchDocuments(entityId = '') {
  const params = entityId ? `?entity_id=${entityId}` : '';
  const res = await authFetch(`${API_BASE}/api/documents${params}`);
  if (!res.ok) throw new Error(`Failed to fetch documents: ${res.status}`);
  return res.json();
}
