from __future__ import annotations

import argparse
import json

from app.ai_runtime.ocr_readiness import SCHEMA_VERSION, assess_ocr_readiness
from app.api._store import case_documents, case_evaluations, cases
from app.db import init_db


def recompute_ocr_readiness(
    *,
    workspace_id: str = "",
    case_id: str = "",
    force: bool = False,
    write: bool = False,
) -> dict:
    init_db()
    candidates = []
    for evaluation in case_evaluations.values():
        if workspace_id and evaluation.workspace_id != workspace_id:
            continue
        if case_id and evaluation.case_id != case_id:
            continue
        if not evaluation.result:
            continue
        current = evaluation.result.ocr_readiness
        if current and current.schema_version == SCHEMA_VERSION and not force:
            continue
        case = cases.get(evaluation.case_id)
        if not case:
            continue
        candidates.append((evaluation, case))

    recomputed = 0
    statuses: dict[str, int] = {}
    for evaluation, case in candidates:
        docs = [
            doc for doc in case_documents.values()
            if doc.workspace_id == case.workspace_id and doc.case_id == case.id
        ]
        next_readiness = assess_ocr_readiness(case, docs)
        statuses[next_readiness.overall_status] = statuses.get(next_readiness.overall_status, 0) + 1
        if write:
            evaluation.result.ocr_readiness = next_readiness
            case_evaluations[evaluation.id] = evaluation
        recomputed += 1

    return {
        "schema_version": SCHEMA_VERSION,
        "matched_evaluations": len(candidates),
        "recomputed": recomputed,
        "written": write,
        "force": force,
        "workspace_id": workspace_id,
        "case_id": case_id,
        "statuses": statuses,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Recompute deterministic OCR readiness results for saved Case Reads.")
    parser.add_argument("--workspace-id", default="")
    parser.add_argument("--case-id", default="")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    result = recompute_ocr_readiness(
        workspace_id=args.workspace_id,
        case_id=args.case_id,
        force=args.force,
        write=args.write,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
