import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db, migrate_json_to_sqlite
from app.api import research, profiles, entities, enrichment

logger = logging.getLogger(__name__)

init_db()
migrate_json_to_sqlite()

app = FastAPI(
    title="USDWatch Research Pipeline",
    version="0.1.0",
    description="Agentic research pipeline for public accountability",
)


def _init_langfuse_tracing():
    """Initialize Langfuse + DSPy instrumentation once at startup."""
    if not settings.has_langfuse:
        logger.info("Langfuse not configured — tracing disabled")
        return

    try:
        from langfuse import get_client
        langfuse = get_client()
        if langfuse.auth_check():
            logger.info("Langfuse client authenticated")
        else:
            logger.warning("Langfuse auth check failed — traces may not appear")

        from openinference.instrumentation.dspy import DSPyInstrumentor
        DSPyInstrumentor().instrument()
        logger.info("DSPy OpenInference instrumentation enabled")
    except Exception as e:
        logger.warning("Langfuse/OpenInference init failed (non-fatal): %s", e)


_init_langfuse_tracing()

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


@app.post("/api/seed")
async def seed_actors():
    """One-shot: import case-data.json actors into the backend store."""
    from app.scripts.seed_actors import seed
    seed()
    from app.api._store import profiles as p, entities as e
    return {"profiles": len(p), "entities": len(e)}
