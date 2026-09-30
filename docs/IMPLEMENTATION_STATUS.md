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

## Not yet implemented

- Evidence <-> Decision linkage (deferred from Phase 3)
- UI styling pass (current screens are functional/unstyled; deferred from Phase 3)
- apiFetch Headers-instance support (client API helper does not yet accept a `Headers` instance for custom headers; deferred from Phase 3)
- Generated reports are not persisted to the database (displayed on screen only; deferred from Phase 4)
- No multi-user support (single local admin account only, by design; deferred from Phase 4)
- No refresh-token rotation or logout-everywhere (fixed-expiry JWT only; deferred from Phase 4)
- Real conclave-backed report generation (a 200 response with actual AI-authored text) has not been verified in this development environment — only the graceful 503 AI_NOT_CONFIGURED fallback path has been live-tested, since COUNCIL_BASE_URL/COUNCIL_API_KEY were not available here
- No rate limiting or lockout on POST /auth/login (deferred to Phase 5's security hardening)
- Opportunity title/description/evidence are interpolated directly into the AI report prompt with no sanitization beyond the system prompt's own instructions — prompt-injection hardening deferred to Phase 5
- Phase 5: Observability, security hardening, prompt-injection tests, e2e smoke test

## Risks

- Council-of-ai-experts exposes `/api/external/quick` and `/api/external/session`; the AI Accelerator depends on that deployment being reachable and on the conclave's single-session slot (409 when busy).
