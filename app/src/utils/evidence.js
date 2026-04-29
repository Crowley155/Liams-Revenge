export const ACCEPTED_EVIDENCE_FILE_TYPES = '.pdf,.jpg,.jpeg,.png,.tiff,.tif,.webp,.bmp,.docx,.eml,.txt,.md';
export const IMAGE_COMPRESS_THRESHOLD = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2600;

export const EVIDENCE_CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'messages', label: 'Messages' },
  { value: 'school_records', label: 'School records' },
  { value: 'iep_504_services', label: 'IEP/504 and services' },
  { value: 'incident_safety', label: 'Incident and safety' },
  { value: 'medical_provider', label: 'Medical/outside provider' },
  { value: 'complaints_agency', label: 'Complaints and agency letters' },
  { value: 'photos_screenshots', label: 'Photos/screenshots' },
  { value: 'other', label: 'Other' },
];

export const EVIDENCE_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'indexed', label: 'Indexed' },
  { value: 'processing', label: 'Processing' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'failed', label: 'Failed' },
];

export function evidenceStatusOf(doc) {
  return doc.processing_status || doc.status || 'uploaded';
}

export function evidenceCategoryLabel(value, fallbackFormatter) {
  return EVIDENCE_CATEGORY_OPTIONS.find((item) => item.value === value)?.label || fallbackFormatter(value || 'evidence');
}

export function evidenceStatusHelp(status) {
  return {
    indexed: 'Ready for search and Case Reads.',
    processing: 'Uploaded and being read by USDWatch.',
    uploaded: 'Queued for processing.',
    needs_review: 'Saved, but OCR or human review is needed before USDWatch can fully read it.',
    failed: 'Saved with a processing error. You can preview details or try uploading again.',
  }[status] || 'Saved in your Evidence Locker.';
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
