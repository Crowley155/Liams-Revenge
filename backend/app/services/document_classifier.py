from __future__ import annotations

from pathlib import Path


CATEGORY_LABELS = {
    "messages": "Messages",
    "school_records": "School records",
    "iep_504_services": "IEP/504 and services",
    "incident_safety": "Incident and safety",
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
    "medical_provider": ("medical", "doctor", "clinic", "hospital", "diagnosis", "therapy", "provider"),
    "complaints_agency": ("complaint", "ocr", "agency", "kdhe", "state", "letter", "investigation"),
    "photos_screenshots": ("screenshot", "photo", "image", "picture", "png", "jpg", "jpeg"),
}


def infer_document_metadata(filename: str, extracted_text: str = "") -> tuple[str, float, list[str], str]:
    haystack = f"{filename}\n{extracted_text[:4000]}".lower()
    ext = Path(filename or "").suffix.lower()
    scores: dict[str, int] = {}
    for category, words in KEYWORDS.items():
        score = sum(1 for word in words if word in haystack)
        if score:
            scores[category] = score

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
