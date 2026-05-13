export const ACCEPTED_EVIDENCE_FILE_TYPES = '.pdf,.jpg,.jpeg,.png,.tiff,.tif,.webp,.bmp,.docx,.eml,.txt,.md';
export const IMAGE_COMPRESS_THRESHOLD = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2600;

export const EVIDENCE_CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'messages', label: 'Messages' },
  { value: 'school_records', label: 'School records' },
  { value: 'iep_504_services', label: 'IEP/504 and services' },
  { value: 'incident_safety', label: 'Incident and safety' },
  { value: 'policy_rules', label: 'Policies and rules' },
  { value: 'medical_provider', label: 'Medical/outside provider' },
  { value: 'complaints_agency', label: 'Complaints and agency letters' },
  { value: 'photos_screenshots', label: 'Photos/screenshots' },
  { value: 'other', label: 'Other' },
];

export const EVIDENCE_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'indexed', label: 'Ready' },
  { value: 'processing', label: 'Being read' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'failed', label: 'Needs attention' },
];

const EVIDENCE_ROLE_LABELS = {
  direct_incident_evidence: 'Direct incident evidence',
  medical_harm_evidence: 'Medical harm evidence',
  notice_communication: 'Notice communication',
  policy_standard: 'Policy standard',
  prior_or_related_incident: 'Prior or related incident',
  supporting_context: 'Supporting context',
};

const LEGAL_FLAG_LABELS = {
  supervision: 'Supervision',
  staffing: 'Staffing',
  injury_response: 'Injury response',
  notice: 'Notice',
  policy_standard: 'Policy standard',
  age_grouping: 'Age grouping',
  prior_incidents: 'Prior incidents',
  investigation_records: 'Investigation records',
  disability_supports: 'IEP/504',
  civil_rights: 'Civil rights',
};

export function evidenceStatusOf(doc) {
  return doc.processing_status || doc.status || 'uploaded';
}

export const EVIDENCE_TYPE_CATEGORY_MAP = {
  communications: 'messages',
  email_export: 'messages',
  email_message: 'messages',
  message: 'messages',
  meeting_notes: 'school_records',
  school_record: 'school_records',
  board_minutes: 'school_records',
  attendance: 'school_records',
  iep_504: 'iep_504_services',
  evaluation: 'iep_504_services',
  accommodation: 'iep_504_services',
  critical_incident: 'incident_safety',
  incident_report: 'incident_safety',
  prior_incident: 'incident_safety',
  staff_log: 'incident_safety',
  staff_training: 'incident_safety',
  safety_record: 'incident_safety',
  medical: 'medical_provider',
  provider_record: 'medical_provider',
  agency_letter: 'complaints_agency',
  complaint: 'complaints_agency',
  licensing: 'complaints_agency',
  investigation: 'complaints_agency',
  policy: 'policy_rules',
  regulation: 'policy_rules',
  lease_contract: 'policy_rules',
  insurance: 'policy_rules',
  photo: 'photos_screenshots',
  screenshot: 'photos_screenshots',
  image: 'photos_screenshots',
};

export function documentCategoryOf(doc = {}) {
  if (doc.inferred_category && doc.inferred_category !== 'other') return doc.inferred_category;
  const taggedCategory = (doc.tags || []).find((tag) => EVIDENCE_CATEGORY_OPTIONS.some((option) => option.value === tag));
  if (taggedCategory && taggedCategory !== 'other') return taggedCategory;
  const mapped = EVIDENCE_TYPE_CATEGORY_MAP[doc.evidence_type || ''];
  if (mapped) return mapped;
  return doc.inferred_category || taggedCategory || 'other';
}

export function evidenceCategoryLabel(value, fallbackFormatter) {
  return EVIDENCE_CATEGORY_OPTIONS.find((item) => item.value === value)?.label || fallbackFormatter(value || 'evidence');
}

export function documentCategoryLabel(doc, fallbackFormatter) {
  const category = documentCategoryOf(doc);
  if (!category) return 'Uncategorized';
  return evidenceCategoryLabel(category, fallbackFormatter);
}

export function evidenceRoleLabel(value, fallbackFormatter = (item) => item) {
  return EVIDENCE_ROLE_LABELS[value] || fallbackFormatter(value || 'supporting_context');
}

export function legalFlagLabel(value, fallbackFormatter = (item) => item) {
  return LEGAL_FLAG_LABELS[value] || fallbackFormatter(value || 'issue');
}

