from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

from app.config import settings
from app.models import CaseDocument


def _data_dir() -> Path:
    return Path(os.getenv("DATA_DIR", settings.data_dir))


def _safe_part(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value or "")
    return cleaned.strip("._")[:120] or "file"


def evidence_root() -> Path:
    root = _data_dir() / "evidence-files"
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_case_document_file(workspace_id: str, case_id: str, doc_id: str, filename: str, content: bytes) -> str:
    target_dir = evidence_root() / _safe_part(workspace_id) / _safe_part(case_id) / _safe_part(doc_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / _safe_part(filename)
    target.write_bytes(content)
    return str(target)


def resolve_document_path(doc: CaseDocument) -> Path | None:
    if not doc.storage_path:
        return None
    path = Path(doc.storage_path).resolve()
    root = evidence_root().resolve()
    try:
        path.relative_to(root)
    except ValueError:
        return None
    return path if path.exists() else None


def delete_document_file(doc: CaseDocument) -> None:
    path = resolve_document_path(doc)
    if not path:
        return
    path.unlink(missing_ok=True)
    parent = path.parent
    root = evidence_root().resolve()
    try:
        parent.relative_to(root)
        if parent.exists() and not any(parent.iterdir()):
            shutil.rmtree(parent)
    except Exception:
        return
