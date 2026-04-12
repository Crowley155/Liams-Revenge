"""
Application data store — SQLite-backed with dict-like interface.

Drop-in replacement for the old JSON file store. Same API:
  profiles[id] = person
  profiles.get(id)
  list(profiles.values())
  etc.
"""
from app.models import ResearchJob, Person, Entity
from app.db import _SqliteStore

profiles = _SqliteStore(
    "persons",
    Person,
    indexed_cols={"name": "name", "organization": "organization", "state": "state", "city": "city"},
)

jobs = _SqliteStore(
    "jobs",
    ResearchJob,
    indexed_cols={"person_id": "person_id", "status": "status"},
)

entities = _SqliteStore(
    "entities",
    Entity,
    indexed_cols={"name": "name", "type": "type"},
)