export function relevancePercent(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

export function evidenceStatusHelp(status) {
  return {
    indexed: 'Ready for review and Case Reads.',
    processing: 'Uploaded and being read by USDWatch.',
    uploaded: 'Queued for review.',
    needs_review: 'Saved, but the text needs a closer look before USDWatch can fully read it.',
    failed: 'Saved, but USDWatch had trouble reading it. Review the original or try uploading again.',
  }[status] || 'Saved in your Evidence Locker.';
}

export const SMART_STACKS = [
  { key: 'all', label: 'All evidence' },
  { key: 'needs_attention', label: 'Needs attention' },
  { key: 'highly_relevant', label: 'Highly relevant' },
  { key: 'incident_safety', label: 'Incident and safety' },
  { key: 'medical_provider', label: 'Medical/provider' },
  { key: 'policy_rules', label: 'Policies and rules' },
  { key: 'messages', label: 'Messages' },
  { key: 'school_records', label: 'School records' },
  { key: 'no_date', label: 'No date' },
  { key: 'recently_added', label: 'Recently added' },
];

export function stackMatchesDocument(doc, stackKey) {
  if (!stackKey || stackKey === 'all') return true;
  const status = evidenceStatusOf(doc);
  const category = documentCategoryOf(doc);
  if (stackKey === 'needs_attention') {
    return ['needs_review', 'failed'].includes(status) || doc.insight_status === 'failed' || doc.insight_status === 'skipped';
  }
  if (stackKey === 'highly_relevant') {
    return Number(doc.relevance_score || 0) >= 0.75 || (doc.tags || []).includes('highly_relevant');
  }
  if (stackKey === 'no_date') return !doc.document_date;
  if (stackKey === 'recently_added') return true;
  return category === stackKey || (doc.tags || []).includes(stackKey);
}

export function buildSmartStacks(documents = []) {
  const recentCutoff = [...documents]
    .sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0))
    .slice(0, Math.min(10, documents.length))
    .map((doc) => doc.id);
  return SMART_STACKS.map((stack) => {
    const count = stack.key === 'recently_added'
      ? documents.filter((doc) => recentCutoff.includes(doc.id)).length
      : documents.filter((doc) => stackMatchesDocument(doc, stack.key)).length;
    return { ...stack, count };
  });
}

export function filterDocumentsByStack(documents = [], stackKey = 'all') {
  if (stackKey === 'recently_added') {
    return [...documents]
      .sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0))
      .slice(0, Math.min(10, documents.length));
  }
  return documents.filter((doc) => stackMatchesDocument(doc, stackKey));
}

export function filterEvidenceDocuments(documents = [], filters = {}) {
  const q = (filters.q || '').trim().toLowerCase();
  return documents.filter((doc) => {
    const status = evidenceStatusOf(doc);
    const category = documentCategoryOf(doc);
    if (filters.status && status !== filters.status) return false;
    if (filters.category && category !== filters.category && !(doc.tags || []).includes(filters.category)) return false;
    if (!q) return true;
    return [
      doc.filename,
      doc.user_description,
      doc.source_person,
      doc.evidence_type,
      doc.inferred_category,
      doc.document_summary,
      doc.case_relevance,
      ...(doc.tags || []),
    ].join(' ').toLowerCase().includes(q);
  });
}

export function documentInsightSummary(doc = {}) {
  if (doc.document_summary || doc.case_relevance) {
    return {
      summary: doc.document_summary || 'Summary not available yet.',
      relevance: doc.case_relevance || 'Case connection not available yet.',
      status: doc.insight_status || 'ready',
    };
  }
  if (doc.insight_status === 'skipped') {
    return {
      summary: 'Text review needed before USDWatch can summarize this document.',
      relevance: doc.insight_error || 'Upload a text-readable version or review the original file.',
      status: 'skipped',
    };
  }
  if (doc.insight_status === 'failed') {
    return {
      summary: 'Document summary failed.',
      relevance: doc.insight_error || 'Try again later or download the original.',
      status: 'failed',
    };
  }
  return {
    summary: 'USDWatch is preparing a document summary.',
    relevance: 'Case connection will appear after USDWatch finishes reading the file.',
    status: doc.insight_status || 'pending',
  };
}

export async function maybeCompressImage(file) {
  if (!file.type.startsWith('image/') || file.size <= IMAGE_COMPRESS_THRESHOLD) return { file, compressed: false };
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob || blob.size >= file.size) return { file, compressed: false };
  const nextName = file.name.replace(/\.[^.]+$/, '') + '-compressed.jpg';
  return { file: new File([blob], nextName, { type: 'image/jpeg' }), compressed: true };
}
