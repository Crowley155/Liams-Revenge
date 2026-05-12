from __future__ import annotations

import argparse
import json

from app.api._store import case_documents, cases
from app.db import init_db
from app.services.document_insights import generate_document_insight
from app.time import normalize_utc


def backfill_document_insights(
    *,
    limit: int = 50,
    force: bool = False,
    only_missing_relevance: bool = False,
    workspace_id: str = "",
    case_id: str = "",
) -> dict:
    init_db()
    documents = [
        doc for doc in case_documents.values()
        if (not workspace_id or doc.workspace_id == workspace_id)
        and (not case_id or doc.case_id == case_id)
    ]
    documents.sort(key=lambda doc: normalize_utc(doc.uploaded_at), reverse=True)

    def is_candidate(doc) -> bool:
        if only_missing_relevance:
            return not doc.relevance_model or not doc.evidence_role
        return force or doc.insight_status != "ready"

    candidate_total = len([
        doc for doc in documents
        if is_candidate(doc)
    ])
    processed = 0
    skipped_ready = 0
    ready = 0
    skipped = 0
    failed = 0

    for doc in documents:
        if not is_candidate(doc):
            if doc.insight_status == "ready":
                skipped_ready += 1
            continue
        if doc.insight_status == "ready" and not (force or only_missing_relevance):
            skipped_ready += 1
            continue
        if processed >= limit:
            break

        updated = generate_document_insight(doc, cases.get(doc.case_id), force=force or only_missing_relevance)
        case_documents[updated.id] = updated
        processed += 1

        if updated.insight_status == "ready":
            ready += 1
        elif updated.insight_status == "skipped":
            skipped += 1
        elif updated.insight_status == "failed":
            failed += 1

    return {
        "documents": len(documents),
        "candidate_total": candidate_total,
        "processed": processed,
        "ready": ready,
        "skipped": skipped,
        "failed": failed,
        "skipped_ready": skipped_ready,
        "remaining": max(candidate_total - processed, 0),
        "workspace_id": workspace_id,
        "case_id": case_id,
        "force": force,
        "only_missing_relevance": only_missing_relevance,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill USDWatch document AI insights.")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only-missing-relevance", action="store_true")
    parser.add_argument("--workspace-id", default="")
    parser.add_argument("--case-id", default="")
    args = parser.parse_args()
    result = backfill_document_insights(
        limit=args.limit,
        force=args.force,
        only_missing_relevance=args.only_missing_relevance,
        workspace_id=args.workspace_id,
        case_id=args.case_id,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
