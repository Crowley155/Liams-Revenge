from __future__ import annotations

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status

from app.services.kora_importer import (
    DEFAULT_CASE_ID,
    DEFAULT_OWNER_EMAIL,
    import_kora_zip,
    kora_import_status,
    maintenance_token_valid,
)

router = APIRouter(tags=["maintenance"])


@router.post("/maintenance/kora-import")
async def kora_import(
    file: UploadFile = File(...),
    owner_email: str = Form(default=DEFAULT_OWNER_EMAIL),
    case_id: str = Form(default=DEFAULT_CASE_ID),
    dry_run: bool = Form(default=True),
    ocr_scope: str = Form(default="high_signal"),
    offset: int = Form(default=0),
    max_files: int = Form(default=0),
    skip_existing: bool = Form(default=True),
    store_chunks: bool = Form(default=True),
    maintenance_token: str = Header(default="", alias="X-USDWATCH-MAINTENANCE-TOKEN"),
):
    if not maintenance_token_valid(maintenance_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maintenance token required")

    if ocr_scope not in {"high_signal", "all", "none"}:
        raise HTTPException(status_code=400, detail="ocr_scope must be high_signal, all, or none")

    if offset < 0 or max_files < 0:
        raise HTTPException(status_code=400, detail="offset and max_files must be zero or greater")

    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Upload the KORA response zip file")

    try:
        return import_kora_zip(
            file.file,
            filename=file.filename or "kora-response.zip",
            owner_email=owner_email,
            case_id=case_id,
            dry_run=dry_run,
            ocr_scope=ocr_scope,
            offset=offset,
            max_files=max_files,
            skip_existing=skip_existing,
            store_chunks=store_chunks,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/maintenance/kora-import/status")
async def kora_import_status_endpoint(
    owner_email: str = DEFAULT_OWNER_EMAIL,
    case_id: str = DEFAULT_CASE_ID,
    maintenance_token: str = Header(default="", alias="X-USDWATCH-MAINTENANCE-TOKEN"),
):
    if not maintenance_token_valid(maintenance_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Maintenance token required")
    return kora_import_status(owner_email=owner_email, case_id=case_id)
