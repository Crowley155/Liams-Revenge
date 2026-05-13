"""
Qdrant vector store — document embedding storage and semantic deduplication.

Stores document embeddings from the research pipeline. Before processing a
new document, checks if a semantically similar one already exists (dedup).

Falls back gracefully when Qdrant is unreachable.
"""
from __future__ import annotations

import hashlib
import logging
import os
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

_client = None
_available = False

COLLECTION_NAME = "documents"
VECTOR_SIZE = int(os.getenv("QDRANT_VECTOR_SIZE", "2048"))
SIMILARITY_THRESHOLD = 0.92  # above this = "same document"


def _get_client():
    global _client, _available
    if _client is not None:
        return _client
    if not settings.has_qdrant:
        return None

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


def _validated_embedding(embedding: list[float] | None) -> list[float] | None:
    if not embedding:
        return None
    if len(embedding) != VECTOR_SIZE:
        logger.warning(
            "Embedding dimension mismatch: got %s dimensions, expected %s for Qdrant collection '%s'",
            len(embedding),
            VECTOR_SIZE,
            COLLECTION_NAME,
        )
        return None
    return embedding


def _embed_text(text: str) -> list[float] | None:
    """Generate an embedding with the configured provider."""
    model = settings.embedding_model
    if model.startswith("deepinfra/"):
        if not settings.deepinfra_api_key:
            logger.warning("Embedding generation skipped: DEEPINFRA_API_KEY is not configured")
            return None
        try:
            from openai import OpenAI

            client = OpenAI(
                api_key=settings.deepinfra_api_key,
                base_url="https://api.deepinfra.com/v1/openai",
            )
            response = client.embeddings.create(
                model=model.removeprefix("deepinfra/"),
                input=[text[:8000]],
                dimensions=VECTOR_SIZE,
            )
            return _validated_embedding(list(response.data[0].embedding))
        except Exception as e:
            logger.warning("DeepInfra embedding generation failed: %s", e)
            return None

    try:
        import litellm
        response = litellm.embedding(
            model=model,
            input=[text[:8000]],
        )
        return _validated_embedding(response.data[0]["embedding"])
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


def _evidence_point_id(doc_id: str) -> str:
    """Deterministic point ID for a case-evidence document."""
    raw = hashlib.sha256(f"evidence:{doc_id}".encode()).hexdigest()
    return raw[:32]


def _enrichment_point_id(person_id: str, source: str) -> str:
    """Deterministic point ID for enrichment callback data."""
    raw = hashlib.sha256(f"enrichment:{person_id}:{source}".encode()).hexdigest()
    return raw[:32]


def point_exists(point_id: str) -> bool:
    """Check if a point already exists by its ID (fast, no embedding needed)."""
    client = _get_client()
    if not client:
        return False
    try:
        result = client.retrieve(
            collection_name=COLLECTION_NAME,
            ids=[point_id],
        )
        return len(result) > 0
    except Exception:
        return False


def ingest_evidence(evidence_docs: list[dict], actors: list[dict]) -> dict:
    """
    Embed and store case-data.json evidence documents in Qdrant.
    Idempotent — uses deterministic IDs so re-running is safe (upsert).

    Returns {"ingested": int, "skipped": int}.
    """
    from app.pipeline.enrichment.contact_extractor import (
        build_actor_name_map,
        extract_person_ids_from_text,
    )

    client = _get_client()
    if not client:
        logger.info("Qdrant not available — skipping evidence ingestion")
        return {"ingested": 0, "skipped": 0, "error": "qdrant_unavailable"}

    actor_name_map = build_actor_name_map(actors)

    ingested = 0
    skipped = 0

    for doc in evidence_docs:
        body = doc.get("bodyText", "")
        doc_id = doc.get("id", "")
        if not body or not doc_id:
            skipped += 1
            continue

        pid = _evidence_point_id(doc_id)

        if point_exists(pid):
            skipped += 1
            continue

        person_ids = extract_person_ids_from_text(body, actor_name_map)
        source_actor = doc.get("source", "")
        if source_actor and source_actor not in person_ids:
            person_ids.append(source_actor)

        embedding = _embed_text(body[:2000])
        if not embedding:
            skipped += 1
            continue

        payload = {
            "doc_id": doc_id,
            "source": source_actor,
            "date": doc.get("date", ""),
            "type": doc.get("type", "unknown"),
            "summary": doc.get("summary", ""),
            "text_preview": body[:500],
            "full_text": body[:4000],
            "person_ids": person_ids,
            "origin": "case_evidence",
            "key_claims": doc.get("keyClaims", []),
        }

        try:
            from qdrant_client.models import PointStruct
            client.upsert(
                collection_name=COLLECTION_NAME,
                points=[PointStruct(id=pid, vector=embedding, payload=payload)],
            )
            ingested += 1
        except Exception as e:
            logger.warning("Failed to ingest evidence %s: %s", doc_id, e)
            skipped += 1

    logger.info("Evidence ingestion: %d ingested, %d skipped", ingested, skipped)
    return {"ingested": ingested, "skipped": skipped}


