const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function fetchProfiles() {
  const res = await fetch(`${API_BASE}/api/profiles`);
  if (!res.ok) throw new Error(`Failed to fetch profiles: ${res.status}`);
  return res.json();
}

export async function fetchProfile(id) {
  const res = await fetch(`${API_BASE}/api/profiles/${id}`);
  if (!res.ok) throw new Error(`Profile not found: ${res.status}`);
  return res.json();
}

export async function fetchEntities() {
  const res = await fetch(`${API_BASE}/api/entities`);
  if (!res.ok) throw new Error(`Failed to fetch entities: ${res.status}`);
  return res.json();
}

export async function fetchEntity(id) {
  const res = await fetch(`${API_BASE}/api/entities/${id}`);
  if (!res.ok) throw new Error(`Entity not found: ${res.status}`);
  return res.json();
}

export async function fetchEntityMembers(id) {
  const res = await fetch(`${API_BASE}/api/entities/${id}/members`);
  if (!res.ok) throw new Error(`Failed to fetch members: ${res.status}`);
  return res.json();
}

export async function seedData() {
  const res = await fetch(`${API_BASE}/api/seed`, { method: 'POST' });
  if (!res.ok) throw new Error(`Seed failed: ${res.status}`);
  return res.json();
}

export async function startResearch(personCreate) {
  const res = await fetch(`${API_BASE}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(personCreate),
  });
  if (!res.ok) throw new Error(`Research failed: ${res.status}`);
  return res.json();
}

export async function getJobStatus(jobId) {
  const res = await fetch(`${API_BASE}/api/research/${jobId}`);
  if (!res.ok) throw new Error(`Job not found: ${res.status}`);
  return res.json();
}

export async function discoverMembers(entityId) {
  const res = await fetch(`${API_BASE}/api/entities/${entityId}/discover`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Discovery failed: ${res.status}`);
  return res.json();
}

export async function startEnrichment(personId) {
  const res = await fetch(`${API_BASE}/api/enrich/${personId}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Enrichment failed: ${res.status}`);
  return res.json();
}

export async function updateIdentity(personId, data) {
  const res = await fetch(`${API_BASE}/api/profiles/${personId}/identity`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Identity update failed: ${res.status}`);
  return res.json();
}

export async function confirmIdentity(personId) {
  const res = await fetch(`${API_BASE}/api/profiles/${personId}/confirm-identity`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Confirm failed: ${res.status}`);
  return res.json();
}
