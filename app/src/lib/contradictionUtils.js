/** Normalize case-data contradiction objects (nested claimA/B) for UI. */
export function normalizeContradiction(c) {
  const ca = c.claimA;
  const cb = c.claimB;
  const claimAText = typeof ca === 'string' ? ca : ca?.text ?? '';
  const claimBText = typeof cb === 'string' ? cb : cb?.text ?? '';
  const docIdA = c.docIdA ?? (Array.isArray(ca?.docIds) ? ca.docIds[0] : undefined);
  const docIdB = c.docIdB ?? (Array.isArray(cb?.docIds) ? cb.docIds[0] : undefined);
  const actorA = c.actorA ?? (typeof ca === 'object' ? ca?.actor : undefined);
  const actorB = c.actorB ?? (typeof cb === 'object' ? cb?.actor : undefined);
  const label = c.label ?? c.title ?? c.id;
  const summary = c.summary ?? c.impact ?? '';
  const implication = c.implication ?? c.impact;
  return {
    ...c,
    label,
    summary,
    claimA: claimAText,
    claimB: claimBText,
    docIdA,
    docIdB,
    actorA,
    actorB,
    implication,
  };
}

export function contradictionReferencesDoc(c, docId) {
  if (!docId || !c) return false;
  if (c.docIdA === docId || c.docIdB === docId) return true;
  const a = c.claimA?.docIds;
  const b = c.claimB?.docIds;
  return (Array.isArray(a) && a.includes(docId)) || (Array.isArray(b) && b.includes(docId));
}
