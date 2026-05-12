from __future__ import annotations

from pathlib import Path

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff"}
TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json"}


def normalize_file_type(filename: str = "", mime_type: str = "") -> str:
    """Return the file type label the frontend uses for previews and filtering."""
    ext = Path(filename or "").suffix.lower()
    mime = (mime_type or "").lower()

    if mime == "application/pdf" or ext == ".pdf":
        return "pdf"
    if mime.startswith("image/") or ext in IMAGE_EXTENSIONS:
        return "image"
    if "wordprocessingml" in mime or ext == ".docx":
        return "docx"
    if mime == "message/rfc822" or ext == ".eml":
        return "eml"
    if mime.startswith("text/") or ext in TEXT_EXTENSIONS:
        return "txt"
    return ""
