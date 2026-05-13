"""
Document intake API — upload and process files for Qdrant ingestion.

POST /api/documents/upload   — upload a file, parse + chunk + embed (async)
GET  /api/documents          — list uploaded documents
GET  /api/documents/{id}     — single document detail
"""
from __future__ import annotations

from app.time import normalize_utc, utc_now

import logging
import hashlib
import mimetypes
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from typing import Optional

from app.models import CaseDocument, CaseDocumentUpdate
from app.api._store import case_documents, cases
from app.api.deps import can_access_workspace, get_current_user
from app.services.case_access import require_case_access, visible_cases_for_user
from app.services.document_classifier import infer_document_metadata
from app.services.document_ingestion import process_document_bytes
from app.services.document_storage import delete_document_file, resolve_document_path, save_case_document_file
from app.services.evidence_uploads import validate_evidence_upload
from app.services.file_types import normalize_file_type

logger = logging.getLogger(__name__)
router = APIRouter(tags=["documents"])


def _process_document(doc: CaseDocument, content: bytes):
    """Background task: parse file, chunk text, embed in Qdrant."""
    try:
        logger.info("Processing document %s (%s, %d bytes)", doc.id, doc.filename, len(content))
        processed = process_document_bytes(doc, content)
        if processed.processing_status == "indexed":
            logger.info(
                "Document %s indexed: %d chunks, %d Qdrant points",
                processed.id,
                processed.chunk_count,
                len(processed.qdrant_point_ids),
            )
            _extract_facts_from_document(processed)

    except Exception as e:
        logger.exception("Document processing failed for %s", doc.id)
        doc.status = "failed"
        doc.processing_status = "failed"
        doc.error = str(e)
        doc.failure_reason = str(e)
        doc.processed_at = utc_now()
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

                person.updated_at = utc_now()
                profiles[person.id] = person
                logger.info("Extracted %d facts for %s from doc %s",
                            len(facts_raw), person.name, doc.id)

            except Exception as e:
                logger.warning("Fact extraction failed for %s: %s", person.name, e)

        doc.facts_extracted = total_facts
        case_documents[doc.id] = doc

    except Exception as e:
        logger.warning("Post-ingestion fact extraction failed: %s", e)


def _case_for_document(doc: CaseDocument):
    return cases.get(doc.case_id)


def _require_document_access(doc: CaseDocument | None, user: dict, action: str = "view") -> CaseDocument:
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    case = _case_for_document(doc)
    if case:
        require_case_access(user, case, action)
    elif not can_access_workspace(user, doc.workspace_id):
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/documents/upload", response_model=CaseDocument)
async def upload_document(
    bg: BackgroundTasks,
    file: UploadFile = File(...),
    entity_ids: Optional[str] = Form(default=""),
    person_ids: Optional[str] = Form(default=""),
    kora_request_id: Optional[str] = Form(default=""),
    case_id: Optional[str] = Form(default=""),
    source: Optional[str] = Form(default="manual_upload"),
    evidence_type: Optional[str] = Form(default=""),
    user_description: Optional[str] = Form(default=""),
    document_date: Optional[str] = Form(default=None),
    source_person: Optional[str] = Form(default=""),
    user: dict = Depends(get_current_user),
):
    """Upload a document for processing. Returns immediately; processing runs in background."""
    if not case_id:
        raise HTTPException(status_code=400, detail="case_id is required")
    target_case = cases.get(case_id or "")
    require_case_access(user, target_case, "upload_evidence")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    validate_evidence_upload(file.filename or "", content)

    ent_ids = [e.strip() for e in (entity_ids or "").split(",") if e.strip()]
    per_ids = [p.strip() for p in (person_ids or "").split(",") if p.strip()]

    mime_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    doc = CaseDocument(
        id=str(uuid.uuid4())[:8],
        workspace_id=target_case.workspace_id,
        case_id=target_case.id,
        filename=file.filename or "unknown",
        file_type=normalize_file_type(file.filename or "", mime_type),
        file_size=len(content),
        mime_type=mime_type,
        storage_path="",
        content_sha256=hashlib.sha256(content).hexdigest(),
        evidence_type=evidence_type or "",
        user_description=user_description or "",
        document_date=document_date,
        source_person=source_person or "",
        entity_ids=ent_ids,
        person_ids=per_ids,
        kora_request_id=kora_request_id or "",
        source=source or "manual_upload",
    )
    category, confidence, tags, inferred_type = infer_document_metadata(doc.filename)
    doc.inferred_category = category
    doc.category_confidence = confidence
    doc.tags = tags
    if not doc.evidence_type:
        doc.evidence_type = inferred_type
    doc.storage_path = save_case_document_file(doc.workspace_id, doc.case_id, doc.id, doc.filename, content)
    case_documents[doc.id] = doc

    bg.add_task(_process_document, doc, content)

    logger.info("Document upload %s: %s (%d bytes)", doc.id, doc.filename, len(content))
    return doc


