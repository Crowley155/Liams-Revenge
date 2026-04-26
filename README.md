# USDWatch

Evidence-backed public accountability for families navigating institutional failure in public school systems.

USDWatch combines public advocacy with a private case intelligence layer: Clerk-authenticated workspaces, free case evaluation, document intake, records-request recommendations, and an Agno-backed evaluation workflow. The goal is reform, not punishment. The base product promise is a free case evaluation, with organization plans funding heavier infrastructure.

Live at [usdwatch.com](https://usdwatch.com)

## Architecture

- **Frontend:** Astro static site in `app/`, deployed to Cloudflare Pages. React islands keep the existing case workspace and evaluation UI working during the migration.
- **Auth:** Clerk session JWTs from the frontend, verified by FastAPI through Clerk JWKS.
- **Backend:** FastAPI with SQLite WAL persistence, tenant-scoped cases/documents/jobs/evaluations, and protected admin/demo data.
- **Agent runtime:** Agno workflow with DeepInfra model routing. Defaults use NVIDIA Nemotron Nano for extraction, Nemotron 3 Nano for reasoning, Nemotron 3 Super for premium review, and Llama 3.3 70B as fallback.
- **Storage:** SQLite for app records, Qdrant for vector evidence, Redis for optional caching.

## Deployment

- **Frontend:** Cloudflare Pages
  - Root directory: `app`
  - Build command: `npm run build`
  - Build output directory: `dist`
  - Required env: `PUBLIC_API_URL`, `PUBLIC_CLERK_PUBLISHABLE_KEY`
  - Public trust pages: `/trust` and `/privacy`
  - `trust.usdwatch.com` should use a Cloudflare Redirect Rule to point to `/trust`, or a dedicated Pages project if you want it fully separate.
- **Backend:** Railway or another long-running API host
  - Dockerfile: `Dockerfile.prod`
  - Required env: `CLERK_ISSUER` or `CLERK_JWKS_URL`
  - Recommended env: `DEEPINFRA_API_KEY`, `USDWATCH_ADMIN_EMAILS`, search/vector/cache keys as needed

Cloudflare Pages hosts the Astro frontend only. The FastAPI/Agno backend still needs a server runtime.

## Local Development

### Backend

```bash
cd backend
cp .env.example .env
pip install -e .[dev]
uvicorn app.main:app --reload
```

For local dev without Clerk, set `ALLOW_DEV_AUTH=true` and use a bearer token like `dev:parent@example.com`.

### Frontend

```bash
cd app
cp .env.example .env
npm install
npm run dev
```

For a Cloudflare-style production build:

```bash
cd app
PUBLIC_API_URL=https://your-backend.example.com npm run build
```

## Environment Variables

| Variable | Scope | Notes |
| --- | --- | --- |
| `CLERK_ISSUER` | Backend | Clerk issuer URL used to derive JWKS |
| `CLERK_JWKS_URL` | Backend | Optional JWKS override |
| `USDWATCH_ADMIN_EMAILS` | Backend | Comma-separated admin emails for demo/admin case access |
| `ALLOW_DEV_AUTH` | Backend | Enables `Authorization: Bearer dev:user@example.com` locally |
| `DEEPINFRA_API_KEY` | Backend | Enables Agno + DeepInfra model calls |
| `DEEPINFRA_EXTRACTION_MODEL` | Backend | Defaults to `nvidia/NVIDIA-Nemotron-Nano-9B-v2` |
| `DEEPINFRA_REASONING_MODEL` | Backend | Defaults to `nvidia/Nemotron-3-Nano-30B-A3B` |
| `DEEPINFRA_PREMIUM_MODEL` | Backend | Defaults to `nvidia/NVIDIA-Nemotron-3-Super-120B-A12B` |
| `DEEPINFRA_FALLBACK_MODEL` | Backend | Defaults to `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| `ENABLE_AGENT_OS` | Backend | Disabled by default; protected admin status endpoint only |
| `SERPAPI_KEY` | Backend | Optional search pipeline input |
| `QDRANT_URL` / `QDRANT_API_KEY` | Backend | Optional vector storage |
| `REDIS_URL` | Backend | Optional cache |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Backend | Optional tracing |
| `PUBLIC_API_URL` | Frontend | Public FastAPI URL |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | Frontend | Clerk publishable key |
| `PUBLIC_CLERK_JWT_TEMPLATE` | Frontend | Optional Clerk JWT template name |
| `PUBLIC_ALLOW_DEV_AUTH` | Frontend | Enables local dev sign-in fallback |

## Case Data

The existing Crowley v. USD 232 / JCPRD material is preserved as a seeded admin/demo case. New user-created cases are scoped to a personal workspace by default; Clerk organizations map to paid organization workspaces.

## License

This project is open source. The case data and deliverables represent one family's experience and are published for transparency and public accountability.
