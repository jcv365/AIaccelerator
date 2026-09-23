# AI Accelerator — Handoff

**Repo:** github.com/jcv365/AIaccelerator
**Branch:** `main`, currently at commit `5c6ccf4`, clean, pushed
**As of:** 2026-09-23

This doc exists so work can continue in a different tool/session with full context. It summarizes what's built, what's decided-but-not-yet-built, and the conventions this project follows.

---

## What the project is

A local platform implementing the DISCOVER → REASON → DECIDE → PROVE → LEARN methodology for evaluating AI opportunities. Built with Claude Code + Docker Desktop, following a phase-by-phase plan (each phase = its own spec → implementation plan → code, reviewed and merged before the next phase starts).

## Repo conventions (useful if continuing with any AI coding tool)

- `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` — one design spec per phase/subsystem, written and approved *before* any code.
- `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` — a detailed, TDD-style implementation plan derived from each spec (exact file contents, exact test code, task-by-task).
- `docs/IMPLEMENTATION_STATUS.md` — running status: what's complete, what's not, known risks.
- Each phase was built on its own branch (`phase1-foundation`, `phase2-ai-provider`), then merged to `main` once fully reviewed, tests green, and `docker compose up -d --build` verified from a clean rebuild.
- `.env.example` documents every config variable; `.env` itself is gitignored and never committed.
- `make dev|stop|restart|logs|test|lint|clean|reset|test-containers` — **note:** `make` itself is not installed on the dev machine used so far; every target's underlying `docker compose`/`npm` command was run directly instead (see `Makefile` for the exact commands each target wraps).

## Phase 1 — Foundation (complete, merged)

- `docker-compose.yml`: `postgres` (16-alpine, host port **5434** not 5432 — a local port conflict on the dev machine, documented in `README.md`) → `server` → `client`, health-check-gated startup.
- `server/`: Express + TypeScript. `src/app.ts` (route composition), `src/config.ts` (`loadConfig()`, fail-fast on missing `DATABASE_URL`/`PORT`), `src/db.ts` (Postgres pool + health check + error listener), `src/errors.ts` (request-ID middleware, request-logging middleware, `errorHandler`, 404 handler), `src/logger.ts` (structured JSON logs), `src/index.ts` (entrypoint).
  - Routes: `GET /health`, `GET /ready` (DB check), `GET /version` (reads real `package.json` version + `GIT_SHA` build arg).
  - Error contract: `{ error: { code, message } }` everywhere, never a stack trace to the client.
- `client/`: React + Vite + TypeScript, served by nginx in prod. Currently just a landing page that calls `/api/health` — no real UI yet.
- Tests: Vitest + Supertest, `server/test/**`, mocked dependencies (no real DB in the default `npm test` — a separate `ready.integration.test.ts` needs a real Postgres and is excluded from the default run).

**Known deferred hardening (not yet done):** Dockerfiles use `npm install` not `npm ci`; client's nginx container runs as root; no working Vite dev-mode HMR loop; client `tsconfig.json` lacks `noEmit`; Postgres credentials hardcoded in `docker-compose.yml` rather than sourced from `.env`; `typecheck` npm scripts exist in both packages but nothing calls them.

## Phase 2 — AI Provider Integration (complete, merged)

**The only AI backend this platform talks to is "the conclave"** — an already-deployed, separate project (`Council-of-ai-experts`, a FastAPI webapp) reachable at `http://192.168.1.195:8010`. This was an explicit user decision: **no generic multi-provider abstraction, ever** — not freellmapi, not direct Anthropic/OpenAI calls. If continuing this project anywhere else, preserve that constraint unless the user changes their mind.

