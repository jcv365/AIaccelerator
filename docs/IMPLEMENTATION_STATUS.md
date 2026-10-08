# Implementation Status

## Phase 1 — Foundation (complete)

- [x] Docker Compose skeleton: postgres + server (Express/TS) + client (React/Vite)
- [x] Health checks: `/health`, `/ready`, `/version`
- [x] Env-driven config, validated at startup
- [x] No accelerator logic yet

## Phase 2 — AI Provider Integration (complete)

- [x] AiClient wrapping the conclave's /api/external/quick and /api/external/session
- [x] POST /ai/quick and POST /ai/session routes
- [x] COUNCIL_BASE_URL/COUNCIL_API_KEY optional, server boots without them
- [x] Manually verified against the live conclave

## Phase 3 — Core Domain Model + Minimal UI + API Auth (complete)

- [x] Prisma schema: Opportunity/Evidence/Decision, migrated
- [x] REST API: list/create/get/update opportunities, validated status transitions, evidence, decisions
- [x] ACCELERATOR_API_KEY required, protects all non-health routes including /ai/*
- [x] Three UI screens: list, detail, new-opportunity form

## Phase 4 — Real Login + AI-Generated Opportunity Report (complete)

- [x] POST /auth/login: real username/password against a bcrypt-hashed, env-configured single local account
- [x] JWT-based requireAuth replaces the shared ACCELERATOR_API_KEY everywhere
- [x] POST /opportunities/:id/report: AI-synthesized report via the conclave, using the opportunity's evidence and decisions
- [x] Client: real login form, Generate Report button

## Frontend Operational Views — Experiment/Learning + Portfolio/Tabs (complete)

- [x] Experiment/Learning Prisma models, migrated
- [x] POST/PATCH experiment routes, POST learning route, GET /opportunities/:id includes both
- [x] Portfolio view groups opportunities by status
- [x] OpportunityDetail restructured into 6 tabs (Overview/Evidence/Reasoning/Decisions/Experiments/Learnings)
- [x] Hypothesis field is now editable (previously had no UI at all)

## Hardening and data features (complete, 2026-10-05)

- [x] Login rate limiting (failed attempts per client IP, 429 RATE_LIMITED), helmet security headers, trusted client IP via nginx
- [x] Prompt-injection hardening: untrusted text bounded, escaped and fenced in <data> blocks with a standing notice (report prompt and analyze goal) - mitigation, not a guarantee
- [x] Observability basics: structured analysis start/finish/fail logs; `npm run smoke` live-stack check
- [x] Start Analysis runs as a background job (202 + poll), 5-expert Conclave roster, UI polling with resume
- [x] Edit/delete experiments and learnings, clear-to-null, single-source experiment statuses (drift test), Portfolio empty-state test
- [x] UI screens styled and built (product-atlas): landing, sign-in, dashboard, portfolio, evidence, hypothesis, PoV pipeline, no-AI, reports, health
- [x] Generated reports are saved (OpportunityReport table; newest shown on the Reasoning tab with its timestamp; a failed save still returns the report with a warning); `apiFetch` accepts any HeadersInit (Headers instance / pairs / object) and never lets callers override Authorization

## Not yet implemented

- Evidence <-> Decision linkage (deferred from Phase 3)
- No multi-user support (single local admin account only, by design; deferred from Phase 4)
- No refresh-token rotation or logout-everywhere (fixed-expiry JWT only; deferred from Phase 4)
- Real conclave-backed report generation (a 200 response with actual AI-authored text) has not been verified in this development environment — only the graceful 503 AI_NOT_CONFIGURED fallback path has been live-tested, since COUNCIL_BASE_URL/COUNCIL_API_KEY were not available here

## Risks

- Council-of-ai-experts exposes `/api/external/quick` and `/api/external/session`; the AI Accelerator depends on that deployment being reachable and on the conclave's single-session slot (409 when busy).

## Analysis backbone and guided wizard: rolled out and verified live (2026-10-08)

The Council (async `POST /api/external/session/start` and `GET /api/external/session/{id}`) and the app (queue, worker, company context, migration `20261007130000_analysis_backbone`) were deployed in that order while both were idle. Verified on the live system: the unknown-session route returns 404 `not_found` and `start` without a key returns 403; the migration added the new columns; a first analysis (Equinix) went QUEUED, RUNNING with stage and per-expert progress updating; a second company (Cloudflare) requested straight after returned 202 and waited as QUEUED, then started by itself when the first finished, and a repeat request for the running company returned 409 `ANALYSIS_IN_PROGRESS` with its job id; restarting the server container mid-run left the job RUNNING and it carried on (reattached by session id); Cloudflare finished SUCCEEDED with 11 opportunities stored. The Equinix run reached the end but FAILED with "AI response missing opportunities array": the chairman returned a prose plan with only the revised entries as JSON (the Council marked it `passed: false`), so nothing was stored and the real reason was shown. Retrying is the remedy; making the app fall back to a fuller contribution is a possible follow-up.

The guided wizard (`/app/wizard`, "New analysis" in the sidebar) is built on top: Company, Analysis, Opportunities, Report. It reads all state from the server, so closing the page loses nothing.
