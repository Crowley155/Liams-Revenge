import httpx
import pytest

from app.models import CaseIntake, CaseRecord
from app.models import GmailImportRule
from app.services.gmail_importer import GmailImportError, build_gmail_query, gmail_get_json, score_gmail_message_relevance


def test_gmail_query_ors_multiple_domains_and_keyword_groups():
    rule = GmailImportRule(
        domains=["usd232.org", "jcocogov.org"],
        email_addresses=["principal@usd232.org"],
        keywords=["incident", "aftercare supervision"],
    )

    query = build_gmail_query(rule)

    assert query == (
        "(from:usd232.org OR to:usd232.org OR from:jcocogov.org OR to:jcocogov.org "
        "OR from:principal@usd232.org OR to:principal@usd232.org) "
        "(incident OR \"aftercare supervision\")"
    )


def test_gmail_api_disabled_error_is_parent_safe(monkeypatch):
    class FakeClient:
        def __init__(self, timeout):
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url, params, headers):
            return httpx.Response(
                403,
                json={
                    "error": {
                        "code": 403,
                        "message": (
                            "Gmail API has not been used in project 649676222654 before or it is disabled. "
                            "Enable it by visiting https://console.developers.google.com/apis/api/"
                            "gmail.googleapis.com/overview?project=649676222654 then retry."
                        ),
                    }
                },
            )

    monkeypatch.setattr("app.services.gmail_importer.httpx.Client", FakeClient)

    with pytest.raises(GmailImportError) as exc_info:
        gmail_get_json("profile", "token")

    message = str(exc_info.value)
    assert message == (
        "Gmail access is approved, but Gmail API is not enabled for Google Cloud project 649676222654. "
        "Enable Gmail API in Google Cloud, then check Gmail access again."
    )
    assert "{" not in message
    assert "console.developers.google.com" not in message


def _case() -> CaseRecord:
    return CaseRecord(
        workspace_id="ws-1",
        title="Crowley v. USD 232 / JCPRD",
        intake=CaseIntake(
            district="USD 232",
            school="Mize Elementary",
            issue_categories=["student_safety", "records"],
            incident_date="2026-04-03",
            narrative="My six year old son Liam was attacked by an older child during JCPRD aftercare.",
        ),
    )


def test_gmail_relevance_scoring_prioritizes_case_messages_over_school_noise():
    relevant = score_gmail_message_relevance(
        {
            "from": "Principal <principal@usd232.org>",
            "to": "parent@example.com",
            "subject": "Incident follow-up for Liam",
            "snippet": "We reviewed the aftercare supervision issue from April 3.",
        },
        _case(),
    )
    noise = score_gmail_message_relevance(
        {
            "from": "Mize Elementary <noreply@usd232.org>",
            "to": "parent@example.com",
            "subject": "Weekly newsletter and lunch menu",
            "snippet": "Upcoming spirit day, PTO reminders, lunch menu, and school store news.",
        },
        _case(),
    )

    assert relevant["case_relevance_label"] == "likely_relevant"
    assert relevant["case_relevance_score"] >= 0.7
    assert "case terms" in relevant["case_relevance_reason"]
    assert noise["case_relevance_label"] == "review_first"
    assert noise["case_relevance_score"] < 0.5
