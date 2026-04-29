from __future__ import annotations

from app.time import utc_now

import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from app.models import CaseDocument, CaseRecord


KNOWN_ACTORS = [
    {"id": "will-crowley", "name": "Will Crowley", "role": "Parent", "org": "Family"},
    {"id": "liam-crowley", "name": "Liam Crowley", "role": "Impacted child", "org": "Family"},
    {"id": "amy-branson", "name": "Amy Branson", "role": "Children's Services Specialist", "org": "JCPRD"},
    {"id": "jennifer-anderson", "name": "Jennifer Anderson", "role": "JCPRD", "org": "JCPRD"},
    {"id": "leigh-white", "name": "Leigh White", "role": "Mize OST staff/site contact", "org": "JCPRD"},
    {"id": "rob-knaussman", "name": "Rob Knaussman", "role": "KDHE/JCPRD communication recipient", "org": "JCPRD/KDHE"},
    {"id": "usd232", "name": "USD 232", "role": "School district", "org": "De Soto USD 232"},
    {"id": "jcprd", "name": "JCPRD", "role": "Out-of-school-time program operator", "org": "Johnson County Park and Recreation District"},
    {"id": "kdhe", "name": "KDHE", "role": "Child care licensing regulator", "org": "Kansas Department of Health and Environment"},
]

KNOWN_ENTITIES = [
    {"id": "usd232", "name": "De Soto USD 232", "type": "district", "state": "KS"},
    {"id": "jcprd", "name": "Johnson County Park and Recreation District", "type": "agency", "state": "KS"},
    {"id": "kdhe", "name": "Kansas Department of Health and Environment", "type": "agency", "state": "KS"},
    {"id": "mize", "name": "Mize Elementary", "type": "program", "state": "KS"},
]

LEGAL_SOURCES = [
    {
        "id": "KAR-28-4-592",
        "type": "regulation",
        "citation": "K.A.R. 28-4-592",
        "holding": "Kansas school-age program safety and emergency procedures, including critical incident reporting.",
        "relevance": "Useful benchmark for critical incident reporting, parent notice, and emergency/safety procedures.",
        "important": True,
        "verification": "needs-verification",
    },
    {
        "id": "KSA-65-501",
        "type": "statute",
        "citation": "K.S.A. 65-501",
        "holding": "Kansas child care facility licensing definitions and statutory framework.",
        "relevance": "Helps anchor whether the Mize OST program was operating under child care licensing obligations.",
        "important": True,
        "verification": "needs-verification",
    },
    {
        "id": "KSA-65-512",
        "type": "statute",
        "citation": "K.S.A. 65-512",
        "holding": "Kansas licensing survey/inspection authority for child care facilities.",
        "relevance": "Relevant to KDHE survey findings, notices of survey findings, and licensing history.",
        "important": True,
        "verification": "needs-verification",
    },
    {
        "id": "KORA",
        "type": "statute",
        "citation": "Kansas Open Records Act, K.S.A. 45-215 et seq.",
        "holding": "Public record access framework.",
        "relevance": "Basis for follow-up records requests when the KORA production reveals missing attachments or unclear record categories.",
        "important": True,
        "verification": "needs-verification",
    },
]


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "kora"


def _actor_for_doc(doc: CaseDocument) -> str:
    value = f"{doc.source_person} {doc.filename} {doc.extracted_text[:1000]}".lower()
    if "amy branson" in value or doc.filename.startswith("AB "):
        return "amy-branson"
    if "jennifer anderson" in value or doc.filename.startswith("JA "):
        return "jennifer-anderson"
    if "leigh white" in value:
        return "leigh-white"
    if "knaussman" in value:
        return "rob-knaussman"
    if "kdhe" in value or "kansas department of health" in value:
        return "kdhe"
    if "usd 232" in value or "de soto" in value:
        return "usd232"
    if "jcprd" in value or "johnson county park" in value:
        return "jcprd"
    return "jcprd"


def _summary(text: str, fallback: str, limit: int = 240) -> str:
    clean = re.sub(r"\s+", " ", text or "").strip()
    if not clean:
        return fallback
    if len(clean) <= limit:
        return clean
    return clean[:limit].rsplit(" ", 1)[0] + "..."


