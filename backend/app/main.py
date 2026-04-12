import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import research, profiles, entities

app = FastAPI(
    title="USDWatch Research Pipeline",
    version="0.1.0",
    description="Agentic research pipeline for public accountability",
)

_cors_origins = os.getenv("CORS_ORIGINS", "")
allowed_origins = [o.strip() for o in _cors_origins.split(",") if o.strip()] if _cors_origins else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(research.router, prefix="/api")
app.include_router(profiles.router, prefix="/api")
app.include_router(entities.router, prefix="/api")


@app.on_event("startup")
async def _auto_seed():
    """Seed case-data actors on startup if the store is empty."""
    from app.api._store import profiles as p
    if len(p) == 0:
        import logging
        logging.getLogger(__name__).info("Empty store detected — auto-seeding case data")
        from app.scripts.seed_actors import seed
        seed()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": settings.pipeline_model,
        "search_api": settings.has_search_api,
        "langfuse": settings.has_langfuse,
    }


@app.post("/api/seed")
async def seed_actors():
    """One-shot: import case-data.json actors into the backend store."""
    from app.scripts.seed_actors import seed
    seed()
    from app.api._store import profiles as p, entities as e
    return {"profiles": len(p), "entities": len(e)}
