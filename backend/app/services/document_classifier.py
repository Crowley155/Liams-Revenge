from __future__ import annotations

from pathlib import Path


CATEGORY_LABELS = {
    "messages": "Messages",
    "school_records": "School records",
    "iep_504_services": "IEP/504 and services",
    "incident_safety": "Incident and safety",
    "policy_rules": "Policies and rules",
    "medical_provider": "Medical/outside provider",
    "complaints_agency": "Complaints and agency letters",
    "photos_screenshots": "Photos/screenshots",
    "other": "Other",
}

EVIDENCE_TYPE_BY_CATEGORY = {
    "messages": "communications",
    "school_records": "meeting_notes",
    "iep_504_services": "iep_504",
    "incident_safety": "incident_report",
    "policy_rules": "policy",
    "medical_provider": "medical",
    "complaints_agency": "agency_letter",
    "photos_screenshots": "photo",
    "other": "other",
}

KEYWORDS = {
    "messages": ("email", "gmail", "message", "text", "sms", "thread", "from:", "subject:"),
    "school_records": ("meeting", "minutes", "notes", "attendance", "handbook", "policy", "school record"),
    "iep_504_services": ("iep", "504", "evaluation", "prior written notice", "pwn", "accommodation", "services"),
    "incident_safety": ("incident", "injury", "unsafe", "safety", "supervision", "bullying", "harassment", "assault"),
    "policy_rules": ("policy", "regulation", "statute", "lease", "contract", "handbook", "licensing law", "ksa"),
    "medical_provider": ("medical", "doctor", "clinic", "hospital", "diagnosis", "therapy", "provider"),
    "complaints_agency": ("complaint", "ocr", "agency", "kdhe", "state", "letter", "investigation"),
    "photos_screenshots": ("screenshot", "photo", "image", "picture", "png", "jpg", "jpeg"),
}

EVIDENCE_TYPE_CATEGORY_MAP = {
    "communications": "messages",
    "email_export": "messages",
    "email_message": "messages",
    "message": "messages",
    "meeting_notes": "school_records",
    "school_record": "school_records",
    "board_minutes": "school_records",
    "attendance": "school_records",
    "iep_504": "iep_504_services",
    "evaluation": "iep_504_services",
    "accommodation": "iep_504_services",
    "critical_incident": "incident_safety",
    "incident_report": "incident_safety",
    "prior_incident": "incident_safety",
    "staff_log": "incident_safety",
    "staff_training": "incident_safety",
    "safety_record": "incident_safety",
    "medical": "medical_provider",
    "provider_record": "medical_provider",
    "agency_letter": "complaints_agency",
    "complaint": "complaints_agency",
    "licensing": "complaints_agency",
    "investigation": "complaints_agency",
    "policy": "policy_rules",
    "regulation": "policy_rules",
    "lease_contract": "policy_rules",
    "insurance": "policy_rules",
    "photo": "photos_screenshots",
    "screenshot": "photos_screenshots",
    "image": "photos_screenshots",
}


def category_for_evidence_type(evidence_type: str = "") -> str:
    return EVIDENCE_TYPE_CATEGORY_MAP.get((evidence_type or "").strip().lower(), "")


def document_category(
    inferred_category: str = "",
    evidence_type: str = "",
    tags: list[str] | None = None,
) -> str:
    if inferred_category and inferred_category != "other" and inferred_category in CATEGORY_LABELS:
        return inferred_category
    for tag in tags or []:
        if tag and tag != "other" and tag in CATEGORY_LABELS:
            return tag
    return category_for_evidence_type(evidence_type) or inferred_category or "other"


def document_matches_category(doc, category: str) -> bool:
    if not category:
        return True
    return document_category(
        getattr(doc, "inferred_category", ""),
        getattr(doc, "evidence_type", ""),
        getattr(doc, "tags", []),
    ) == category or category in (getattr(doc, "tags", []) or [])


def infer_document_metadata(filename: str, extracted_text: str = "", evidence_type: str = "") -> tuple[str, float, list[str], str]:
    haystack = f"{filename}\n{extracted_text[:4000]}".lower()
    ext = Path(filename or "").suffix.lower()
    scores: dict[str, int] = {}
    for category, words in KEYWORDS.items():
        score = sum(1 for word in words if word in haystack)
        if score:
            scores[category] = score

    mapped_category = category_for_evidence_type(evidence_type)
    if mapped_category:
        scores[mapped_category] = scores.get(mapped_category, 0) + 4

    if ext in {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".webp", ".bmp"}:
        scores["photos_screenshots"] = scores.get("photos_screenshots", 0) + 3
    if ext == ".eml":
        scores["messages"] = scores.get("messages", 0) + 3

    if scores:
        category = max(scores, key=scores.get)
        confidence = min(0.95, 0.45 + (scores[category] * 0.12))
    else:
        category = "other"
        confidence = 0.25

    tags = [category]
    for candidate, score in sorted(scores.items(), key=lambda item: item[1], reverse=True):
        if candidate not in tags and score > 0:
            tags.append(candidate)
        if len(tags) >= 4:
            break

    return category, confidence, tags, EVIDENCE_TYPE_BY_CATEGORY.get(category, "other")