@router.get("/documents", response_model=list[CaseDocument])
async def list_documents(
    entity_id: str = "",
    status: str = "",
    case_id: str = "",
    q: str = "",
    category: str = "",
    tag: str = "",
    sort: str = Query(default="uploaded_at"),
    direction: str = Query(default="desc"),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user),
):
    """List uploaded documents, optionally filtered."""
    if case_id:
        target_case = cases.get(case_id)
        require_case_access(user, target_case, "view")
        docs = [
            d for d in case_documents.values()
            if d.case_id == case_id and d.workspace_id == target_case.workspace_id
        ]
    else:
        visible_case_ids = {case.id for case in visible_cases_for_user(user)}
        docs = [
            d for d in case_documents.values()
            if d.case_id in visible_case_ids or can_access_workspace(user, d.workspace_id)
        ]
    if case_id:
        docs = [d for d in docs if d.case_id == case_id]
    if entity_id:
        docs = [d for d in docs if entity_id in d.entity_ids]
    if status:
        docs = [d for d in docs if d.status == status or d.processing_status == status]
    if category:
        docs = [d for d in docs if d.inferred_category == category or d.evidence_type == category]
    if tag:
        docs = [d for d in docs if tag in d.tags]
    if q:
        needle = q.lower()
        docs = [
            d for d in docs
            if needle in " ".join([
                d.filename,
                d.user_description,
                d.source_person,
                d.evidence_type,
                d.inferred_category,
                " ".join(d.tags),
                d.extracted_text[:2000],
            ]).lower()
        ]

    key_map = {
        "name": lambda d: d.filename.lower(),
        "size": lambda d: d.file_size,
        "status": lambda d: d.processing_status or d.status,
        "document_date": lambda d: d.document_date or "",
        "uploaded_at": lambda d: normalize_utc(d.uploaded_at),
    }
    docs.sort(key=key_map.get(sort, key_map["uploaded_at"]), reverse=direction != "asc")
    return docs[offset:offset + limit]


@router.get("/documents/{doc_id}", response_model=CaseDocument)
async def get_document(doc_id: str, user: dict = Depends(get_current_user)):
    doc = case_documents.get(doc_id)
    return _require_document_access(doc, user, "view")


@router.patch("/documents/{doc_id}", response_model=CaseDocument)
async def update_document(doc_id: str, body: CaseDocumentUpdate, user: dict = Depends(get_current_user)):
    doc = case_documents.get(doc_id)
    _require_document_access(doc, user, "edit")
    patch = body.model_dump(exclude_unset=True)
    for key, value in patch.items():
        setattr(doc, key, value)
    case_documents[doc.id] = doc
    return doc


@router.get("/documents/{doc_id}/preview")
async def preview_document(doc_id: str, user: dict = Depends(get_current_user)):
    doc = case_documents.get(doc_id)
    _require_document_access(doc, user, "view")
    return {
        "document": doc.model_dump(mode="json"),
        "text_preview": (doc.extracted_text or "")[:12000],
        "has_original": bool(resolve_document_path(doc)),
    }


@router.get("/documents/{doc_id}/content")
async def document_content(doc_id: str, user: dict = Depends(get_current_user)):
    doc = case_documents.get(doc_id)
    _require_document_access(doc, user, "view")
    path = resolve_document_path(doc)
    if not path:
        raise HTTPException(status_code=404, detail="Original file not available")
    media_type = doc.mime_type or mimetypes.guess_type(doc.filename)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type, filename=doc.filename)


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: dict = Depends(get_current_user)):
    doc = case_documents.get(doc_id)
    _require_document_access(doc, user, "delete_evidence")
    try:
        from app.services.qdrant_client import delete_points
        delete_points(doc.qdrant_point_ids)
    except Exception:
        logger.warning("Qdrant cleanup failed for document %s", doc_id)
    delete_document_file(doc)
    case_documents.pop(doc_id, None)
    return {"ok": True, "deleted": doc_id}
