"""
JSON file-backed store. Survives container restarts via volume mount.

Same dict-like interface as the old in-memory store so the API layer
doesn't change. When we outgrow this, swap for Supabase/Postgres queries.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from threading import Lock

from app.models import ResearchJob, Person, Entity

logger = logging.getLogger(__name__)

DATA_DIR = Path("/app/data")
PROFILES_FILE = DATA_DIR / "profiles.json"
JOBS_FILE = DATA_DIR / "jobs.json"
ENTITIES_FILE = DATA_DIR / "entities.json"

_lock = Lock()


def _ensure_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_profiles() -> dict[str, Person]:
    if not PROFILES_FILE.exists():
        return {}
    try:
        raw = json.loads(PROFILES_FILE.read_text())
        return {k: Person(**v) for k, v in raw.items()}
    except Exception as e:
        logger.warning("Failed to load profiles: %s", e)
        return {}


def _save_profiles(data: dict[str, Person]):
    _ensure_dir()
    PROFILES_FILE.write_text(
        json.dumps({k: v.model_dump(mode="json") for k, v in data.items()}, indent=2, default=str)
    )


def _load_jobs() -> dict[str, ResearchJob]:
    if not JOBS_FILE.exists():
        return {}
    try:
        raw = json.loads(JOBS_FILE.read_text())
        return {k: ResearchJob(**v) for k, v in raw.items()}
    except Exception as e:
        logger.warning("Failed to load jobs: %s", e)
        return {}


def _save_jobs(data: dict[str, ResearchJob]):
    _ensure_dir()
    JOBS_FILE.write_text(
        json.dumps({k: v.model_dump(mode="json") for k, v in data.items()}, indent=2, default=str)
    )


class _PersistentDict:
    """Dict-like wrapper that auto-persists on writes."""

    def __init__(self, loader, saver):
        self._loader = loader
        self._saver = saver
        self._cache: dict | None = None

    def _data(self) -> dict:
        if self._cache is None:
            self._cache = self._loader()
        return self._cache

    def __getitem__(self, key):
        return self._data()[key]

    def __setitem__(self, key, value):
        with _lock:
            d = self._data()
            d[key] = value
            self._saver(d)

    def __contains__(self, key):
        return key in self._data()

    def get(self, key, default=None):
        return self._data().get(key, default)

    def values(self):
        return self._data().values()

    def keys(self):
        return self._data().keys()

    def items(self):
        return self._data().items()

    def pop(self, key, *args):
        with _lock:
            d = self._data()
            result = d.pop(key, *args)
            self._saver(d)
            return result

    def __len__(self):
        return len(self._data())


def _load_entities() -> dict[str, Entity]:
    if not ENTITIES_FILE.exists():
        return {}
    try:
        raw = json.loads(ENTITIES_FILE.read_text())
        return {k: Entity(**v) for k, v in raw.items()}
    except Exception as e:
        logger.warning("Failed to load entities: %s", e)
        return {}


def _save_entities(data: dict[str, Entity]):
    _ensure_dir()
    ENTITIES_FILE.write_text(
        json.dumps({k: v.model_dump(mode="json") for k, v in data.items()}, indent=2, default=str)
    )


jobs = _PersistentDict(_load_jobs, _save_jobs)
profiles = _PersistentDict(_load_profiles, _save_profiles)
entities = _PersistentDict(_load_entities, _save_entities)