def search_by_person(person_id: str, limit: int = 20) -> list[dict]:
    """
    Find all documents tagged with a specific person_id via payload filter.
    Fast filter-based search, no embedding needed.
    """
    client = _get_client()
    if not client:
        return []

    try:
        from qdrant_client.models import Filter, FieldCondition, MatchValue

        results = client.scroll(
            collection_name=COLLECTION_NAME,
            scroll_filter=Filter(
                should=[
                    FieldCondition(key="person_ids", match=MatchValue(value=person_id)),
                    FieldCondition(key="person_id", match=MatchValue(value=person_id)),
                    FieldCondition(key="source", match=MatchValue(value=person_id)),
                ]
            ),
            limit=limit,
        )
        return [point.payload for point in results[0]]
    except Exception as e:
        logger.warning("Qdrant person search failed for %s: %s", person_id, e)
        return []


def search_semantic(query: str, person_id: str | None = None, limit: int = 10) -> list[dict]:
    """
    Semantic search across all stored documents.
    Optionally filter to docs tagged with a specific person_id.
    """
    client = _get_client()
    if not client:
        return []

    embedding = _embed_text(query)
    if not embedding:
        return []

    try:
        query_filter = None
        if person_id:
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            query_filter = Filter(
                should=[
                    FieldCondition(key="person_ids", match=MatchValue(value=person_id)),
                    FieldCondition(key="person_id", match=MatchValue(value=person_id)),
                    FieldCondition(key="source", match=MatchValue(value=person_id)),
                ]
            )

        results = client.search(
            collection_name=COLLECTION_NAME,
            query_vector=embedding,
            query_filter=query_filter,
            limit=limit,
            score_threshold=0.5,
        )

        return [
            {**point.payload, "_score": point.score}
            for point in results
        ]
    except Exception as e:
        logger.warning("Qdrant semantic search failed: %s", e)
        return []


def search_case_documents_semantic(query: str, case_id: str, limit: int = 25) -> list[dict]:
    """Semantic search across uploaded evidence chunks for one case."""
    client = _get_client()
    if not client or not query.strip() or not case_id:
        return []

    embedding = _embed_text(query)
    if not embedding:
        return []

    try:
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        results = client.search(
            collection_name=COLLECTION_NAME,
            query_vector=embedding,
            query_filter=Filter(
                must=[
                    FieldCondition(key="case_id", match=MatchValue(value=case_id)),
                ]
            ),
            limit=limit,
            score_threshold=0.45,
        )
        return [
            {**point.payload, "_score": point.score}
            for point in results
        ]
    except Exception as e:
        logger.warning("Qdrant case semantic search failed for case %s: %s", case_id, e)
        return []


def store_enrichment_doc(person_id: str, source: str, text: str, metadata: dict | None = None):
    """
    Store enrichment results (Clay, research, etc.) as searchable documents.
    Deterministic ID per person+source so re-runs overwrite cleanly.
    """
    client = _get_client()
    if not client:
        return

    embedding = _embed_text(text[:2000])
    if not embedding:
        return

    pid = _enrichment_point_id(person_id, source)
    payload = {
        "person_id": person_id,
        "person_ids": [person_id],
        "origin": f"enrichment_{source}",
        "source": source,
        "text_preview": text[:500],
        "full_text": text[:4000],
        **(metadata or {}),
    }

    try:
        from qdrant_client.models import PointStruct
        client.upsert(
            collection_name=COLLECTION_NAME,
            points=[PointStruct(id=pid, vector=embedding, payload=payload)],
        )
        logger.info("Stored enrichment doc for %s from %s", person_id, source)
    except Exception as e:
        logger.warning("Failed to store enrichment doc: %s", e)


# ---------------------------------------------------------------------------
# Document chunk storage (for uploaded files)
# ---------------------------------------------------------------------------

def store_document_chunks(
    chunks: list[dict],
    document_id: str,
    entity_ids: list[str] | None = None,
    person_ids: list[str] | None = None,
    source: str = "uploaded_document",
    metadata: dict | None = None,
) -> list[str]:
    """Store chunked document text. Each chunk gets its own Qdrant point.

    Returns list of point IDs that were stored.
    """
    client = _get_client()
    if not client:
        return []

    from qdrant_client.models import PointStruct

    point_ids: list[str] = []
    extra = metadata or {}

    for chunk in chunks:
        chunk_text = chunk["text"]
        embedding = _embed_text(chunk_text)
        if not embedding:
            continue

        pid = hashlib.sha256(
            f"doc:{document_id}:chunk:{chunk['chunk_index']}".encode()
        ).hexdigest()[:32]

        payload = {
            "origin": source,
            "document_id": document_id,
            "chunk_index": chunk["chunk_index"],
            "total_chunks": chunk["total_chunks"],
            "entity_ids": entity_ids or [],
            "person_ids": person_ids or [],
            "text_preview": chunk_text[:500],
            "full_text": chunk_text[:4000],
            **extra,
        }

        try:
            client.upsert(
                collection_name=COLLECTION_NAME,
                points=[PointStruct(id=pid, vector=embedding, payload=payload)],
            )
            point_ids.append(pid)
        except Exception as e:
            logger.warning("Failed to store chunk %d of doc %s: %s",
                           chunk["chunk_index"], document_id, e)

    logger.info("Stored %d/%d chunks for document %s", len(point_ids), len(chunks), document_id)
    return point_ids


def delete_points(point_ids: list[str]) -> None:
    """Best-effort cleanup for document chunks stored in Qdrant."""
    if not point_ids:
        return
    client = _get_client()
    if not client:
        return
    try:
        client.delete(collection_name=COLLECTION_NAME, points_selector=point_ids)
    except Exception as e:
        logger.warning("Qdrant delete failed for %d points: %s", len(point_ids), e)
