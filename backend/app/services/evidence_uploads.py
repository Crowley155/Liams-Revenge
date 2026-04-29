from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException

MAX_EVIDENCE_UPLOAD_BYTES = 50 * 1024 * 1024
SUPPORTED_EVIDENCE_EXTENSIONS = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".tiff",
    ".tif",
    ".webp",
    ".bmp",
    ".docx",
    ".eml",
    ".txt",
    ".md",
}


def validate_evidence_upload(filename: str, content: bytes) -> None:
    if len(content) > MAX_EVIDENCE_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Evidence Locker files must be 50 MB or smaller for this version.")
    ext = Path(filename or "").suffix.lower()
    if ext not in SUPPORTED_EVIDENCE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported evidence file type. Upload PDF, image, Word, email, text, or markdown files.")
