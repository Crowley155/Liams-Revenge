from __future__ import annotations

from app.time import utc_now

import logging

from app.api._store import case_documents
from app.models import CaseDocument
from app.services.document_classifier import infer_document_metadata

logger = logging.getLogger(__name__)


def process_document_bytes(doc: CaseDocument, content: bytes) -> CaseDocument:
    """Parse, classify, chunk, and index a CaseDocument from original bytes."""
    try:
        from app.services.document_parser import parse_file
        from app.services.qdrant_client import store_document_chunks
        from app.services.text_chunker import chunk_text

        extracted, file_type = parse_file(doc.filename, content)
        doc.file_type = file_type
        doc.extracted_text = extracted

        category, confidence, tags, inferred_type = infer_document_metadata(doc.filename, extracted)
        doc.inferred_category = doc.inferred_category or category
        doc.category_confidence = doc.category_confidence or confidence
        doc.tags = sorted(set([*doc.tags, *tags]))
        if not doc.evidence_type:
            doc.evidence_type = inferred_type

        if extracted.startswith("[OCR extraction needed:"):
            doc.status = "processing"
            doc.processing_status = "needs_review"
            doc.ocr_status = "queued"
            doc.failure_reason = extracted
            doc.chunk_count = 0
        elif extracted and not extracted.startswith("["):
            chunks = chunk_text(extracted, doc.id)
            doc.chunk_count = len(chunks)
            doc.qdrant_point_ids = store_document_chunks(
                chunks=chunks,
                document_id=doc.id,
                entity_ids=doc.entity_ids,
                person_ids=doc.person_ids,
                source=doc.source,
                metadata={
                    "filename": doc.filename,
                    "case_id": doc.case_id,
                    "email_message_id": doc.email_message_id,
                    "parent_document_id": doc.parent_document_id,
                },
            )
            doc.status = "indexed"
            doc.processing_status = "indexed"
            doc.error = None
            doc.failure_reason = None
        else:
            doc.status = "failed"
            doc.processing_status = "failed"
            doc.error = "No text could be extracted"
            doc.failure_reason = doc.error
        doc.processed_at = utc_now()
    except Exception as exc:
        logger.exception("Document processing failed for %s", doc.id)
        doc.status = "failed"
        doc.processing_status = "failed"
        doc.error = str(exc)
        doc.failure_reason = str(exc)
        doc.processed_at = utc_now()

    case_documents[doc.id] = doc
    return doc
