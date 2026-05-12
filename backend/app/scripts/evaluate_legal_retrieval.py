from __future__ import annotations

import argparse
import json

from app.config import settings
from app.services.legal_retrieval import legal_embedding_candidates, legal_retrieval_diagnostics
from app.services.qdrant_client import VECTOR_SIZE


def main() -> None:
    parser = argparse.ArgumentParser(description="Print the legal retrieval evaluation plan.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    args = parser.parse_args()

    payload = {
        "current_embedding_model": settings.embedding_model,
        "current_vector_size": VECTOR_SIZE,
        "retrieval_evaluation": legal_retrieval_diagnostics(
            current_embedding_model=settings.embedding_model,
            current_vector_size=VECTOR_SIZE,
        ),
        "legal_embedding_candidates": [
            candidate.as_diagnostic(current_vector_size=VECTOR_SIZE)
            for candidate in legal_embedding_candidates(settings.embedding_model)
        ],
    }
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return

    print("USDWatch legal retrieval evaluation")
    print(f"Current embedding model: {payload['current_embedding_model']}")
    print(f"Current vector size: {payload['current_vector_size']}")
    print(f"Recommended first candidate: {payload['retrieval_evaluation']['recommended_first_candidate']}")
    print(f"Recommended reranker: {payload['retrieval_evaluation']['recommended_reranker'] or 'none'}")
    print("Evaluation gate:")
    for item in payload["retrieval_evaluation"]["evaluation_gate"]:
        print(f"- {item}")


if __name__ == "__main__":
    main()