- `server/src/ai/errors.ts`: `AiClientError` with a 5-member `AiErrorCode` union (`AI_NOT_CONFIGURED`, `AI_UPSTREAM_ERROR`, `AI_BUSY`, `AI_BAD_REQUEST`, `AI_UNREACHABLE`).
- `server/src/ai/client.ts`: `createAiClient({baseUrl, apiKey})` → `{ quickAsk(model, system, prompt), runSession(goal) }`. Wraps the conclave's `POST /api/external/quick` (single-model, ~30s timeout) and `POST /api/external/session` (full multi-expert deliberation, blocks minutes, 5min timeout). Validates response shape (not just status code) before trusting it.
- `server/src/config.ts`: `COUNCIL_BASE_URL`/`COUNCIL_API_KEY` are **optional** — server boots and serves `/health`/`/ready` fine without them; `/ai/*` routes return `503 AI_NOT_CONFIGURED` if unset.
- `server/src/app.ts`: `POST /ai/quick` and `POST /ai/session` — thin pass-throughs, `AppDeps.aiClient?: AiClient` dependency injection (same pattern as `pool`).
- Live-verified once against the real conclave with a real API key (spent real provider quota — the routes work).
- Valid `model` values for `/ai/quick` (must match the conclave's own roster in its `experts.yaml`): `Claude`, `ChatGPT`, `Fusion`, `Nemotron`, `Nemotron Ultra`, `GPT-OSS`, `Abacus`, `Antigravity`, `Kimi`.

**Known deferred hardening (not yet done) — flagged as real risk, especially before going beyond localhost:**
- `/ai/quick` and `/ai/session` are **completely unauthenticated** with **no rate limiting** — anyone who can reach the server can spend real provider quota. This is the single biggest thing to fix before any non-local deployment.
- `quickAsk`'s 30s timeout may be too short for large models (Nemotron Ultra especially) — should be configurable.
- Upstream conclave error text is reflected verbatim to callers (minor info-leak risk).
- No test covers the generic `next(err)` → 500 path.
- A `quickAsk` call where the conclave returns literal JSON `null` throws an unhandled `TypeError` instead of a clean `502` (edge case, low likelihood).

## Phase 3 — Core Domain Model (DESIGN IN PROGRESS, NOT STARTED — this is where to pick up)

Nothing has been built yet. Design discussion got through these decisions (all confirmed by the user):

1. **ORM: Prisma.** (Chosen over Drizzle or raw `pg` + hand-written migrations.)
2. **No AI in Phase 3.** Pure CRUD + state machine only. Wiring the conclave into REASON/DECIDE is explicitly deferred to a later, focused follow-up once Phase 4's UI exists to actually drive it.
3. **Enforce valid state transitions server-side** (not freely-settable status).

### Proposed data model (presented to user, NOT yet fully approved — the conversation was interrupted right after this)

```
Opportunity (id, title, description, businessProblem, potentialValue,
  complexity, dependencies, aiSuitability, risks, owner, hypothesis,
  status, createdAt, updatedAt)
  status ∈ {DISCOVERED, QUALIFIED, HYPOTHESIS, EXPERIMENT, PROVING,
            PROVEN, REJECTED, DEFERRED, NO_AI}

Evidence     (id, opportunityId→Opportunity, claim, type, confidence,
              source, location, excerpt, capturedAt)
  type ∈ {FACT, INFERENCE, ASSUMPTION, AI_HYPOTHESIS}

Decision     (id, opportunityId→Opportunity, decision, rationale,
              assumptions, confidence, alternativesConsidered, risks,
              owner, decidedAt)
DecisionEvidence (decisionId→Decision, evidenceId→Evidence)  — join table

Experiment   (id, opportunityId→Opportunity, hypothesis, baseline,
              description, successMetrics, failureCriteria, timeLimit,
              result, outcome, startedAt, endedAt)

Learning     (id, opportunityId→Opportunity, sourceType, sourceId,
              insight, createdAt)
```

Proposed transition table (enforced server-side, not yet built):

```
DISCOVERED → QUALIFIED | REJECTED
QUALIFIED  → HYPOTHESIS | NO_AI | REJECTED | DEFERRED
HYPOTHESIS → EXPERIMENT | REJECTED | DEFERRED
EXPERIMENT → PROVING | REJECTED | DEFERRED
PROVING    → PROVEN | REJECTED
DEFERRED   → QUALIFIED | REJECTED
PROVEN, REJECTED, NO_AI → (terminal)
```

### Still undecided / not yet designed for Phase 3

- **API surface shape** — likely REST, nested under `/opportunities/:id/...` for evidence/decisions/experiments/learnings, plus a dedicated `PATCH /opportunities/:id/status` for validated transitions. Not finalized.
- **Evidence↔Decision linkage mechanics** — proposed a join table (`DecisionEvidence`) rather than an array column, for referential integrity; not confirmed.
- **Testing approach for this phase** — Phase 1/2 used Vitest + Supertest with mocked/injected dependencies (DB tests use a fake `pg` Pool or dependency injection, never a real DB in the default suite). Phase 3 will need real Prisma-against-Postgres integration tests for at least some paths (schema/migrations, relational integrity) — how much should be mocked vs. real wasn't decided.
- **No spec document has been written yet** for Phase 3 — the process this project follows is: finish the design conversation → write `docs/superpowers/specs/YYYY-MM-DD-phase3-domain-model-design.md` → get user approval on the written spec → write a detailed implementation plan → execute. All of that is still ahead.

## Where to look for more context

- `docs/superpowers/specs/2026-09-22-phase1-foundation-design.md` and `docs/superpowers/specs/2026-09-22-phase2-ai-provider-design.md` — the two prior phase specs, useful as a template for how Phase 3's spec should be structured.
- `docs/superpowers/plans/2026-09-22-phase1-foundation.md` and `docs/superpowers/plans/2026-09-22-phase2-ai-provider.md` — the two prior implementation plans, useful as a template for task granularity/TDD style.
- `docs/IMPLEMENTATION_STATUS.md` — current status summary.
- `README.md` — quickstart, port table, Make targets.