def _evidence_item(doc: CaseDocument) -> dict:
    title = Path(doc.source_zip_path or doc.filename).name
    body = doc.extracted_text or doc.failure_reason or ""
    return {
        "id": doc.id,
        "type": "pdf" if doc.file_type == "pdf" else (doc.file_type or "document"),
        "title": title,
        "summary": _summary(body, doc.user_description or title),
        "bodyText": body or doc.user_description,
        "date": doc.document_date,
        "source": _actor_for_doc(doc),
        "important": bool({"mentions_liam", "mentions_crowley", "critical_incident", "incident_report", "urgent"} & set(doc.analysis_flags)),
        "keyClaims": _key_claims(doc),
        "pdfFile": bool(doc.storage_path),
        "metadata": {
            "filename": doc.filename,
            "source_zip_path": doc.source_zip_path,
            "source_zip_paths": doc.source_zip_paths,
            "evidence_type": doc.evidence_type,
            "processing_status": doc.processing_status,
            "ocr_status": doc.ocr_status,
            "page_count": doc.page_count,
            "import_batch_id": doc.import_batch_id,
            "content_sha256": doc.content_sha256,
        },
    }


def _key_claims(doc: CaseDocument) -> list[str]:
    flags = set(doc.analysis_flags)
    claims = []
    if {"mentions_liam", "incident_report"} <= flags:
        claims.append("Records directly reference Liam/Crowley and an incident report.")
    if "critical_incident" in flags:
        claims.append("Records reference critical incident reporting.")
    if "medical_reference" in flags:
        claims.append("Records may mention doctor, medical, or treatment context.")
    if "refund_or_drop" in flags:
        claims.append("Records reference refund/drop action after the incident.")
    if "staff_log" in flags:
        claims.append("Records may show staffing or placement around the incident window.")
    if "licensing" in flags or "kdhe" in flags:
        claims.append("Records connect the program to KDHE licensing/compliance materials.")
    if "low_text_or_scanned" in flags:
        claims.append("PDF appears scanned or low-text and needs OCR/human review.")
    return claims[:4]


def _thread_id(folder: str) -> str:
    return "kora-" + _slug(folder)


def _threads(docs: list[CaseDocument]) -> list[dict]:
    grouped: dict[str, list[str]] = defaultdict(list)
    names: dict[str, str] = {}
    for doc in docs:
        folder = (doc.source_zip_path or "").split("/")[0] or "KORA response"
        tid = _thread_id(folder)
        grouped[tid].append(doc.id)
        names[tid] = folder
    return [
        {
            "id": tid,
            "title": names[tid],
            "docIds": doc_ids,
            "abstract": f"{len(doc_ids)} imported KORA response document(s) from {names[tid]}.",
        }
        for tid, doc_ids in sorted(grouped.items())
    ]


def _timeline(docs: list[CaseDocument]) -> list[dict]:
    events = []
    for doc in docs:
        if not doc.document_date:
            continue
        events.append({
            "id": f"tl-{doc.id}",
            "date": doc.document_date,
            "time": None,
            "actor": _actor_for_doc(doc),
            "action": doc.filename,
            "significance": "critical" if doc.evidence_type in {"critical_incident", "incident_report", "prior_incident"} else "supporting",
            "category": doc.evidence_type,
            "docIds": [doc.id],
        })
    events.sort(key=lambda item: item["date"])
    return events


def _find_docs(docs: list[CaseDocument], *needles: str) -> list[CaseDocument]:
    lowered = [needle.lower() for needle in needles]
    found = []
    for doc in docs:
        blob = f"{doc.filename}\n{doc.source_zip_path}\n{doc.extracted_text[:4000]}\n{' '.join(doc.analysis_flags)}".lower()
        if all(needle in blob for needle in lowered):
            found.append(doc)
    return found


