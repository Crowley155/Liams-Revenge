"""
Application data store — SQLite-backed with dict-like interface.

Drop-in replacement for the old JSON file store. Same API:
  profiles[id] = person
  profiles.get(id)
  list(profiles.values())
  etc.
"""
from app.models import (
    AgentRun,
    CaseIntakeSession,
    CaseEvaluation,
    CaseRecord,
    CaseShareGrant,
    GmailConnection,
    GmailImportRun,
    KoraRequest,
    CaseDocument,
    Entity,
    Person,
    ResearchJob,
    UsageEvent,
    Workspace,
)
from app.db import _SqliteStore

profiles = _SqliteStore(
    "persons",
    Person,
    indexed_cols={
        "workspace_id": "workspace_id",
        "case_id": "case_id",
        "name": "name",
        "organization": "organization",
        "state": "state",
        "city": "city",
    },
)

jobs = _SqliteStore(
    "jobs",
    ResearchJob,
    indexed_cols={"workspace_id": "workspace_id", "case_id": "case_id", "person_id": "person_id", "status": "status"},
)

entities = _SqliteStore(
    "entities",
    Entity,
    indexed_cols={"workspace_id": "workspace_id", "case_id": "case_id", "name": "name", "type": "type"},
)

kora_requests = _SqliteStore(
    "kora_requests",
    KoraRequest,
    indexed_cols={
        "workspace_id": "workspace_id",
        "case_id": "case_id",
        "status": "status",
        "record_category": "record_category",
    },
)

case_documents = _SqliteStore(
    "case_documents",
    CaseDocument,
    indexed_cols={"workspace_id": "workspace_id", "case_id": "case_id", "filename": "filename", "status": "status"},
)

workspaces = _SqliteStore(
    "workspaces",
    Workspace,
    indexed_cols={"clerk_org_id": "clerk_org_id", "owner_user_id": "owner_user_id", "type": "type", "plan": "plan"},
)

cases = _SqliteStore(
    "cases",
    CaseRecord,
    indexed_cols={"workspace_id": "workspace_id", "status": "status", "title": "title"},
)

case_evaluations = _SqliteStore(
    "case_evaluations",
    CaseEvaluation,
    indexed_cols={"workspace_id": "workspace_id", "case_id": "case_id", "status": "status"},
)

case_share_grants = _SqliteStore(
    "case_share_grants",
    CaseShareGrant,
    indexed_cols={
        "workspace_id": "workspace_id",
        "case_id": "case_id",
        "user_id": "user_id",
        "clerk_user_id": "clerk_user_id",
        "email": "email",
        "role": "role",
        "status": "status",
    },
)

case_intake_sessions = _SqliteStore(
    "case_intake_sessions",
    CaseIntakeSession,
    indexed_cols={"workspace_id": "workspace_id", "status": "status"},
)

agent_runs = _SqliteStore(
    "agent_runs",
    AgentRun,
    indexed_cols={
        "workspace_id": "workspace_id",
        "case_id": "case_id",
        "evaluation_id": "evaluation_id",
        "agent_id": "agent_id",
        "status": "status",
    },
)

usage_events = _SqliteStore(
    "usage_events",
    UsageEvent,
    indexed_cols={"workspace_id": "workspace_id", "case_id": "case_id", "event_type": "event_type", "quantity": "quantity"},
)

gmail_connections = _SqliteStore(
    "gmail_connections",
    GmailConnection,
    indexed_cols={"workspace_id": "workspace_id", "case_id": "case_id", "status": "status"},
)

gmail_import_runs = _SqliteStore(
    "gmail_import_runs",
    GmailImportRun,
    indexed_cols={"workspace_id": "workspace_id", "case_id": "case_id", "status": "status"},
)
