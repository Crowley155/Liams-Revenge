# USDWatch QA Log

This log tracks production-first QA findings for USDWatch. It covers bugs, user experience issues, security/privacy concerns, stale product language, performance risks, and cleanup items. Production behavior is the source of truth for what parents currently see; local dev-auth QA is used to test private parent workflows without touching real production case data.

## QA Status

- Frontend lint: passed with `npm run lint`.
- Frontend build: passed with `npm run build`.
- Backend tests: passed with `py -3 -m pytest backend/tests`.
- Production public HTTP checks: passed for `https://usdwatch.com/`, `/trust/`, `/ai-disclosure/`, `/privacy/`, `/whats-next/`, and `/sitemap.xml`.
- Railway health check: passed for `https://liams-revenge-production.up.railway.app/health`.
- In-app browser visual QA: blocked during this pass because the browser runtime failed to start locally.
- Railway deployment log QA: passed after re-checking the authenticated CLI session.
- Fix pass verification: `npm run lint`, `npm run build`, and `py -3 -m pytest backend/tests` passed after the P1/P2/P3 code fixes below.

## Priority Scale

- `P0`: Security/privacy/data loss risk or production unavailable.
- `P1`: Core parent workflow broken, misleading, or unsafe.
- `P2`: UX friction, performance, accessibility, maintainability, or stale product behavior.
- `P3`: Cleanup, stale code, copy drift, or low-risk polish.

## Findings

### QA-001 - Case Read Has No Visible Lifecycle

- Priority: `P1`
- Area: Case Plan / Evaluation Runtime
- Environment: Local code, production-facing behavior likely
- Finding: Case Read starts from the Case Plan, but the UI stores only the initial response and does not poll or clearly show queued, running, failed, or completed state.
- Evidence: [CaseDetail.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/CaseDetail.jsx:116) calls `startCaseEvaluation(caseId)` and immediately sets `evaluation` to the returned object. The backend queues the evaluation in [cases.py](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/backend/app/api/cases.py:713) with a background task.
- User Impact: A parent can click `Run Case Read`, see the button change or no meaningful result, and believe the app is broken or that the evaluation produced no answer.
- Recommended Fix: Add a Case Read status component that polls the latest evaluation until `complete` or `failed`, explains what is happening, disables duplicate refreshes while queued/running, and refreshes packet/checklist data after completion.
- Acceptance Criteria: Starting a Case Read shows queued/running feedback within one second, updates automatically to complete/failed, shows errors plainly, and refreshes the Case Plan/Packet data without a manual page reload.
- Status: Fixed - Case Plan now polls queued/running Case Reads, disables duplicate starts, shows status details, and refreshes case artifacts after completion.

### QA-002 - Parent People Tab Can Trigger Demo Seed Import

- Priority: `P1`
- Area: Parent Case UX / Admin Boundary
- Environment: Local code, production-facing behavior likely
- Finding: The parent-facing People tab can show an `Import Case Data` button when no people exist, and `/api/seed` only requires authentication rather than admin/demo authorization.
- Evidence: [People.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/People.jsx:227) renders the import button when `people.length === 0`. [main.py](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/backend/app/main.py:157) exposes `/api/seed` to any authenticated user.
- User Impact: A parent could accidentally import the Crowley/demo actor set into the wrong workspace or see admin/demo language in a private family case.
- Recommended Fix: Hide seed/import controls for non-demo cases and require admin/demo authorization server-side for `/api/seed`.
- Acceptance Criteria: Normal parent cases never show `Import Case Data`; `/api/seed` returns `403` for non-admin users; demo/admin cases still support intentional seed workflows.
- Status: Fixed - parent cases hide the demo import button, and `/api/seed` now returns `403` unless the authenticated user role is `admin`.

### QA-003 - Gmail Success Messages Render As Warning/Error Banners

