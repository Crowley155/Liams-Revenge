const STATUS_LABELS = {
  not_ready: 'Not ready',
  needs_more_info: 'Needs more information',
  plausible_for_ocr_review: 'Potential OCR issue',
  strong_readiness: 'Strong OCR readiness',
};

const STATUS_TONES = {
  not_ready: 'neutral',
  needs_more_info: 'warning',
  plausible_for_ocr_review: 'info',
  strong_readiness: 'success',
};

const GATE_LABELS = {
  jurisdiction: 'OCR-covered school or program',
  protected_basis: 'Protected civil-rights basis',
  timeliness: 'OCR timing screen',
  factual_sufficiency: 'Concrete facts',
  evidence_support: 'Source support',
};

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

export function hasOcrReadiness(result) {
  return Boolean(result?.ocr_readiness);
}
