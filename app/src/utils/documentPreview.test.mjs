import assert from 'node:assert/strict';
import test from 'node:test';

import { canPreviewOriginal, documentDisplayKind } from './documentPreview.js';

test('documentDisplayKind normalizes PDFs and images from MIME type or filename', () => {
  assert.equal(documentDisplayKind({ filename: 'Incident Report.PDF', file_type: '', mime_type: '' }), 'pdf');
  assert.equal(documentDisplayKind({ filename: 'scan', file_type: '', mime_type: 'image/png' }), 'image');
  assert.equal(documentDisplayKind({ filename: 'email.eml', file_type: '', mime_type: 'message/rfc822' }), 'eml');
  assert.equal(documentDisplayKind({ filename: 'notes.txt', file_type: '', mime_type: 'text/plain' }), 'txt');
});

test('canPreviewOriginal allows browser-native originals only', () => {
  assert.equal(canPreviewOriginal({ filename: 'meeting.pdf', file_type: '', mime_type: 'application/pdf' }), true);
  assert.equal(canPreviewOriginal({ filename: 'photo.jpg', file_type: '', mime_type: '' }), true);
  assert.equal(canPreviewOriginal({ filename: 'notes.txt', file_type: 'txt', mime_type: 'text/plain' }), false);
  assert.equal(canPreviewOriginal({ filename: 'packet.docx', file_type: 'docx', mime_type: '' }), false);
});
