from __future__ import annotations

import argparse
import json

from app.api._store import case_documents
from app.db import init_db
from app.services.document_classifier import infer_document_metadata
from app.time import normalize_utc


def backfill_document_metadata(
    *,
    limit: int = 500,
    force: bool = False,
    workspace_id: str = "",
    case_id: str = "",
    store_chunks: bool = False,
) -> dict:
    init_db()
    documents = [
        doc for doc in case_documents.values()
        if (not workspace_id or doc.workspace_id == workspace_id)
        and (not case_id or doc.case_id == case_id)
    ]
    documents.sort(key=lambda doc: normalize_utc(doc.uploaded_at), reverse=True)

    processed = 0
    updated_metadata = 0
    chunked = 0
    skipped = 0
    failed = 0

    for doc in documents:
        if processed >= limit:
            break

        try:
            category, confidence, tags, inferred_type = infer_document_metadata(
                doc.filename,
                doc.extracted_text,
                doc.evidence_type,
            )
            should_update_category = (
                force
                or not doc.inferred_category
                or doc.inferred_category == "other"
                or confidence > doc.category_confidence
            )
            changed = False
            if should_update_category:
                doc.inferred_category = category
                doc.category_confidence = confidence
                changed = True
            next_tags = sorted(set([*doc.tags, *tags]))
            if next_tags != doc.tags:
                doc.tags = next_tags
                changed = True
            if not doc.evidence_type and inferred_type:
                doc.evidence_type = inferred_type
                changed = True

            if store_chunks and doc.extracted_text.strip() and not doc.qdrant_point_ids:
                from app.services.qdrant_client import store_document_chunks
                from app.services.text_chunker import chunk_text

                chunks = chunk_text(doc.extracted_text, doc.id)
                point_ids = store_document_chunks(
                    chunks=chunks,
                    document_id=doc.id,
                    entity_ids=doc.entity_ids,
                    person_ids=doc.person_ids,
                    source=doc.source or "uploaded_document",
                    metadata={
                        "filename": doc.filename,
                        "case_id": doc.case_id,
                        "email_message_id": doc.email_message_id,
                        "parent_document_id": doc.parent_document_id,
                    },
                )
                if point_ids:
                    doc.qdrant_point_ids = point_ids
                    doc.chunk_count = len(chunks)
                    chunked += 1
                    changed = True

            if changed:
                case_documents[doc.id] = doc
                updated_metadata += 1
            else:
                skipped += 1
            processed += 1
        except Exception:
            failed += 1
            processed += 1

    return {
        "documents": len(documents),
        "processed": processed,
        "updated_metadata": updated_metadata,
        "chunked": chunked,
        "skipped": skipped,
        "failed": failed,
        "remaining": max(len(documents) - processed, 0),
        "workspace_id": workspace_id,
        "case_id": case_id,
        "force": force,
        "store_chunks": store_chunks,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill USDWatch document categories and optional semantic chunks.")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workspace-id", default="")
    parser.add_argument("--case-id", default="")
    parser.add_argument("--store-chunks", action="store_true")
    args = parser.parse_args()
    result = backfill_document_metadata(
        limit=args.limit,
        force=args.force,
        workspace_id=args.workspace_id,
        case_id=args.case_id,
        store_chunks=args.store_chunks,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
