from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import re
import secrets
import uuid
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import BinaryIO

from app.api._store import (
    agent_runs,
    case_documents,
    case_evaluations,
    cases,
    entities,
    jobs,
    kora_requests,
    profiles,
    usage_events,
    workspaces,
)
from app.config import settings
from app.db import _connect
from app.models import AppUser, CaseDocument, CaseIntake, CaseRecord, CaseStatus, Workspace, WorkspacePlan, WorkspaceType
from app.services.text_chunker import chunk_text

logger = logging.getLogger(__name__)

DEFAULT_OWNER_EMAIL = "william.crowley@gmail.com"
DEFAULT_CASE_ID = "crowley-v-usd232"
LEGACY_WORKSPACE_ID = "demo"
OCR_MAX_BYTES = 8 * 1024 * 1024
OCR_MAX_PAGES = 40
LOW_TEXT_THRESHOLD = 200


def maintenance_token_valid(value: str) -> bool:
    expected = os.getenv("USDWATCH_MAINTENANCE_TOKEN", "")
    return bool(expected and value and secrets.compare_digest(expected, value))


def _admin_or_owner_emails() -> set[str]:
    raw = ",".join(
        value for value in [
            os.getenv("USDWATCH_CASE_OWNER_EMAILS", ""),
            os.getenv("USDWATCH_ADMIN_EMAILS", ""),
            os.getenv("ADMIN_EMAIL", ""),
            DEFAULT_OWNER_EMAIL,
        ]
        if value
    )
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def _find_user_by_email(email: str) -> AppUser | None:
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, email, role, clerk_user_id, workspace_id, data FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        if not row:
            return None
        data = json.loads(row["data"] or "{}")
        data.setdefault("id", row["id"])
        data.setdefault("email", row["email"])
        data.setdefault("role", row["role"])
        data.setdefault("clerk_user_id", row["clerk_user_id"] or "")
        data.setdefault("workspace_id", row["workspace_id"] or "")
        return AppUser(**data)
    finally:
        conn.close()


