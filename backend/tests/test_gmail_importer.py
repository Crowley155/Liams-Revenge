from app.models import CaseIntake, CaseRecord
from app.models import GmailImportRule
from app.services.gmail_importer import build_gmail_query, score_gmail_message_relevance


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
