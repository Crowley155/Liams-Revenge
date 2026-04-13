import logging
import os

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db, migrate_json_to_sqlite
from app.api import research, profiles, entities, enrichment, kora, documents

logger = logging.getLogger(__name__)

init_db()
migrate_json_to_sqlite()

app = FastAPI(
    title="USDWatch Research Pipeline",
    version="0.1.0",
    description="Agentic research pipeline for public accountability",
)

_langfuse_client = None


def _init_langfuse_tracing():
    """Initialize Langfuse + DSPy instrumentation once at startup."""
    global _langfuse_client

    if not settings.has_langfuse:
        logger.warning("Langfuse keys not found — tracing disabled")
        return

    # Step 1: init the SDK (registers the OTEL TracerProvider globally)
    try:
        from langfuse import get_client
        _langfuse_client = get_client()
        logger.warning("Langfuse SDK initialized (pk=%s…, host=%s)",
                        settings.langfuse_public_key[:12], settings.langfuse_host)
    except Exception as e:
        logger.warning("Langfuse get_client() failed — tracing disabled: %s", e)
        return

    # Step 2: auth check (diagnostic only — never block instrumentation)
    try:
        if _langfuse_client.auth_check():
            logger.warning("Langfuse auth check OK")
        else:
            logger.warning("Langfuse auth check returned False — check keys/host")
    except Exception as e:
        logger.warning("Langfuse auth check threw (credentials may be wrong): %s", e)

    # Step 3: instrument DSPy (always attempt, even if auth is questionable)
    try:
        from openinference.instrumentation.dspy import DSPyInstrumentor
        DSPyInstrumentor().instrument()
        logger.warning("DSPy OpenInference instrumentation enabled")
    except Exception as e:
        logger.warning("DSPyInstrumentor unavailable: %s", e)


_init_langfuse_tracing()


@app.on_event("shutdown")
async def _shutdown_flush_langfuse():
    if _langfuse_client:
        logger.info("Flushing Langfuse traces before shutdown…")
        _langfuse_client.flush()

_cors_origins = os.getenv("CORS_ORIGINS", "")
allowed_origins = [o.strip() for o in _cors_origins.split(",") if o.strip()] if _cors_origins else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials="*" not in allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(research.router, prefix="/api")
app.include_router(profiles.router, prefix="/api")
app.include_router(entities.router, prefix="/api")
app.include_router(enrichment.router, prefix="/api")
app.include_router(kora.router, prefix="/api")
app.include_router(documents.router, prefix="/api")


@app.get("/health")
async def health():
    from app.services.redis_client import is_available as redis_ok
    return {
        "status": "ok",
        "model": settings.pipeline_model,
        "search_api": settings.has_search_api,
        "langfuse": settings.has_langfuse,
        "redis": redis_ok(),
        "clay": settings.has_clay,
        "pdl": settings.has_pdl,
        "qdrant": settings.has_qdrant,
        "db": "sqlite",
    }


def _ingest_evidence_to_qdrant():
    """Load case-data.json evidence into Qdrant at startup (idempotent)."""
    import json
    from pathlib import Path

    case_path = Path("/app/case-data/case-data.json")
    if not case_path.exists():
        logger.info("case-data.json not found at %s — skipping evidence ingestion", case_path)
        return

    try:
        data = json.loads(case_path.read_text())
        evidence = data.get("evidence", [])
        actors = data.get("actors", [])
        if not evidence:
            logger.info("No evidence docs in case-data.json — nothing to ingest")
            return

        from app.services.qdrant_client import ingest_evidence
        result = ingest_evidence(evidence, actors)
        logger.info(
            "Evidence ingestion complete: %d ingested, %d skipped",
            result.get("ingested", 0),
            result.get("skipped", 0),
        )
    except Exception as e:
        logger.warning("Evidence ingestion failed (non-fatal): %s", e)


@app.on_event("startup")
async def startup_ingest():
    """Run seed + evidence ingestion on app startup."""
    from app.scripts.seed_actors import seed
    seed()
    _ingest_evidence_to_qdrant()


@app.post("/api/seed")
async def seed_actors():
    """One-shot: import case-data.json actors into the backend store."""
    from app.scripts.seed_actors import seed
    seed()
    _ingest_evidence_to_qdrant()
    from app.api._store import profiles as p, entities as e
    return {"profiles": len(p), "entities": len(e)}