def _save_user(user: AppUser) -> None:
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO users (id, email, password, role, clerk_user_id, workspace_id, data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                email=excluded.email,
                role=excluded.role,
                clerk_user_id=excluded.clerk_user_id,
                workspace_id=excluded.workspace_id,
                data=excluded.data
            """,
            (
                user.id,
                user.email,
                "",
                user.role,
                user.clerk_user_id,
                user.workspace_id,
                json.dumps(user.model_dump(mode="json")),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _ensure_owner_workspace(owner_email: str) -> tuple[AppUser, Workspace]:
    email = owner_email.lower().strip()
    user = _find_user_by_email(email)
    owner_is_elevated = email in _admin_or_owner_emails()

    if user and user.workspace_id:
        workspace = workspaces.get(user.workspace_id)
        if workspace:
            if owner_is_elevated and workspace.plan == WorkspacePlan.FREE:
                workspace.plan = WorkspacePlan.ADMIN
                workspace.updated_at = datetime.utcnow()
                workspaces[workspace.id] = workspace
            if owner_is_elevated and user.role != "admin":
                user.role = "admin"
                user.updated_at = datetime.utcnow()
                _save_user(user)
            return user, workspace

    user = user or AppUser(
        id=str(uuid.uuid4())[:8],
        clerk_user_id=f"maintenance:{email}",
        email=email,
        role="admin" if owner_is_elevated else "member",
        workspace_id="",
    )
    workspace = Workspace(
        id=str(uuid.uuid4())[:8],
        name=f"{email} workspace",
        type=WorkspaceType.PERSONAL,
        plan=WorkspacePlan.ADMIN if owner_is_elevated else WorkspacePlan.FREE,
        owner_user_id=user.id,
    )
    workspaces[workspace.id] = workspace
    user.workspace_id = workspace.id
    user.updated_at = datetime.utcnow()
    _save_user(user)
    return user, workspace


def _claim_or_create_case(case_id: str, user: AppUser, workspace: Workspace) -> CaseRecord:
    case = cases.get(case_id)
    old_workspace_id = case.workspace_id if case else ""

    if case and case.workspace_id not in {workspace.id, LEGACY_WORKSPACE_ID, ""}:
        raise ValueError(f"Case {case_id} belongs to a different workspace")

    if not case:
        case = CaseRecord(
            id=case_id,
            workspace_id=workspace.id,
            title="Crowley v. USD 232 / JCPRD",
            status=CaseStatus.ACTIVE,
            intake=CaseIntake(
                state="KS",
                district="USD 232",
                school="Mize Elementary",
                issue_type="student_safety",
                issue_categories=["student_safety", "records", "supervision", "kora_response"],
                incident_date="2026-04-03",
                narrative="",
                desired_outcome="Use KORA response records to build a complete private case file and identify contradictions, gaps, and next steps.",
                impacted_party_age=6,
                grade_level="kindergarten",
                school_setting="public elementary school / JCPRD out-of-school-time program",
                relationship_to_child="parent_guardian",
                urgency_level="urgent",
                safety_risk=True,
                prior_actions=["Submitted KORA request", "Requested records from public entities"],
                urgent=True,
            ),
            summary="Private KORA response case file for the April 2026 Mize/JCPRD incident and related records.",
            created_by=user.id,
        )
    else:
        case.workspace_id = workspace.id
        case.status = CaseStatus.ACTIVE if case.status == CaseStatus.DEMO else case.status
        case.created_by = case.created_by or user.id
        case.title = case.title or "Crowley v. USD 232 / JCPRD"
        case.summary = (
            case.summary
            if case.summary and "Seeded admin/demo" not in case.summary
            else "Private KORA response case file for the April 2026 Mize/JCPRD incident and related records."
        )
        intake = case.intake
        intake.state = intake.state or "KS"
        intake.district = intake.district or "USD 232"
        intake.school = intake.school or "Mize Elementary"
        intake.issue_type = intake.issue_type or "student_safety"
        for category in ["student_safety", "records", "supervision", "kora_response"]:
            if category not in intake.issue_categories:
                intake.issue_categories.append(category)
        intake.incident_date = intake.incident_date or "2026-04-03"
        intake.desired_outcome = intake.desired_outcome or "Use KORA response records to identify contradictions, gaps, and next steps."
        intake.impacted_party_age = intake.impacted_party_age or intake.student_age or 6
        intake.grade_level = intake.grade_level or "kindergarten"
        intake.school_setting = intake.school_setting or "public elementary school / JCPRD out-of-school-time program"
        intake.relationship_to_child = intake.relationship_to_child or "parent_guardian"
        intake.urgency_level = "urgent" if intake.urgency_level == "routine" else intake.urgency_level
        intake.safety_risk = True
        intake.urgent = True

    case.updated_at = datetime.utcnow()
    cases[case.id] = case

    if old_workspace_id == LEGACY_WORKSPACE_ID:
        for store in (profiles, entities, jobs, kora_requests, case_documents, case_evaluations, agent_runs, usage_events):
            for item_id, item in list(store.items()):
                if getattr(item, "case_id", "") == case_id and getattr(item, "workspace_id", "") == LEGACY_WORKSPACE_ID:
                    item.workspace_id = workspace.id
                    if hasattr(item, "updated_at"):
                        item.updated_at = datetime.utcnow()
                    store[item_id] = item

    return case


def _entry_date(path: str) -> str | None:
    name = Path(path).name
    patterns = [
        r"(?<!\d)(\d{1,2})[._-](\d{1,2})[._-](\d{2,4})(?!\d)",
        r"(?<!\d)(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})(?!\d)",
    ]
    for pattern in patterns:
        match = re.search(pattern, name)
        if not match:
            continue
        month, day, year = [int(part) for part in match.groups()]
        if year < 100:
            year += 2000 if year < 50 else 1900
        try:
            return datetime(year, month, day).date().isoformat()
        except ValueError:
            continue
    return None


def classify_kora_path(path: str) -> str:
    lower = path.lower()
    if "insurance" in lower or "liability policy" in lower or "coi" in lower:
        return "insurance"
    if "lease" in lower or "addendum" in lower:
        return "lease_contract"
    if "board meeting" in lower or "board minutes" in lower or "committee packet" in lower or "rec minutes" in lower:
        return "board_minutes"
    if "critical incident" in lower:
        return "critical_incident"
    if "prior incident" in lower:
        return "prior_incident"
    if "incident report" in lower or "incident reports" in lower:
        return "incident_report"
    if "staff logs" in lower or "timesheet" in lower or "staff placement" in lower or "program schedule" in lower:
        return "staff_log"
    if "training" in lower or "emergency plan" in lower or "staff manual" in lower:
        return "staff_training"
    if "28-4-592" in lower or "regulation" in lower or "safety" in lower:
        return "policy"
    if "licens" in lower or "nosf" in lower or "survey inspection" in lower:
        return "licensing"
    if "communication" in lower or lower.startswith("4 inter agency"):
        return "communications"
    return "kora_response"


def _source_person(path: str) -> str:
    name = Path(path).name
    if name.startswith("AB "):
        return "Amy Branson"
    if name.startswith("JA "):
        return "Jennifer Anderson"
    if "Leigh White" in name:
        return "Leigh White"
    if "Knaussman" in name:
        return "Rob Knaussman"
    return ""


def _analysis_flags(path: str, text: str = "") -> list[str]:
    lower = f"{path}\n{text[:5000]}".lower()
    checks = {
        "mentions_liam": ["liam"],
        "mentions_crowley": ["crowley"],
        "critical_incident": ["critical incident"],
        "incident_report": ["incident report"],
        "refund_or_drop": ["refund", "dropping liam", "drop liam", "dropped liam"],
        "medical_reference": ["doctor", "medical", "pediatric", "treatment"],
        "urgent": ["urgent"],
        "staff_training": ["training", "staff manual", "emergency plan"],
        "staff_log": ["timesheet", "staff placement", "program schedule"],
        "licensing": ["license", "licensing", "nosf", "survey finding"],
        "lease_or_indemnity": ["lease", "indemnification", "liability"],
        "kdhe": ["kdhe", "kansas department of health"],
        "mize": ["mize"],
    }
    flags = [flag for flag, needles in checks.items() if any(needle in lower for needle in needles)]
    if not text.strip():
        flags.append("low_text_or_scanned")
    return flags


def _high_signal(path: str, evidence_type: str) -> bool:
    lower = path.lower()
    needles = [
        "liam",
        "crowley",
        "urgent",
        "critical incident",
        "incident report",
        "4.3.26",
        "4/3/26",
        "4-3-26",
        "4.2.26",
        "4/2/26",
        "4-2-26",
        "staff placement",
        "staff timesheet",
        "staff logs",
        "training records",
        "28-4-592",
        "nosf",
        "survey inspection",
        "licens",
    ]
    return evidence_type in {"critical_incident", "incident_report", "prior_incident", "staff_log", "policy", "licensing"} or any(
        needle in lower for needle in needles
    )


def _low_priority_ocr(path: str, size: int, page_count: int) -> bool:
    lower = path.lower()
    if "insurance" in lower or "liability policy" in lower:
        return True
    if "staff training manual" in lower and size > OCR_MAX_BYTES:
        return True
    return size > OCR_MAX_BYTES or page_count > OCR_MAX_PAGES


def _pdf_text(content: bytes, max_pages: int | None = None) -> tuple[str, int, str]:
    try:
        from pypdf import PdfReader
    except Exception as exc:
        return "", 0, f"pypdf unavailable: {exc}"

    try:
        reader = PdfReader(io.BytesIO(content))
        page_count = len(reader.pages)
        selected = reader.pages[:max_pages] if max_pages else reader.pages
        parts: list[str] = []
        for page in selected:
            try:
                parts.append(page.extract_text() or "")
            except Exception as exc:
                parts.append(f"[page text extraction failed: {exc}]")
        text = "\n\n".join(part for part in parts if part).strip()
        return text, page_count, ""
    except Exception as exc:
        return "", 0, str(exc)


def _ocr_pdf(filename: str, content: bytes) -> tuple[str, str]:
    try:
        from app.services.document_parser import parse_file

        text, _file_type = parse_file(filename, content)
        if not text or text.startswith("["):
            return "", text or "OCR returned no text"
        return text, ""
    except Exception as exc:
        return "", str(exc)


def _storage_root() -> Path:
    return Path(os.getenv("DATA_DIR", settings.data_dir)) / "evidence-files"


def _write_pdf(workspace_id: str, case_id: str, doc_id: str, content: bytes) -> str:
    root = _storage_root() / workspace_id / case_id
    root.mkdir(parents=True, exist_ok=True)
    target = root / f"{doc_id}.pdf"
    target.write_bytes(content)
    return str(target)


def _store_chunks(doc: CaseDocument) -> None:
    if not doc.extracted_text:
        return
    try:
        from app.services.qdrant_client import store_document_chunks

        chunks = chunk_text(doc.extracted_text, doc.id)
        doc.chunk_count = len(chunks)
        doc.qdrant_point_ids = store_document_chunks(
            chunks=chunks,
            document_id=doc.id,
            entity_ids=doc.entity_ids,
            person_ids=doc.person_ids,
            source=doc.source,
            metadata={
                "filename": doc.filename,
                "case_id": doc.case_id,
                "workspace_id": doc.workspace_id,
                "source_zip_path": doc.source_zip_path,
                "evidence_type": doc.evidence_type,
                "import_batch_id": doc.import_batch_id,
            },
        )
    except Exception as exc:
        logger.warning("Qdrant chunk storage failed for %s: %s", doc.id, exc)


def _manifest_for_zip(zf: zipfile.ZipFile, *, inspect_text: bool) -> tuple[list[dict], dict[str, list[str]]]:
    items: list[dict] = []
    by_hash: dict[str, list[str]] = defaultdict(list)
    for info in sorted(zf.infolist(), key=lambda item: item.filename):
        if info.is_dir() or not info.filename.lower().endswith(".pdf"):
            continue
        content = zf.read(info)
        sha = hashlib.sha256(content).hexdigest()
        evidence_type = classify_kora_path(info.filename)
        text_sample, page_count, text_error = ("", 0, "")
        if inspect_text:
            text_sample, page_count, text_error = _pdf_text(content, max_pages=3)
        text_chars = len(re.sub(r"\s+", " ", text_sample).strip())
        high_signal = _high_signal(info.filename, evidence_type)
        low_text = inspect_text and text_chars < LOW_TEXT_THRESHOLD
        ocr_action = "not_required"
        if low_text:
            ocr_action = "queued" if high_signal and not _low_priority_ocr(info.filename, info.file_size, page_count) else "needs_review"
        item = {
            "source_zip_path": info.filename,
            "filename": Path(info.filename).name,
            "folder": info.filename.split("/")[0],
            "file_size": info.file_size,
            "sha256": sha,
            "evidence_type": evidence_type,
            "document_date": _entry_date(info.filename),
            "source_person": _source_person(info.filename),
            "page_count": page_count,
            "sample_text_chars": text_chars,
            "low_text": low_text,
            "high_signal": high_signal,
            "ocr_action": ocr_action,
            "text_error": text_error,
            "analysis_flags": _analysis_flags(info.filename, text_sample),
        }
        items.append(item)
        by_hash[sha].append(info.filename)
    return items, by_hash


def _document_description(item: dict, source_paths: list[str], status_note: str = "") -> str:
    parts = [
        f"KORA response import: {item['evidence_type']}.",
        f"Source path: {item['source_zip_path']}.",
    ]
    if len(source_paths) > 1:
        parts.append("Exact duplicate source paths: " + "; ".join(source_paths) + ".")
    if status_note:
        parts.append(status_note)
    return " ".join(parts)


def import_kora_zip(
    zip_file: BinaryIO,
    *,
    filename: str = "",
    owner_email: str = DEFAULT_OWNER_EMAIL,
    case_id: str = DEFAULT_CASE_ID,
    dry_run: bool = True,
    ocr_scope: str = "high_signal",
) -> dict:
    zip_file.seek(0)
    batch_id = f"kora-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"

    with zipfile.ZipFile(zip_file) as zf:
        manifest, by_hash = _manifest_for_zip(zf, inspect_text=True)
        duplicates = {sha: paths for sha, paths in by_hash.items() if len(paths) > 1}
        folders = Counter(item["folder"] for item in manifest)
        evidence_types = Counter(item["evidence_type"] for item in manifest)
        low_text_items = [item for item in manifest if item["low_text"]]
        if ocr_scope == "none":
            ocr_queue = []
        elif ocr_scope == "all":
            ocr_queue = low_text_items
        else:
            ocr_queue = [item for item in low_text_items if item["ocr_action"] == "queued"]

        base_response = {
            "ok": True,
            "dry_run": dry_run,
            "batch_id": batch_id,
            "filename": filename,
            "owner_email": owner_email,
            "case_id": case_id,
            "total_files": len(manifest),
            "total_bytes": sum(item["file_size"] for item in manifest),
            "unique_files": len(by_hash),
            "duplicate_groups": len(duplicates),
            "duplicates": [{"sha256": sha, "paths": paths} for sha, paths in duplicates.items()],
            "folders": dict(sorted(folders.items())),
            "evidence_types": dict(sorted(evidence_types.items())),
            "low_text_count": len(low_text_items),
            "high_signal_ocr_count": len(ocr_queue),
            "high_signal_ocr_queue": [
                {
                    "source_zip_path": item["source_zip_path"],
                    "file_size": item["file_size"],
                    "page_count": item["page_count"],
                    "evidence_type": item["evidence_type"],
                    "analysis_flags": item["analysis_flags"],
                }
                for item in ocr_queue
            ],
            "documents": manifest,
        }

        if dry_run:
            return base_response

        user, workspace = _ensure_owner_workspace(owner_email)
        case = _claim_or_create_case(case_id, user, workspace)

        imported = 0
        indexed = 0
        needs_review = 0
        skipped_duplicates = 0
        updated_existing = 0

        first_by_hash = {sha: paths[0] for sha, paths in by_hash.items()}
        manifest_by_path = {item["source_zip_path"]: item for item in manifest}

        for sha, first_path in first_by_hash.items():
            info = zf.getinfo(first_path)
            content = zf.read(info)
            item = manifest_by_path[first_path]
            source_paths = by_hash[sha]
            skipped_duplicates += max(0, len(source_paths) - 1)
            doc_id = f"kora-{sha[:12]}"

            text, page_count, text_error = _pdf_text(content)
            text_chars = len(re.sub(r"\s+", " ", text).strip())
            low_text = text_chars < LOW_TEXT_THRESHOLD
            high_signal = _high_signal(first_path, item["evidence_type"])
            ocr_status = "not_required"
            status_note = ""

            if low_text:
                should_ocr = ocr_scope == "all" or (ocr_scope == "high_signal" and high_signal)
                if should_ocr and (ocr_scope == "all" or not _low_priority_ocr(first_path, info.file_size, page_count)):
                    ocr_status = "queued"
                    ocr_text, ocr_error = _ocr_pdf(item["filename"], content)
                    if ocr_text:
                        text = ocr_text
                        text_chars = len(re.sub(r"\s+", " ", text).strip())
                        low_text = text_chars < LOW_TEXT_THRESHOLD
                        ocr_status = "completed" if not low_text else "failed"
                        status_note = "OCR was attempted during import."
                    else:
                        ocr_status = "failed"
                        status_note = f"OCR attempted but did not produce usable text: {ocr_error[:240]}"
                else:
                    ocr_status = "skipped"
                    status_note = "Marked for human/OCR review because the PDF appears scanned or low text."

            storage_path = _write_pdf(workspace.id, case.id, doc_id, content)
            flags = _analysis_flags(first_path, text)
            if low_text and "low_text_or_scanned" not in flags:
                flags.append("low_text_or_scanned")

            existing = case_documents.get(doc_id)
            doc = existing or CaseDocument(id=doc_id, workspace_id=workspace.id, case_id=case.id, filename=item["filename"])
            if existing:
                updated_existing += 1
            doc.workspace_id = workspace.id
            doc.case_id = case.id
            doc.filename = item["filename"]
            doc.file_type = "pdf"
            doc.file_size = info.file_size
            doc.evidence_type = item["evidence_type"]
            doc.user_description = _document_description(item, source_paths, status_note)
            doc.document_date = item["document_date"]
            doc.source_person = item["source_person"]
            doc.storage_path = storage_path
            doc.content_sha256 = sha
            doc.source_zip_path = first_path
            doc.source_zip_paths = source_paths
            doc.import_batch_id = batch_id
            doc.page_count = page_count
            doc.ocr_status = ocr_status
            doc.duplicate_source_paths = source_paths[1:]
            doc.kora_response_source = filename or "KORA response zip"
            doc.source = "kora_response"
            doc.extracted_text = text
            doc.analysis_flags = flags
            doc.status = "indexed" if text and not low_text else "needs_review"
            doc.processing_status = doc.status
            doc.failure_reason = None if doc.status == "indexed" else (text_error or status_note or "No usable text extracted")
            doc.error = doc.failure_reason if doc.status != "indexed" else None
            doc.processed_at = datetime.utcnow()
            case_documents[doc.id] = doc

            if doc.status == "indexed":
                _store_chunks(doc)
                case_documents[doc.id] = doc
                indexed += 1
            else:
                needs_review += 1
            imported += 1

        case.updated_at = datetime.utcnow()
        cases[case.id] = case

        return {
            **base_response,
            "workspace_id": workspace.id,
            "user_id": user.id,
            "imported_documents": imported,
            "indexed_documents": indexed,
            "needs_review_documents": needs_review,
            "skipped_duplicate_files": skipped_duplicates,
            "updated_existing_documents": updated_existing,
        }
