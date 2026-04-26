"""
SQLite database layer.

Uses stdlib sqlite3 — zero extra dependencies.  WAL mode gives concurrent
reads while the research pipeline writes in the background.  Data lives at
/app/data/usdwatch.db (same Railway volume mount as the old JSON files).
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
from pathlib import Path
from threading import Lock

logger = logging.getLogger(__name__)

DB_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
DB_PATH = DB_DIR / "usdwatch.db"

_write_lock = Lock()


def _ensure_column(conn: sqlite3.Connection, table: str, name: str, definition: str) -> None:
    """Add a column when upgrading an existing SQLite file in-place."""
    cols = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if name not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def _connect() -> sqlite3.Connection:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=15)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they don't exist. Safe to call on every startup."""
    conn = _connect()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS persons (
            id   TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'demo',
            case_id TEXT NOT NULL DEFAULT 'crowley-v-usd232',
            name TEXT NOT NULL,
            organization TEXT NOT NULL DEFAULT '',
            state TEXT NOT NULL DEFAULT 'KS',
            city  TEXT NOT NULL DEFAULT '',
            data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_persons_name ON persons(name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_persons_org  ON persons(organization COLLATE NOCASE);

        CREATE TABLE IF NOT EXISTS entities (
            id   TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'demo',
            case_id TEXT NOT NULL DEFAULT 'crowley-v-usd232',
            name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'district',
            data TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS jobs (
            id        TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'demo',
            case_id   TEXT NOT NULL DEFAULT 'crowley-v-usd232',
            person_id TEXT,
            status    TEXT NOT NULL DEFAULT 'pending',
            data      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_person ON jobs(person_id);
        CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

        CREATE TABLE IF NOT EXISTS kora_requests (
            id        TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'demo',
            case_id   TEXT NOT NULL DEFAULT 'crowley-v-usd232',
            status    TEXT NOT NULL DEFAULT 'draft',
            record_category TEXT NOT NULL DEFAULT '',
            data      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_kora_case ON kora_requests(case_id);
        CREATE INDEX IF NOT EXISTS idx_kora_status ON kora_requests(status);

        CREATE TABLE IF NOT EXISTS case_documents (
            id        TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'demo',
            case_id   TEXT NOT NULL DEFAULT 'crowley-v-usd232',
            filename  TEXT NOT NULL DEFAULT '',
            status    TEXT NOT NULL DEFAULT 'processing',
            data      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_docs_case ON case_documents(case_id);
        CREATE INDEX IF NOT EXISTS idx_docs_status ON case_documents(status);

        CREATE TABLE IF NOT EXISTS users (
            id         TEXT PRIMARY KEY,
            email      TEXT NOT NULL UNIQUE,
            password   TEXT NOT NULL,
            role       TEXT NOT NULL DEFAULT 'admin',
            clerk_user_id TEXT,
            workspace_id TEXT NOT NULL DEFAULT '',
            data       TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            clerk_org_id TEXT NOT NULL DEFAULT '',
            owner_user_id TEXT NOT NULL DEFAULT '',
            type TEXT NOT NULL DEFAULT 'personal',
            plan TEXT NOT NULL DEFAULT 'free',
            data TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_clerk_org ON workspaces(clerk_org_id) WHERE clerk_org_id != '';

        CREATE TABLE IF NOT EXISTS cases (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            title TEXT NOT NULL DEFAULT '',
            data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cases_workspace ON cases(workspace_id);

        CREATE TABLE IF NOT EXISTS case_evaluations (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            case_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_evals_case ON case_evaluations(workspace_id, case_id);

        CREATE TABLE IF NOT EXISTS agent_runs (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            case_id TEXT NOT NULL,
            evaluation_id TEXT NOT NULL,
            agent_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'queued',
            data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_agent_runs_eval ON agent_runs(evaluation_id);

        CREATE TABLE IF NOT EXISTS usage_events (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            case_id TEXT NOT NULL DEFAULT '',
            event_type TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_usage_workspace ON usage_events(workspace_id, event_type);
    """)

    for table in ("persons", "entities", "jobs"):
        _ensure_column(conn, table, "workspace_id", "TEXT NOT NULL DEFAULT 'demo'")
        _ensure_column(conn, table, "case_id", "TEXT NOT NULL DEFAULT 'crowley-v-usd232'")
    for table in ("kora_requests", "case_documents"):
        _ensure_column(conn, table, "workspace_id", "TEXT NOT NULL DEFAULT 'demo'")
    for name, definition in (
        ("clerk_user_id", "TEXT"),
        ("workspace_id", "TEXT NOT NULL DEFAULT ''"),
        ("data", "TEXT NOT NULL DEFAULT '{}'"),
    ):
        _ensure_column(conn, "users", name, definition)

    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_persons_workspace ON persons(workspace_id, case_id);
        CREATE INDEX IF NOT EXISTS idx_entities_workspace ON entities(workspace_id, case_id);
        CREATE INDEX IF NOT EXISTS idx_jobs_workspace ON jobs(workspace_id, case_id);
        CREATE INDEX IF NOT EXISTS idx_kora_workspace ON kora_requests(workspace_id, case_id);
        CREATE INDEX IF NOT EXISTS idx_docs_workspace ON case_documents(workspace_id, case_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user ON users(clerk_user_id) WHERE clerk_user_id IS NOT NULL AND clerk_user_id != '';
    """)
    conn.commit()
    conn.close()
    logger.info("SQLite database ready at %s", DB_PATH)


# ---------------------------------------------------------------------------
# Migration: JSON files → SQLite (one-shot, idempotent)
# ---------------------------------------------------------------------------

_OLD_PROFILES = DB_DIR / "profiles.json"
_OLD_JOBS     = DB_DIR / "jobs.json"
_OLD_ENTITIES = DB_DIR / "entities.json"


def migrate_json_to_sqlite():
    """If old JSON files exist and the db is empty, import them."""
    conn = _connect()
    try:
        row = conn.execute("SELECT count(*) c FROM persons").fetchone()
        if row["c"] > 0:
            return

        imported = 0
        for path, table, id_field in [
            (_OLD_PROFILES, "persons", "id"),
            (_OLD_ENTITIES, "entities", "id"),
            (_OLD_JOBS, "jobs", "id"),
        ]:
            if not path.exists():
                continue
            try:
                raw = json.loads(path.read_text())
            except Exception:
                continue

            for key, obj in raw.items():
                data = json.dumps(obj, default=str)
                if table == "persons":
                    conn.execute(
                        "INSERT OR IGNORE INTO persons (id, name, organization, state, city, data) VALUES (?,?,?,?,?,?)",
                        (key, obj.get("name", ""), obj.get("organization", ""), obj.get("state", "KS"), obj.get("city", ""), data),
                    )
                elif table == "entities":
                    conn.execute(
                        "INSERT OR IGNORE INTO entities (id, name, type, data) VALUES (?,?,?,?)",
                        (key, obj.get("name", ""), obj.get("type", "district"), data),
                    )
                elif table == "jobs":
                    conn.execute(
                        "INSERT OR IGNORE INTO jobs (id, person_id, status, data) VALUES (?,?,?,?)",
                        (key, obj.get("person_id", ""), obj.get("status", "pending"), data),
                    )
                imported += 1

        conn.commit()
        if imported:
            logger.info("Migrated %d records from JSON files to SQLite", imported)
            for p in [_OLD_PROFILES, _OLD_ENTITIES, _OLD_JOBS]:
                if p.exists():
                    backup = p.with_suffix(".json.bak")
                    p.rename(backup)
                    logger.info("  Backed up %s → %s", p.name, backup.name)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Dict-like store backed by SQLite
# ---------------------------------------------------------------------------

class _SqliteStore:
    """Drop-in replacement for _PersistentDict — same dict interface, SQLite backend."""

    def __init__(self, table: str, model_class, indexed_cols: dict[str, str] | None = None):
        self._table = table
        self._model = model_class
        self._indexed_cols = indexed_cols or {}

    def _get_row(self, key: str) -> dict | None:
        conn = _connect()
        try:
            row = conn.execute(f"SELECT data FROM {self._table} WHERE id = ?", (key,)).fetchone()
            return json.loads(row["data"]) if row else None
        finally:
            conn.close()

    def get(self, key, default=None):
        raw = self._get_row(key)
        if raw is None:
            return default
        return self._model(**raw)

    def __getitem__(self, key):
        raw = self._get_row(key)
        if raw is None:
            raise KeyError(key)
        return self._model(**raw)

    def __setitem__(self, key, value):
        data = json.dumps(value.model_dump(mode="json"), default=str)
        cols = {"id": key, "data": data}
        for attr, col in self._indexed_cols.items():
            cols[col] = getattr(value, attr, "")

        placeholders = ", ".join(["?"] * len(cols))
        col_names = ", ".join(cols.keys())
        updates = ", ".join(f"{c}=excluded.{c}" for c in cols if c != "id")

        with _write_lock:
            conn = _connect()
            try:
                conn.execute(
                    f"INSERT INTO {self._table} ({col_names}) VALUES ({placeholders}) "
                    f"ON CONFLICT(id) DO UPDATE SET {updates}",
                    tuple(cols.values()),
                )
                conn.commit()
            finally:
                conn.close()

    def __contains__(self, key):
        conn = _connect()
        try:
            row = conn.execute(f"SELECT 1 FROM {self._table} WHERE id = ?", (key,)).fetchone()
            return row is not None
        finally:
            conn.close()

    def values(self):
        conn = _connect()
        try:
            rows = conn.execute(f"SELECT data FROM {self._table}").fetchall()
            return [self._model(**json.loads(r["data"])) for r in rows]
        finally:
            conn.close()

    def keys(self):
        conn = _connect()
        try:
            rows = conn.execute(f"SELECT id FROM {self._table}").fetchall()
            return [r["id"] for r in rows]
        finally:
            conn.close()

    def items(self):
        conn = _connect()
        try:
            rows = conn.execute(f"SELECT id, data FROM {self._table}").fetchall()
            return [(r["id"], self._model(**json.loads(r["data"]))) for r in rows]
        finally:
            conn.close()

    def pop(self, key, *args):
        with _write_lock:
            conn = _connect()
            try:
                row = conn.execute(f"SELECT data FROM {self._table} WHERE id = ?", (key,)).fetchone()
                if row is None:
                    if args:
                        return args[0]
                    raise KeyError(key)
                obj = self._model(**json.loads(row["data"]))
                conn.execute(f"DELETE FROM {self._table} WHERE id = ?", (key,))
                conn.commit()
                return obj
            finally:
                conn.close()

    def __len__(self):
        conn = _connect()
        try:
            row = conn.execute(f"SELECT count(*) c FROM {self._table}").fetchone()
            return row["c"]
        finally:
            conn.close()

    def find_by(self, **kwargs) -> list:
        """Query indexed columns.  e.g. store.find_by(name='Will Crowley')"""
        conn = _connect()
        try:
            clauses = []
            vals = []
            for col, val in kwargs.items():
                clauses.append(f"{col} = ? COLLATE NOCASE")
                vals.append(val)
            where = " AND ".join(clauses)
            rows = conn.execute(f"SELECT data FROM {self._table} WHERE {where}", vals).fetchall()
            return [self._model(**json.loads(r["data"])) for r in rows]
        finally:
            conn.close()
