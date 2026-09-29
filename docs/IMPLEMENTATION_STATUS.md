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

## Not yet implemented

- Experiment and Learning entities (deferred from Phase 3's domain model)
- Evidence <-> Decision linkage (deferred from Phase 3)
- AI-assisted reasoning wiring into the Opportunity/Evidence/Decision flow (deferred from Phase 3; /ai/quick and /ai/session exist but are not yet called from the domain UI)
- Mutation-error UI feedback (status transition / evidence / decision failures are not surfaced to the user in the UI; deferred from Phase 3)
- UI styling pass (current three screens are functional/unstyled; deferred from Phase 3)
- apiFetch Headers-instance support (client API helper does not yet accept a `Headers` instance for custom headers; deferred from Phase 3)
- Phase 4: Frontend operational views (portfolio, evidence, reasoning, decisions, experiments, results, learning)
- Phase 5: Observability, security hardening, prompt-injection tests, e2e smoke test

## Risks

- Council-of-ai-experts exposes `/api/external/quick` and `/api/external/session`; the AI Accelerator depends on that deployment being reachable and on the conclave's single-session slot (409 when busy).