- Priority: `P1`
- Area: Evidence Locker / Gmail Import
- Environment: Local code, production-facing behavior likely
- Finding: Evidence Locker stores success and informational Gmail messages in the same `error` state used for warnings and failures.
- Evidence: [EvidenceLocker.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/EvidenceLocker.jsx:276), [EvidenceLocker.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/EvidenceLocker.jsx:308), [EvidenceLocker.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/EvidenceLocker.jsx:333), and [EvidenceLocker.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/EvidenceLocker.jsx:368) call `setError(...)` for successful actions. The banner renders with warning styling at [EvidenceLocker.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/EvidenceLocker.jsx:395).
- User Impact: Parents may think Gmail setup/import failed when it actually succeeded, which is especially damaging because email import already requires trust.
- Recommended Fix: Split message state into `notice`, `success`, `warning`, and `error`, with distinct styles and ARIA live regions.
- Acceptance Criteria: Successful Gmail rule save/search/import/sync/disconnect messages render as success or neutral notices, while actual failures render as error/warning states.
- Status: Fixed - Evidence Locker now separates success, info, warning, and error notices for Gmail and file actions.

### QA-004 - Public And Login Flows Still Depend On `/evaluate`

- Priority: `P1`
- Area: Product IA / Routing
- Environment: Production and local
- Finding: Several public and auth entry points still route to `/evaluate`, even though the product direction is Draft Case / Case Advocate first.
- Evidence: [index.astro](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/pages/index.astro:143), [trust.astro](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/pages/trust.astro:74), [ai-disclosure.astro](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/pages/ai-disclosure.astro:71), [whats-next.astro](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/pages/whats-next.astro:68), [PublicHome.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/PublicHome.jsx:30), [WhatsNext.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/WhatsNext.jsx:15), and [Login.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/Login.jsx:39).
- User Impact: Parents still pass through a legacy compatibility route. This works as a redirect today, but the product model feels unfinished and increases the chance of stale deployments or broken redirects.
- Recommended Fix: Keep `/evaluate` as a compatibility redirect, but change public CTAs and Clerk redirect targets to `/cases` or a dedicated `/start` route that opens/creates a draft case.
- Acceptance Criteria: No visible public copy or login redirect uses `/evaluate`; existing direct `/evaluate` URLs still open the current draft case and the Case Advocate.
- Status: Fixed - public CTAs and login redirects now point to `/login` or `/cases`; `/evaluate` remains only as a signed-in compatibility redirect.

### QA-005 - `llms.txt` Conflicts With Current Product Language

- Priority: `P2`
- Area: AEO / Public Copy
- Environment: Production and local
- Finding: `llms.txt` still describes USDWatch as a free case evaluation product with timelines and "share their story" language, which conflicts with the current Case Advocate / Draft Case framing.
- Evidence: [llms.txt](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/public/llms.txt:3), [llms.txt](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/public/llms.txt:7), [llms.txt](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/public/llms.txt:16), and [llms.txt](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/public/llms.txt:32).
- User Impact: Search/AI summaries may describe the product inaccurately, reviving the timeline/evaluation framing the app is moving away from.
- Recommended Fix: Rewrite `llms.txt` around Draft Case, Case Advocate, Evidence Locker, Records Requests, Case Read, and Self-Advocacy Packet without promising timeline as a parent-facing output.
- Acceptance Criteria: `llms.txt` contains no parent-facing "timeline" promise and uses the same product vocabulary as the public site and app navigation.
- Status: Fixed - `llms.txt` now uses Draft Case, Case Advocate, Evidence Locker, Case Read, and Self-Advocacy Packet language without a parent-facing Timeline promise.

### QA-006 - Dead Timeline View And Tracked Generated Docs Remain

- Priority: `P2`
- Area: Codebase Cleanup / Deployment Drift
- Environment: Local repo
- Finding: `Timeline.jsx` still exists even though the route redirects, and generated `docs/` output remains tracked alongside Cloudflare Pages output.
- Evidence: [Timeline.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/Timeline.jsx:27) exports the old view. `git ls-files docs` reports tracked generated files including `docs/CNAME`, old `_astro` bundles, and large image assets.
- User Impact: Stale generated assets increase repo weight and make it easier for GitHub Pages or old bundles to reappear as a production split-brain.
- Recommended Fix: Delete the unused Timeline view and remove tracked generated `docs/` output after confirming Cloudflare Pages is the only production path.
- Acceptance Criteria: `Timeline.jsx` is gone or quarantined outside the app import tree; `git ls-files docs` returns no generated site artifacts; Cloudflare Pages remains the canonical deploy target.
- Status: Fixed - unused `Timeline.jsx` and tracked generated `docs/` output were removed from the repo.

### QA-007 - Large PNG Assets Still Ship Alongside Optimized WebP

