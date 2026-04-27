"""
Document intake API — upload and process files for Qdrant ingestion.

POST /api/documents/upload   — upload a file, parse + chunk + embed (async)
GET  /api/documents          — list uploaded documents
GET  /api/documents/{id}     — single document detail
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form
from typing import Optional

from app.models import CaseDocument
from app.api._store import case_documents, cases
from app.api.deps import can_access_workspace, get_current_user, scoped_items

logger = logging.getLogger(__name__)
router = APIRouter(tags=["documents"])
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".webp", ".bmp", ".docx", ".eml", ".txt", ".md"}


def _validate_upload(filename: str, content: bytes) -> None:
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Evidence Locker files must be 15 MB or smaller for the free evaluation.")
    ext = Path(filename or "").suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported evidence file type. Upload PDF, image, Word, email, text, or markdown files.")


def _process_document(doc: CaseDocument, content: bytes):
    """Background task: parse file, chunk text, embed in Qdrant."""
    try:
        from app.services.document_parser import parse_file
        from app.services.text_chunker import chunk_text
        from app.services.qdrant_client import store_document_chunks

        logger.info("Processing document %s (%s, %d bytes)", doc.id, doc.filename, len(content))

        extracted, file_type = parse_file(doc.filename, content)
        doc.file_type = file_type
        doc.extracted_text = extracted

        if not extracted or extracted.startswith("["):
            doc.status = "failed"
            doc.processing_status = "failed"
            doc.error = "No text could be extracted"
            doc.failure_reason = doc.error
            doc.processed_at = datetime.utcnow()
            case_documents[doc.id] = doc
            return

        chunks = chunk_text(extracted, doc.id)
        doc.chunk_count = len(chunks)

        point_ids = store_document_chunks(
            chunks=chunks,
            document_id=doc.id,
            entity_ids=doc.entity_ids,
            person_ids=doc.person_ids,
            source=doc.source,
    metadata={"filename": doc.filename, "case_id": doc.case_id},
        )
        doc.qdrant_point_ids = point_ids
        doc.status = "indexed"
        doc.processing_status = "indexed"
        doc.processed_at = datetime.utcnow()
        case_documents[doc.id] = doc

        logger.info("Document %s indexed: %d chunks, %d Qdrant points",
                     doc.id, len(chunks), len(point_ids))

        _extract_facts_from_document(doc)

    except Exception as e:
        logger.exception("Document processing failed for %s", doc.id)
        doc.status = "failed"
        doc.processing_status = "failed"
        doc.error = str(e)
        doc.failure_reason = str(e)
        doc.processed_at = datetime.utcnow()
        case_documents[doc.id] = doc


def _extract_facts_from_document(doc: CaseDocument):
    """Run fact extraction against linked persons. Updates person profiles in-place."""
    if not doc.person_ids or not doc.extracted_text:
        return

    try:
        import dspy
        from app.config import settings
        from app.pipeline.extractor import FactExtractor
        from app.models import Fact, ConfidenceTier
        from app.api._store import profiles

        lm = dspy.LM(settings.collect_model, max_tokens=4096)
        dspy.configure(lm=lm)
        extractor = FactExtractor()

        text_preview = doc.extracted_text[:6000]
        total_facts = 0

        for pid in doc.person_ids:
            person = profiles.get(pid)
            if not person:
                continue

            try:
                result = extractor(
                    document_text=text_preview,
                    person_name=person.name,
                    source_date_hint="unknown",
                )
                facts_raw = result.facts or []
                if isinstance(facts_raw, str):
                    import json
                    facts_raw = json.loads(facts_raw)

                for fd in facts_raw:
                    if not isinstance(fd, dict):
                        continue
                    fact = Fact(
                        category=fd.get("category", "bio"),
                        content=fd.get("content", ""),
                        date=fd.get("date"),
                        source_url=f"document:{doc.id}",
                        source_title=doc.filename,
                        confidence=min(fd.get("confidence", 0.5), 1.0),
                        tier=ConfidenceTier.B_PROBABLE,
                    )
                    person.facts.append(fact)
                    total_facts += 1

                person.updated_at = datetime.utcnow()
                profiles[person.id] = person
                logger.info("Extracted %d facts for %s from doc %s",
                            len(facts_raw), person.name, doc.id)

            except Exception as e:
                logger.warning("Fact extraction failed for %s: %s", person.name, e)

        doc.facts_extracted = total_facts
        case_documents[doc.id] = doc

    except Exception as e:
        logger.warning("Post-ingestion fact extraction failed: %s", e)


@router.post("/documents/upload", response_model=CaseDocument)
async def upload_document(
    bg: BackgroundTasks,
    file: UploadFile = File(...),
    entity_ids: Optional[str] = Form(default=""),
    person_ids: Optional[str] = Form(default=""),
    kora_request_id: Optional[str] = Form(default=""),
    case_id: Optional[str] = Form(default="crowley-v-usd232"),
    source: Optional[str] = Form(default="manual_upload"),
    evidence_type: Optional[str] = Form(default=""),
    user_description: Optional[str] = Form(default=""),
    document_date: Optional[str] = Form(default=None),
    source_person: Optional[str] = Form(default=""),
    user: dict = Depends(get_current_user),
):
    """Upload a document for processing. Returns immediately; processing runs in background."""
    target_case = cases.get(case_id or "")
    if not target_case or not can_access_workspace(user, target_case.workspace_id):
        raise HTTPException(status_code=404, detail="Case not found")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    _validate_upload(file.filename or "", content)

    ent_ids = [e.strip() for e in (entity_ids or "").split(",") if e.strip()]
    per_ids = [p.strip() for p in (person_ids or "").split(",") if p.strip()]

    doc = CaseDocument(
        id=str(uuid.uuid4())[:8],
        workspace_id=target_case.workspace_id,
        case_id=target_case.id,
        filename=file.filename or "unknown",
        file_size=len(content),
        evidence_type=evidence_type or "",
        user_description=user_description or "",
        document_date=document_date,
        source_person=source_person or "",
        entity_ids=ent_ids,
        person_ids=per_ids,
        kora_request_id=kora_request_id or "",
        source=source or "manual_upload",
    )
    case_documents[doc.id] = doc

    bg.add_task(_process_document, doc, content)

    logger.info("Document upload %s: %s (%d bytes)", doc.id, doc.filename, len(content))
    return doc


@router.get("/documents", response_model=list[CaseDocument])
async def list_documents(entity_id: str = "", status: str = "", case_id: str = "", user: dict = Depends(get_current_user)):
    """List uploaded documents, optionally filtered."""
    docs = scoped_items(list(case_documents.values()), user)
    if case_id:
        docs = [d for d in docs if d.case_id == case_id]
    if entity_id:
        docs = [d for d in docs if entity_id in d.entity_ids]
    if status:
        docs = [d for d in docs if d.status == status]
    docs.sort(key=lambda d: d.uploaded_at, reverse=True)
    return docs


@router.get("/documents/{doc_id}", response_model=CaseDocument)
async def get_document(doc_id: str, user: dict = Depends(get_current_user)):
    doc = case_documents.get(doc_id)
    if not doc or not can_access_workspace(user, doc.workspace_id):
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: dict = Depends(get_current_user)):
    doc = case_documents.get(doc_id)
    if not doc or not can_access_workspace(user, doc.workspace_id):
        raise HTTPException(status_code=404, detail="Document not found")
    case_documents.pop(doc_id, None)
    return {"ok": True, "deleted": doc_id}
