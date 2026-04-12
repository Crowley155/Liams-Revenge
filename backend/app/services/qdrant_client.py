"""
Qdrant vector store — document embedding storage and semantic deduplication.

Stores document embeddings from the research pipeline. Before processing a
new document, checks if a semantically similar one already exists (dedup).

Falls back gracefully when Qdrant is unreachable.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

_client = None
_available = False

COLLECTION_NAME = "documents"
VECTOR_SIZE = 768  # text-embedding-004 outputs 768-dim vectors
SIMILARITY_THRESHOLD = 0.92  # above this = "same document"


def _get_client():
    global _client, _available
    if _client is not None:
        return _client

    try:
        from qdrant_client import QdrantClient
        from qdrant_client.models import Distance, VectorParams

        _client = QdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key,
            timeout=5,
        )

        collections = [c.name for c in _client.get_collections().collections]
        if COLLECTION_NAME not in collections:
            _client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
            )
            logger.info("Created Qdrant collection '%s'", COLLECTION_NAME)

        _available = True
        logger.info("Qdrant connected at %s", settings.qdrant_url)
    except Exception as e:
        _available = False
        _client = None
        logger.info("Qdrant not available (non-fatal): %s", e)

    return _client


def is_available() -> bool:
    _get_client()
    return _available


def _doc_id(url: str, text_hash: str) -> str:
    """Deterministic point ID from URL + content hash."""
    raw = hashlib.sha256(f"{url}:{text_hash}".encode()).hexdigest()
    return raw[:32]


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _embed_text(text: str) -> list[float] | None:
    """Generate embedding using the configured model via LiteLLM."""
    try:
        import litellm
        response = litellm.embedding(
            model=settings.embedding_model,
            input=[text[:8000]],
        )
        return response.data[0]["embedding"]
    except Exception as e:
        logger.warning("Embedding generation failed: %s", e)
        return None


def check_duplicate(url: str, text: str) -> Optional[dict]:
    """
    Check if a semantically similar document already exists.

    Returns the matching point's payload if duplicate found, None otherwise.
    """
    client = _get_client()
    if not client:
        return None

    embedding = _embed_text(text[:2000])
    if not embedding:
        return None

    try:
        from qdrant_client.models import Filter, FieldCondition, MatchValue

        results = client.search(
            collection_name=COLLECTION_NAME,
            query_vector=embedding,
            limit=3,
            score_threshold=SIMILARITY_THRESHOLD,
        )

        if results:
            best = results[0]
            logger.info(
                "Qdrant dedup: found similar doc (score=%.3f) for %s",
                best.score, url[:60],
            )
            return best.payload

        return None
    except Exception as e:
        logger.warning("Qdrant search failed: %s", e)
        return None


def store_document(url: str, text: str, person_id: str, metadata: dict | None = None):
    """
    Store a document embedding in Qdrant.
    """
    client = _get_client()
    if not client:
        return

    embedding = _embed_text(text[:2000])
    if not embedding:
        return

    text_hash = _hash_text(text)
    point_id = _doc_id(url, text_hash)

    payload = {
        "url": url,
        "text_hash": text_hash,
        "person_id": person_id,
        "text_preview": text[:500],
        **(metadata or {}),
    }

    try:
        from qdrant_client.models import PointStruct

        client.upsert(
            collection_name=COLLECTION_NAME,
            points=[PointStruct(
                id=point_id,
                vector=embedding,
                payload=payload,
            )],
        )
    except Exception as e:
        logger.warning("Qdrant upsert failed: %s", e)


def find_cross_person_docs(person_ids: list[str], limit: int = 10) -> list[dict]:
    """
    Find documents that mention multiple people in our system.
    Useful for discovering connections.
    """
    client = _get_client()
    if not client:
        return []

    try:
        from qdrant_client.models import Filter, FieldCondition, MatchAny

        results = client.scroll(
            collection_name=COLLECTION_NAME,
            scroll_filter=Filter(
                should=[
                    FieldCondition(key="person_id", match=MatchAny(any=person_ids))
                ]
            ),
            limit=limit,
        )

        docs = []
        for point in results[0]:
            docs.append(point.payload)
        return docs
    except Exception as e:
        logger.warning("Qdrant cross-person search failed: %s", e)
        return []
