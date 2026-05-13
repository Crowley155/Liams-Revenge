"""
Text chunker — splits extracted document text into overlapping windows for embedding.

Strategy: 512-token windows (~2000 chars) with 64-token overlap (~256 chars).
Each chunk carries metadata for reassembly and source tracking.
"""
from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

CHUNK_SIZE = 2000
CHUNK_OVERLAP = 256


def chunk_text(
    text: str,
    document_id: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[dict]:
    """Split text into overlapping chunks with metadata.

    Returns list of dicts: {text, chunk_index, total_chunks, document_id, char_offset}
    """
    text = text.strip()
    if not text:
        return []

    text = re.sub(r"\n{3,}", "\n\n", text)

    chunks: list[dict] = []
    start = 0

    while start < len(text):
        end = start + chunk_size

        if end < len(text):
            break_at = text.rfind("\n\n", start, end)
            if break_at == -1 or break_at <= start:
                break_at = text.rfind(". ", start, end)
            if break_at > start:
                end = break_at + 1

        chunk_text_str = text[start:end].strip()
        if chunk_text_str:
            chunks.append({
                "text": chunk_text_str,
                "chunk_index": len(chunks),
                "document_id": document_id,
                "char_offset": start,
            })

        if end >= len(text):
            break
        next_start = end - overlap
        start = next_start if next_start > start else end

    for c in chunks:
        c["total_chunks"] = len(chunks)

    return chunks