def _contradictions(docs: list[CaseDocument]) -> list[dict]:
    contradictions = []
    critical_docs = _find_docs(docs, "critical incident")
    incident_docs = _find_docs(docs, "incident report")
    updated_docs = _find_docs(docs, "updated", "critical incident")
    medical_docs = [doc for doc in docs if "medical_reference" in doc.analysis_flags]
    refund_docs = [doc for doc in docs if "refund_or_drop" in doc.analysis_flags]
    staff_docs = [doc for doc in docs if doc.evidence_type in {"staff_log", "staff_training"}]
    licensing_docs = [doc for doc in docs if doc.evidence_type in {"licensing", "policy"} or "kdhe" in doc.analysis_flags]
    lease_docs = [doc for doc in docs if doc.evidence_type == "lease_contract"]

    if critical_docs and updated_docs:
        contradictions.append({
            "id": "kora-critical-incident-updates",
            "severity": "critical",
            "title": "Critical incident reporting appears to have an original and later updated version",
            "claimA": {
                "actor": "JCPRD/KDHE records",
                "text": "The packet includes a critical incident report around the April 3, 2026 Mize incident.",
                "docIds": [doc.id for doc in critical_docs[:4]],
            },
            "claimB": {
                "actor": "Updated filing / inter-agency communication",
                "text": "The packet also includes an updated critical incident form/email after the original report date.",
                "docIds": [doc.id for doc in updated_docs[:4]],
            },
            "impact": "This is a priority comparison point: the parent case needs to know what changed between the original and updated versions, who requested it, and why.",
        })

    if incident_docs and medical_docs:
        contradictions.append({
            "id": "kora-medical-doctor-context",
            "severity": "high",
            "title": "Incident reporting should be compared against doctor/medical references",
            "claimA": {
                "actor": "Incident report production",
                "text": "Incident-report records describe the event and related documentation.",
                "docIds": [doc.id for doc in incident_docs[:4]],
            },
            "claimB": {
                "actor": "Internal communication / related records",
                "text": "At least one produced record appears to reference doctor, medical, or treatment context.",
                "docIds": [doc.id for doc in medical_docs[:4]],
            },
            "impact": "If the official incident form minimizes medical significance while internal messages recognize doctor involvement, that is a concrete contradiction to review.",
        })

    if refund_docs:
        contradictions.append({
            "id": "kora-refund-drop-timing",
            "severity": "high",
            "title": "Refund/drop timing may function as an operational response to the incident",
            "claimA": {
                "actor": "Program/account records",
                "text": "Refund/drop records were produced after the April 2026 incident window.",
                "docIds": [doc.id for doc in refund_docs[:4]],
            },
            "claimB": {
                "actor": "Case theory",
                "text": "The refund/drop action should be reconciled with whether the program treated the event as routine, serious, or administratively closed.",
                "docIds": [doc.id for doc in (incident_docs + critical_docs)[:4]],
            },
            "impact": "This may show what the program did operationally after the incident, even if formal communications used softer language.",
        })

    if staff_docs and (incident_docs or critical_docs):
        contradictions.append({
            "id": "kora-staffing-training-vs-incident",
            "severity": "high",
            "title": "Staffing, placement, and training records need to be reconciled with the incident narrative",
            "claimA": {
                "actor": "Staff records",
                "text": "The packet includes staff placement, logs, training records, manuals, or emergency plans.",
                "docIds": [doc.id for doc in staff_docs[:6]],
            },
            "claimB": {
                "actor": "Incident records",
                "text": "The packet includes incident/critical incident materials for the Mize event.",
                "docIds": [doc.id for doc in (incident_docs + critical_docs)[:6]],
            },
            "impact": "The important question is whether the people present, trained, and assigned on the relevant dates match the incident account and applicable supervision/safety expectations.",
        })

    if licensing_docs:
        contradictions.append({
            "id": "kora-licensing-compliance-context",
            "severity": "medium",
            "title": "Licensing and survey history create a compliance baseline",
            "claimA": {
                "actor": "KDHE/licensing records",
                "text": "The packet includes licensing, survey findings, regulation, or KDHE materials for the Mize OST program.",
                "docIds": [doc.id for doc in licensing_docs[:6]],
            },
            "claimB": {
                "actor": "Incident records",
                "text": "The incident should be assessed against the safety, reporting, and supervision baseline reflected in those materials.",
                "docIds": [doc.id for doc in (incident_docs + critical_docs)[:6]],
            },
            "impact": "This is less a single contradiction than a checklist: the produced records should show whether the program followed the baseline it was licensed/trained under.",
        })

    if lease_docs:
        contradictions.append({
            "id": "kora-lease-responsibility-shifting",
            "severity": "medium",
            "title": "Lease/board records should be compared against responsibility-shifting communications",
            "claimA": {
                "actor": "Lease and board records",
                "text": "The packet includes lease/board materials governing JCPRD operations on district property.",
                "docIds": [doc.id for doc in lease_docs[:4]],
            },
            "claimB": {
                "actor": "Inter-agency communications",
                "text": "Communications should be reviewed for whether USD 232 and JCPRD shifted responsibility to each other.",
                "docIds": [doc.id for doc in _find_docs(docs, "communication")[:4]],
            },
            "impact": "This matters because the parent case turns partly on whether contractual and public-facing responsibilities matched the agencies' response.",
        })

    return contradictions


