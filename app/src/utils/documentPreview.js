const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff']);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json']);

function extensionOf(filename = '') {
  const clean = String(filename).split('?')[0].split('#')[0];
  const index = clean.lastIndexOf('.');
  return index >= 0 ? clean.slice(index).toLowerCase() : '';
}

export function documentDisplayKind(doc = {}) {
  const explicit = String(doc.file_type || '').toLowerCase();
  if (['pdf', 'image', 'docx', 'eml', 'txt'].includes(explicit)) return explicit;

  const mime = String(doc.mime_type || '').toLowerCase();
  const ext = extensionOf(doc.filename);

  if (mime.includes('pdf') || ext === '.pdf') return 'pdf';
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (mime.includes('wordprocessingml') || ext === '.docx') return 'docx';
  if (mime === 'message/rfc822' || ext === '.eml') return 'eml';
  if (mime.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'txt';
  return explicit || 'document';
}

export function canPreviewOriginal(doc = {}) {
  const kind = documentDisplayKind(doc);
  return kind === 'pdf' || kind === 'image';
}
