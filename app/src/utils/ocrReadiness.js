const STATUS_LABELS = {
  no_ocr_theory_indicated: 'No OCR theory indicated yet',
  needs_more_info: 'Needs more information',
  possible_ocr_question: 'Possible OCR question',
  evidence_supported_ocr_question: 'Evidence-supported OCR question',
};

const STATUS_TONES = {
  no_ocr_theory_indicated: 'neutral',
  needs_more_info: 'warning',
  possible_ocr_question: 'info',
  evidence_supported_ocr_question: 'success',
};

const GATE_LABELS = {
  jurisdiction: 'OCR-covered school or program',
  protected_basis: 'Protected civil-rights basis',
  protected_activity: 'Protected activity',
  adverse_action: 'Adverse action or denial',
  causal_nexus: 'Protected-basis connection',
  timeliness: 'OCR timing screen',
  factual_sufficiency: 'Concrete facts',
  evidence_support: 'Source support',
  limiting_facts: 'Limiting facts',
};

export const OCR_SCHEMA_VERSION = 'ocr_readiness_v2';

export function ocrStatusLabel(status) {
  return STATUS_LABELS[status] || 'Needs review';
}

export function ocrStatusTone(status) {
  return STATUS_TONES[status] || 'neutral';
}

export function ocrGateLabel(gate = {}) {
  return gate.label || GATE_LABELS[gate.key] || 'Readiness check';
}

export function summarizeOcrSources(sourceRefs = []) {
  const count = sourceRefs.length;
  if (!count) return 'No authority references attached yet.';
  return `${count} authority reference${count === 1 ? '' : 's'}`;
}

export function hasCurrentOcrReadiness(result) {
  return result?.ocr_readiness?.schema_version === OCR_SCHEMA_VERSION;
}

export function reviewedEvidenceHref(caseId, evidence = {}) {
  if (evidence.route) return evidence.route;
  if (caseId && evidence.document_id) return `/cases/${caseId}/locker/${evidence.document_id}`;
  return '';
}
