# USDWatch

**Evidence-backed public accountability for families navigating institutional failure in public school systems.**

USDWatch combines public-facing advocacy — sourced narrative, policy reform proposals, non-compliance evidence — with a private case intelligence layer: agentic research pipelines, entity mapping, KORA letter generation, and document intake. The goal is reform, not punishment. The platform is designed to be replicable for other families facing similar situations.

Live at [usdwatch.com](https://usdwatch.com)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                     │
│  (Vite + React 19 + React Router + Tailwind v4)     │
│                                                      │
│  Public: Overview · Policy Reforms · What's Next     │
│  Auth'd: People · Entities · Evidence · KORA · etc.  │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────┐
│                   FastAPI Backend                     │
│  (Python 3.12 · DSPy · LiteLLM · SQLite WAL)        │
│                                                      │
│  Pipelines:                                          │
│    Person Research (3-pass: collect → disambiguate    │
│      → synthesize)                                   │
│    Entity Research (5-phase: website → news →         │
│      social → oversight → records)                   │
│    Member Discovery (search + LLM extraction)        │
│    Identity Enrichment (PDL / SerpAPI / social)      │
│    KORA Letter Generation (case-data → LLM → draft)  │
│    Document Intake (parse → chunk → embed)           │
│                                                      │
│  Storage:                                            │
│    SQLite (profiles, entities, jobs, KORA, docs)     │
│    Qdrant (vector search, dedup, evidence)           │
│    Redis (optional, SerpAPI cache)                   │
└─────────────────────────────────────────────────────┘
```

## Deployment

- **Frontend:** GitHub Pages (auto-deploys on push to `main`)
- **Backend:** Railway (Docker, `Dockerfile.prod`, auto-deploys on push)
- **Qdrant:** Railway (Docker, persistent volume)
- **Redis:** Railway (optional)

## Local Development

### Backend

```bash
cd backend
cp .env.example .env
# Fill in API keys (at minimum: an LLM provider key + JWT_SECRET + ADMIN_EMAIL/PASSWORD)
pip install -e .
uvicorn app.main:app --reload
```

### Frontend

```bash
cd app
npm install
# For local dev against localhost backend:
npm run dev
# For production build:
VITE_API_URL=https://your-backend.railway.app npm run build
```

### Required Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `JWT_SECRET` | Yes | Signs auth tokens |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Yes | Seeded on startup |
| LLM provider key (e.g. `OPENAI_API_KEY`) | Yes | Used via LiteLLM |
| `SERPAPI_KEY` | Recommended | Powers web search in pipelines |
| `QDRANT_URL` | Recommended | Vector storage for documents |
| `REDIS_URL` | Optional | SerpAPI result caching |
| `PDL_API_KEY` | Optional | People Data Labs enrichment |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Optional | LLM observability |

## Case Data

The platform is anchored to `data/case-data.json`, which contains actors (people involved in the case), evidence documents, and case metadata. This file is copied into the Docker image at build time and ingested on startup.

## License

This project is open source. The case data and deliverables represent one family's experience and are published for transparency and public accountability.
