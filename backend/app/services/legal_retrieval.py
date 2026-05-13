from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class LegalEmbeddingCandidate:
    model: str
    provider: str
    dimensions: int | None
    status: str
    rationale: list[str] = field(default_factory=list)
    reranker: str = ""

    def as_diagnostic(self, *, current_vector_size: int) -> dict[str, Any]:
        dimensions_match = self.dimensions == current_vector_size if self.dimensions else None
        return {
            "model": self.model,
            "provider": self.provider,
            "dimensions": self.dimensions,
            "dimensions_match_current_collection": dimensions_match,
            "status": self.status,
            "reranker": self.reranker,
            "rationale": self.rationale,
            "migration_note": (
                "Can reuse the current vector dimension."
                if dimensions_match is True
                else "Requires a new collection and full reindex before production switch."
                if dimensions_match is False
                else "Dimension must be confirmed before indexing into any production collection."
            ),
        }


def legal_embedding_candidates(current_embedding_model: str) -> list[LegalEmbeddingCandidate]:
    current_provider = current_embedding_model.split("/", 1)[0] if "/" in current_embedding_model else "unknown"
    return [
        LegalEmbeddingCandidate(
            model=current_embedding_model,
            provider=current_provider,
            dimensions=3072,
            status="current_baseline",
            rationale=[
                "Current production-compatible baseline.",
                "Keeps Qdrant collection dimensions stable while evaluation data is gathered.",
            ],
        ),
        LegalEmbeddingCandidate(
            model="isaacus/kanon-2-embedder",
            provider="isaacus",
            dimensions=1792,
            status="recommended_first_eval",
            reranker="isaacus/kanon-2-reranker",
            rationale=[
                "Legal-domain embedding model designed for legal retrieval benchmark performance.",
                "Pairing the embedder with the legal reranker gives a concrete retrieval pipeline to measure.",
            ],
        ),
        LegalEmbeddingCandidate(
            model="voyage-law-2",
            provider="voyage",
            dimensions=None,
            status="evaluate_before_switch",
            rationale=[
                "Legal-domain embedding model with strong public legal retrieval positioning.",
                "Must be evaluated against USDWatch case queries and dimension-confirmed before migration.",
            ],
        ),
    ]


def legal_retrieval_diagnostics(*, current_embedding_model: str, current_vector_size: int) -> dict[str, Any]:
    candidates = legal_embedding_candidates(current_embedding_model)
    recommended = next((item for item in candidates if item.status == "recommended_first_eval"), candidates[0])
    return {
        "recommended_first_candidate": recommended.model,
        "recommended_reranker": recommended.reranker,
        "requires_reindex_before_switch": recommended.dimensions != current_vector_size,
        "evaluation_gate": [
            "Build a fixed query set from real parent questions, incident-report lookups, policy lookups, and notice-timeline lookups.",
            "Measure retrieval recall, answer grounding, citation usefulness, latency, and cost before switching providers.",
            "Create a new vector collection and reindex when dimensions differ; never mix embeddings with different dimensions.",
        ],
        "candidate_count": len(candidates),
    }