- Priority: `P2`
- Area: Performance / Public Assets
- Environment: Production and local
- Finding: Large PNG versions of hero and marketing assets remain in `app/public/images` and are reachable in production even when WebP versions exist.
- Evidence: Production HEAD checks showed `https://usdwatch.com/images/hero-briefing.png` at about 2.98 MB and `https://usdwatch.com/images/login-bg.png` at about 2.97 MB. Local asset listing shows PNG and WebP pairs under `app/public/images`.
- User Impact: Crawlers, social previews, or stale references may load multi-megabyte PNGs, slowing the public experience and increasing bandwidth.
- Recommended Fix: Use WebP/AVIF for active public images, update OG images to appropriately sized compressed assets, and remove unused PNGs once references are gone.
- Acceptance Criteria: Active public image references use compressed assets; no unused multi-megabyte PNGs remain in the deploy artifact; OG/social image is under a reasonable size target.
- Status: Fixed - active public image references now use WebP where available, and unused multi-megabyte PNG copies were removed from `app/public/images`.

### QA-008 - Evidence Upload Processing Is Synchronous On Case Upload Path

- Priority: `P2`
- Area: Evidence Locker / Performance
- Environment: Local code, production-facing behavior likely
- Finding: `/api/cases/{case_id}/documents` reads and processes the uploaded file before returning, unlike the legacy document upload endpoint that queues background processing.
- Evidence: [cases.py](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/backend/app/api/cases.py:664) defines the case upload path and returns `process_document_bytes(doc, content)` at [cases.py](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/backend/app/api/cases.py:702). [documents.py](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/backend/app/api/documents.py:114) uses a background task for the legacy upload path.
- User Impact: Large PDFs or image-heavy files can make the upload feel frozen or fail behind proxies/timeouts, undermining the 50 MB upload promise.
- Recommended Fix: Return an uploaded/processing document quickly and move parse/chunk/Qdrant indexing into a background task or job status flow.
- Acceptance Criteria: Large uploads return promptly with `processing_status=processing`; the locker updates later to indexed/needs_review/failed; failures are visible per document.
- Status: Fixed - case document uploads now save and return quickly, then parse/chunk/index in a background task with per-document failure details.

### QA-009 - Free Document Limits Are Not Surfaced Before Upload

- Priority: `P2`
- Area: Evidence Locker / Entitlements
- Environment: Local code, production-facing behavior likely
- Finding: Evidence Locker shows file limits by size but does not show the free plan document count limit before upload.
- Evidence: [EvidenceLocker.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/EvidenceLocker.jsx:402) mentions "Up to 50 MB each"; [entitlements.py](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/backend/app/services/entitlements.py:28) enforces `max_documents_per_case`.
- User Impact: Parents may spend time selecting files only to hit a 403 after upload starts, with no explanation in the primary UI.
- Recommended Fix: Fetch workspace entitlements or return them in case/document responses, show documents used vs allowed, and disable/import-gate when the free limit is reached.
- Acceptance Criteria: Evidence Locker displays document count limit, explains free-tier constraints before upload, and handles 403 entitlement errors with parent-friendly copy.
- Status: Fixed - Evidence Locker now displays current document usage against the workspace limit and blocks extra queue additions before upload.

### QA-010 - Browser Visual QA Is Still Missing

- Priority: `P2`
- Area: QA Coverage / Responsive UX
- Environment: Production and local
- Finding: Static and HTTP checks passed, but no current desktop/mobile browser screenshots were captured in this pass because the in-app browser runtime failed locally.
- Evidence: Attempted in-app browser setup failed with a local app-server path error. Public HTTP checks alone cannot validate layout, scroll behavior, modals, focus order, or mobile bottom-sheet behavior.
- User Impact: Visual regressions, overlapping text, broken mobile layouts, and inaccessible modals could remain undetected.
- Recommended Fix: Re-run visual QA with the in-app browser or Playwright once browser runtime is available, covering public pages and authenticated dev-auth parent flows.
- Acceptance Criteria: QA log includes screenshot-backed results for home, login, cases, Case Plan, Evidence Locker, Records Requests, People, Packet, Trust, Privacy, and AI Disclosure at desktop and mobile widths.
- Status: Blocked - browser visual QA still requires a working in-app browser runtime or a separate Playwright pass.

### QA-011 - Railway Deployment Log QA Was Blocked