def _evidence_gaps(docs: list[CaseDocument]) -> list[dict]:
    gaps = []
    low_text = [doc for doc in docs if doc.processing_status == "needs_review" or "low_text_or_scanned" in doc.analysis_flags]
    if low_text:
        gaps.append({
            "id": "GAP-KORA-OCR",
            "item": f"OCR/human review for {len(low_text)} scanned or low-text PDFs",
            "importance": "CRITICAL",
            "method": "OCR + manual review",
            "docIds": [doc.id for doc in low_text[:12]],
        })
    if not _find_docs(docs, "original", "critical incident"):
        gaps.append({
            "id": "GAP-ORIGINAL-CRITICAL",
            "item": "Confirm the exact original critical incident form and all later revisions",
            "importance": "HIGH",
            "method": "KORA follow-up / compare attachments",
            "docIds": [doc.id for doc in _find_docs(docs, "critical incident")[:6]],
        })
    if not _find_docs(docs, "witness"):
        gaps.append({
            "id": "GAP-WITNESS-STATEMENTS",
            "item": "Witness statements, internal notes, and staff accounts tied to the incident",
            "importance": "HIGH",
            "method": "KORA follow-up",
            "docIds": [doc.id for doc in _find_docs(docs, "incident")[:6]],
        })
    if not _find_docs(docs, "email", "usd232") and not _find_docs(docs, "de soto", "communication"):
        gaps.append({
            "id": "GAP-USD232-COMMS",
            "item": "USD 232 internal communications about the JCPRD/Mize incident",
            "importance": "HIGH",
            "method": "KORA follow-up to USD 232",
            "docIds": [],
        })
    gaps.append({
        "id": "GAP-ATTACHMENT-INTEGRITY",
        "item": "Verify every email attachment named in the production is present and matched to its parent email",
        "importance": "MEDIUM",
        "method": "Manifest reconciliation",
        "docIds": [doc.id for doc in docs if doc.evidence_type in {"communications", "critical_incident", "incident_report"}][:8],
    })
    return gaps


def _violations(docs: list[CaseDocument]) -> list[dict]:
    kdhe_docs = [doc.id for doc in docs if "kdhe" in doc.analysis_flags or doc.evidence_type in {"licensing", "policy"}]
    incident_docs = [doc.id for doc in docs if doc.evidence_type in {"incident_report", "critical_incident", "prior_incident"}]
    return [
        {
            "id": "KORA-REVIEW-28-4-592",
            "title": "Critical incident reporting and safety procedure review",
            "summary": "Compare the incident/critical incident records against K.A.R. 28-4-592 and the program's own emergency/safety materials.",
            "evidenceIds": list(dict.fromkeys(kdhe_docs + incident_docs))[:10],
            "status": "needs_review",
        },
        {
            "id": "KORA-REVIEW-SUPERVISION",
            "title": "Supervision, staffing, and training review",
            "summary": "Compare staff placement/log/training records against the incident timeline and any supervision requirements.",
            "evidenceIds": [doc.id for doc in docs if doc.evidence_type in {"staff_log", "staff_training"}][:10],
            "status": "needs_review",
        },
    ]


def build_private_case_file(case: CaseRecord, docs: list[CaseDocument]) -> dict:
    docs = sorted(docs, key=lambda doc: (doc.document_date or "", doc.uploaded_at.isoformat(), doc.filename))
    evidence = [_evidence_item(doc) for doc in docs]
    indexed = len([doc for doc in docs if doc.processing_status == "indexed"])
    needs_review = len([doc for doc in docs if doc.processing_status == "needs_review"])
    return {
        "case": case.model_dump(mode="json"),
        "meta": {
            "source": "private_case_documents",
            "caseId": case.id,
            "documentCount": len(docs),
            "indexedDocumentCount": indexed,
            "needsReviewDocumentCount": needs_review,
            "generatedAt": utc_now().isoformat(),
        },
        "actors": KNOWN_ACTORS,
        "entities": KNOWN_ENTITIES,
        "evidence": evidence,
        "sources": LEGAL_SOURCES,
        "threads": _threads(docs),
        "timeline": _timeline(docs),
        "violations": _violations(docs),
        "contradictions": _contradictions(docs),
        "evidenceGaps": _evidence_gaps(docs),
        "policyReforms": [],
    }
