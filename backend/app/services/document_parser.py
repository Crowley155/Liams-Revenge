"""
Document parser: extracts text from uploaded files.

Routes by file type:
  - Native PDF (text-selectable): pdfplumber, then pypdf
  - Scanned PDF / images: stored and marked for OCR review
  - Word docs (.docx): python-docx
  - Email files (.eml): stdlib email.parser
  - Plain text: direct read
"""
from __future__ import annotations

import email
import io
import logging
import mimetypes
from pathlib import Path

logger = logging.getLogger(__name__)

SUPPORTED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".webp", ".bmp"}
MIN_PDF_CHARS_PER_PAGE = 50


def parse_file(filename: str, content: bytes) -> tuple[str, str]:
    """Extract text from a file. Returns (extracted_text, file_type)."""
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return _parse_pdf(content), "pdf"
    if ext in SUPPORTED_IMAGE_EXTS:
        return _parse_image(filename), "image"
    if ext == ".docx":
        return _parse_docx(content), "docx"
    if ext == ".eml":
        return _parse_eml(content), "eml"
    if ext in (".txt", ".md", ".csv", ".json"):
        return content.decode("utf-8", errors="replace"), "txt"
    return content.decode("utf-8", errors="replace"), "txt"


def _parse_pdf(content: bytes) -> str:
    """Try text extraction first; mark scanned PDFs for a future NVIDIA OCR pass."""
    try:
        import pdfplumber
    except ImportError:
        logger.warning("pdfplumber not installed; trying pypdf before OCR review")
        pypdf_text = _parse_pdf_with_pypdf(content)
        return pypdf_text or _parse_image("document.pdf")

    text_parts: list[str] = []
    scanned_pages: list[int] = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for i, page in enumerate(pdf.pages):
            page_text = (page.extract_text() or "").strip()
            if len(page_text) >= MIN_PDF_CHARS_PER_PAGE:
                text_parts.append(page_text)
            else:
                scanned_pages.append(i)
                text_parts.append("")

    if scanned_pages and len(scanned_pages) / max(len(text_parts), 1) > 0.5:
        logger.info(
            "PDF appears mostly scanned (%d/%d pages); marking for OCR review",
            len(scanned_pages),
            len(text_parts),
        )
        return _parse_image("document.pdf")

    full_text = "\n\n".join(t for t in text_parts if t)
    if not full_text.strip():
        return _parse_image("document.pdf")

    return full_text


def _parse_pdf_with_pypdf(content: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""

    try:
        reader = PdfReader(io.BytesIO(content))
        parts = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                parts.append("")
        return "\n\n".join(part for part in parts if part).strip()
    except Exception as exc:
        logger.warning("pypdf extraction failed: %s", exc)
        return ""


def _parse_image(filename: str) -> str:
    """Images and scanned PDFs are stored, but OCR waits for the NVIDIA OCR path."""
    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    if filename.endswith(".pdf"):
        mime = "application/pdf"
    return (
        "[OCR extraction needed: this image or scanned PDF was stored safely, "
        f"but automatic OCR is not enabled for MIME type {mime}.]"
    )


def _parse_docx(content: bytes) -> str:
    """Extract text from a .docx file."""
    try:
        from docx import Document
    except ImportError:
        logger.warning("python-docx not installed")
        return "[python-docx not installed - cannot parse .docx files]"

    doc = Document(io.BytesIO(content))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def _parse_eml(content: bytes) -> str:
    """Extract text from an .eml email file."""
    msg = email.message_from_bytes(content)
    parts: list[str] = []

    subject = msg.get("Subject", "")
    from_addr = msg.get("From", "")
    to_addr = msg.get("To", "")
    date = msg.get("Date", "")

    if subject:
        parts.append(f"Subject: {subject}")
    if from_addr:
        parts.append(f"From: {from_addr}")
    if to_addr:
        parts.append(f"To: {to_addr}")
    if date:
        parts.append(f"Date: {date}")
    parts.append("---")

    for part in msg.walk():
        content_type = part.get_content_type()
        if content_type == "text/plain":
            payload = part.get_payload(decode=True)
            if payload:
                parts.append(payload.decode("utf-8", errors="replace"))
        elif content_type == "text/html":
            payload = part.get_payload(decode=True)
            if payload:
                try:
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(payload, "html.parser")
                    parts.append(soup.get_text(separator="\n", strip=True))
                except ImportError:
                    parts.append(payload.decode("utf-8", errors="replace"))

    return "\n\n".join(parts)