- Priority: `P2`
- Area: Deployment QA
- Environment: Production backend
- Finding: Railway `/health` returns `200`; the earlier blocked status was stale after CLI auth was restored.
- Evidence: `railway whoami` returned `william.crowley@gmail.com`; `railway status` returned project `adorable-reprieve`, environment `production`, service `Liams-Revenge`; `railway deployment list --limit 10` showed latest deployment `157aef70-09e7-42a4-a715-2c9496024367` as `SUCCESS` at `2026-04-29 06:04:31 -05:00`; `/health` returned `{"status":"ok","model":"deepinfra/nvidia/NVIDIA-Nemotron-Nano-9B-v2","redis":true,"qdrant":true,"agent_runtime":"agno","agent_os":false}`.
- User Impact: A healthy `/health` response is good, but it does not prove there are no startup warnings, memory pressure issues, background task failures, or model/config errors in the latest deployment.
- Recommended Fix: Reauthenticate Railway CLI and capture latest deployment status/logs in a production QA pass.
- Acceptance Criteria: QA log records latest deployment ID/status, recent error/warning summary, memory status if available, and `/health` payload.
- Status: Fixed - Railway CLI is authenticated, latest deployment is `SUCCESS`, `/health` is healthy, and latest logs show startup/runtime health with no error-level records; one agent structured-output warning remains a product-quality follow-up, not a deployment failure.

### QA-012 - Some Admin/Demo Components Still Carry AI-Generated Visual Tells

- Priority: `P3`
- Area: Design Quality / Admin-Demo Surfaces
- Environment: Local code, demo-only routes
- Finding: Demo/admin surfaces still contain heavy card grids, glow effects, side-stripe borders, and older command-center styling that conflicts with the calmer parent-first design direction.
- Evidence: Static scans found examples such as side-stripe card accents in [Overview.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/Overview.jsx:103) and hover glow styling in [Entities.jsx](C:/Users/willi/Desktop/VStudio/Liams%20Revenge/app/src/views/Entities.jsx:28).
- User Impact: These routes are demo/admin-gated, so parent impact is limited, but they keep design debt in the bundle and can leak into future parent surfaces.
- Recommended Fix: Either keep these routes fully admin/demo-only and lazy-loaded, or restyle them later using the same calm case-desk system as parent pages.
- Acceptance Criteria: Parent routes contain no command-center visual clutter; demo/admin routes are clearly separated and only loaded when needed.
- Status: Fixed - demo/admin routes remain lazy-loaded and gated, and the cited glow effects, side-stripe cards, pulse CTA, and heavy shadow treatments were removed or calmed.

## Planned QA Passes

### Production Public Pass

- Verify home, Trust, Privacy, AI Disclosure, How It Works, sitemap, robots, and `llms.txt`.
- Confirm public CTAs and schema match Draft Case / Case Advocate language.
- Confirm public pages do not promise parent-facing Timeline or generic "evaluation" as the primary product.
- Confirm active public image assets are compressed and no stale GitHub Pages artifact owns production.

### Authenticated Local Dev-Auth Pass

- Start backend and frontend locally with dev auth enabled.
- Sign in with a development email.
- Open or create a draft case.
- Confirm the floating Case Advocate opens, persists across tabs, and can update the Family Narrative.
- Smoke Case Plan, Evidence Locker upload/search/preview/delete, Records Requests, People, Packet, and legacy route redirects.
- Do not touch production private case records during this pass.

### Backend/API Pass

- Verify tenant isolation for cases, documents, packets, evaluations, records requests, support consents, and Gmail records.
- Verify free-tier limits for draft/active cases, document counts, and Case Read refresh windows.
- Verify Case Read lifecycle and draft-to-active transition.
- Verify Gmail status/rule/search/import/disconnect disabled states and OAuth configured states.
- Verify `/api/seed` and other admin/demo operations are admin-only.

### UX, Accessibility, And Performance Pass

- Capture desktop and mobile screenshots for representative public and parent pages.
- Check keyboard navigation, focus visibility, dialog behavior, destructive action confirmation, and reduced-motion behavior.
- Check responsive layouts for overflow, overlapping text, and touch target size.
- Review status messages for success/warning/error clarity.
- Review bundle chunks and public asset weight after cleanup.

## Assumptions

- Production is the source of truth for parent-visible behavior.
- Authenticated destructive actions, including deleting evidence, require explicit confirmation during QA.
- `deliverables/` and `superpowers/` are intentionally out of scope for this pass.
- Fixes should happen in a separate implementation pass after this log is reviewed and prioritized.
