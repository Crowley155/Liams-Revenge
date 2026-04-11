/**
 * Composite Relevance Score (CRS) — 5-factor weighted rubric
 *
 * Drawing from:
 *  - Wigmore Chart Method (inferential distance to ultimate proposition)
 *  - Bayesian likelihood ratios (probative value)
 *  - Multi-factor probative assessment (FRE / Prakken-Sartor)
 *
 * Factors (each 0-10, then weighted):
 *   Probative Value   (30%)  — how directly it proves/disproves a core claim
 *   Source Reliability (20%)  — primary doc, verified statute, or secondhand
 *   Corroboration     (20%)  — independent items supporting same conclusion
 *   Contradiction Exp (15%)  — participates in documented contradictions
 *   Legal Materiality (15%)  — maps to specific claim elements
 *
 * Formula: CRS = probative*3 + reliability*2 + corroboration*2 + contradiction*1.5 + materiality*1.5
 * Max = 10*(3+2+2+1.5+1.5) = 100
 *
 * Bands: 80-100 Critical | 60-79 High | 40-59 Moderate | 20-39 Supporting | 0-19 Background
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(__dirname, "..", "data", "case-data.json");
const data = JSON.parse(readFileSync(jsonPath, "utf-8"));

// ── Build lookup indexes ────────────────────────────────────────────

const claimsByDoc = new Map();
for (const claim of data.claims) {
  for (const docId of claim.keyEvidence || []) {
    if (!claimsByDoc.has(docId)) claimsByDoc.set(docId, []);
    claimsByDoc.get(docId).push(claim);
  }
}

const contradictionsByDoc = new Map();
for (const c of data.contradictions) {
  const docs = new Set();
  for (const claim of [c.claimA, c.claimB]) {
    if (!claim) continue;
    for (const id of claim.docIds || []) docs.add(id);
    if (claim.docId) docs.add(claim.docId);
  }
  for (const docId of docs) {
    if (!contradictionsByDoc.has(docId)) contradictionsByDoc.set(docId, []);
    contradictionsByDoc.get(docId).push(c);
  }
}

const threadMembers = new Map();
for (const thread of data.threads || []) {
  for (const docId of thread.docIds || []) {
    threadMembers.set(docId, thread.docIds.length);
  }
}

const claimsBySource = new Map();
for (const claim of data.claims) {
  for (const authId of claim.keyAuthorities || []) {
    // Match by citation substring, full citation, or source ID
    const src = data.sources.find(
      (s) =>
        s.citation === authId ||
        s.id === authId ||
        s.citation.includes(authId) ||
        authId.includes(s.citation)
    );
    if (src) {
      if (!claimsBySource.has(src.id)) claimsBySource.set(src.id, []);
      if (!claimsBySource.get(src.id).includes(claim))
        claimsBySource.get(src.id).push(claim);
    }
  }
  // Also check keyEvidence — documentary sources like JCPRD-HANDBOOK, SCHWANZ-MEMO
  // appear as evidence IDs in claims, and may also have matching source entries
  for (const evId of claim.keyEvidence || []) {
    const src = data.sources.find(
      (s) =>
        s.citation.includes(evId) ||
        s.id === evId ||
        (evId === "JCPRD-HANDBOOK" && s.id === "AUTH-41") ||
        (evId === "SCHWANZ-MEMO" && s.id === "AUTH-43")
    );
    if (src) {
      if (!claimsBySource.has(src.id)) claimsBySource.set(src.id, []);
      if (!claimsBySource.get(src.id).includes(claim))
        claimsBySource.get(src.id).push(claim);
    }
  }
}

// Documentary sources that double as evidence get contradiction exposure from their evidence counterparts
const docSourceToEvidence = new Map([
  ["AUTH-41", "JCPRD-HANDBOOK"],
  ["AUTH-43", "SCHWANZ-MEMO"],
]);

// ── Scoring helpers ─────────────────────────────────────────────────

function clamp(v, lo = 0, hi = 10) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function band(total) {
  if (total >= 80) return "critical";
  if (total >= 60) return "high";
  if (total >= 40) return "moderate";
  if (total >= 20) return "supporting";
  return "background";
}

function composite(f) {
  const raw =
    f.probative * 3 +
    f.reliability * 2 +
    f.corroboration * 2 +
    f.contradiction * 1.5 +
    f.materiality * 1.5;
  return Math.round(raw);
}

// ── Score evidence items ────────────────────────────────────────────

for (const ev of data.evidence) {
  const id = ev.id;

  // Probative: claims referencing this doc + critical contradictions
  const claims = claimsByDoc.get(id) || [];
  const contras = contradictionsByDoc.get(id) || [];
  const critContras = contras.filter((c) => c.severity === "critical").length;
  const probativeRaw = claims.length * 2.5 + critContras * 2 + contras.length * 0.5;
  const probative = clamp(probativeRaw);

  // Reliability: type-based
  const reliabilityMap = {
    email: 8,
    "incident-report": 7,
    pdf: 7,
    "board-memo": 9,
    "pdf-not-extracted": 3,
  };
  let reliability = reliabilityMap[ev.type] || 5;
  if (ev.bodyText && ev.bodyText.length > 200) reliability = Math.min(10, reliability + 1);
  if (ev.type === "pdf-not-extracted") reliability = 3;
  reliability = clamp(reliability);

  // Corroboration: thread siblings + shared contradiction docs
  const threadSize = threadMembers.get(id) || 1;
  const sharedContraDocs = new Set();
  for (const c of contras) {
    for (const claim of [c.claimA, c.claimB]) {
      if (!claim) continue;
      for (const did of claim.docIds || []) {
        if (did !== id) sharedContraDocs.add(did);
      }
    }
  }
  const corroborationRaw = (threadSize - 1) * 0.8 + sharedContraDocs.size * 1.2;
  const corroboration = clamp(corroborationRaw);

  // Contradiction exposure
  const contradictionRaw = contras.length * 2.5 + critContras * 1.5;
  const contradiction = clamp(contradictionRaw);

  // Materiality: number of distinct claims + smoking gun bonus
  const hasSmoking = claims.some((c) => c.smokingGun && c.smokingGun.length > 0);
  const materialityRaw = claims.length * 2 + (hasSmoking ? 3 : 0);
  const materiality = clamp(materialityRaw);

  const factors = { probative, reliability, corroboration, contradiction, materiality };
  const total = composite(factors);

  ev.relevanceScore = { total, band: band(total), factors };
}

// ── Score source items ──────────────────────────────────────────────

for (const src of data.sources) {
  // Probative: claims referencing this source's citation
  const claims = claimsBySource.get(src.id) || [];
  let probativeRaw = claims.length * 3;
  if (src.keyQuote) probativeRaw += 2;
  const probative = clamp(probativeRaw);

  // Reliability: verification status + type
  const verMap = {
    "VERIFIED PRIMARY": 10,
    VERIFIED: 9,
    "VERIFIED SECONDARY": 7,
    "VERIFY WITH COUNSEL": 5,
  };
  const typeBonus = { statute: 1, regulation: 1, documentary: 0, case: 0, "case-persuasive": -1, secondary: -1 };
  let reliability = clamp((verMap[src.verification] || 5) + (typeBonus[src.type] || 0));

  // Corroboration: other sources referenced by the same claims
  const peerSources = new Set();
  for (const claim of claims) {
    for (const auth of claim.keyAuthorities || []) {
      const peer = data.sources.find((s) => s.citation === auth);
      if (peer && peer.id !== src.id) peerSources.add(peer.id);
    }
  }
  const corroboration = clamp(peerSources.size * 1.5);

  // Contradiction: check if the source has a documentary evidence counterpart
  // that appears in contradictions, or if claims citing this source involve critical contras
  let contradictionRaw = 0;
  const evCounterpart = docSourceToEvidence.get(src.id);
  if (evCounterpart) {
    const directContras = contradictionsByDoc.get(evCounterpart) || [];
    contradictionRaw += directContras.length * 2.5;
    contradictionRaw += directContras.filter((c) => c.severity === "critical").length * 1.5;
  }
  for (const claim of claims) {
    for (const docId of claim.keyEvidence || []) {
      const docContras = contradictionsByDoc.get(docId) || [];
      contradictionRaw += docContras.filter((c) => c.severity === "critical").length * 0.5;
    }
  }
  const contradiction = clamp(contradictionRaw);

  // Materiality
  const materialityRaw = claims.length * 2.5 + (src.url ? 1 : 0);
  const materiality = clamp(materialityRaw);

  const factors = { probative, reliability, corroboration, contradiction, materiality };
  const total = composite(factors);

  src.relevanceScore = { total, band: band(total), factors };
}

// ── Write ───────────────────────────────────────────────────────────
writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n", "utf-8");

// Stats
const evScores = data.evidence.map((e) => e.relevanceScore.total);
const srcScores = data.sources.map((s) => s.relevanceScore.total);
const evBands = {};
data.evidence.forEach((e) => { evBands[e.relevanceScore.band] = (evBands[e.relevanceScore.band] || 0) + 1; });
const srcBands = {};
data.sources.forEach((s) => { srcBands[s.relevanceScore.band] = (srcBands[s.relevanceScore.band] || 0) + 1; });

console.log("✓ Scores applied to case-data.json");
console.log(`  Evidence (${data.evidence.length}): min=${Math.min(...evScores)} max=${Math.max(...evScores)} avg=${Math.round(evScores.reduce((a,b)=>a+b,0)/evScores.length)}`);
console.log(`    Bands:`, evBands);
console.log(`  Sources (${data.sources.length}): min=${Math.min(...srcScores)} max=${Math.max(...srcScores)} avg=${Math.round(srcScores.reduce((a,b)=>a+b,0)/srcScores.length)}`);
console.log(`    Bands:`, srcBands);
