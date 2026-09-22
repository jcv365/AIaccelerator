# AI Accelerator — Phase 1: Foundation

## Context

The AI Accelerator is a new local platform implementing the DISCOVER →
REASON → DECIDE → PROVE → LEARN methodology for evaluating AI
opportunities. The repository (`github.com/jcv365/AIaccelerator.git`)
starts empty. Because the full platform spans several largely
independent subsystems, the build is split into five phases, each with
its own spec/plan/implementation cycle:

1. **Foundation** (this spec) — Docker Compose skeleton, Postgres, API
   backend scaffold, health checks, env config, frontend shell.
2. AI provider abstraction — routes through the existing
   `Council-of-ai-experts` multi-model tool (currently a Python CLI,
   not an HTTP service — will need a thin API wrapper).
3. Core domain model — Opportunity, Evidence, Decision, Experiment,
   Learning entities and the DISCOVER→REASON→DECIDE→PROVE→LEARN state
   machine.
4. Frontend operational views — portfolio, evidence, reasoning,
   decisions, experiments, results, learning screens.
5. Observability, security hardening, prompt-injection tests, e2e
   smoke test.

Phase 1 delivers a running, empty platform with no accelerator logic —
the scaffold everything else builds into.

## Goals

- `docker compose up -d` brings up `postgres`, `server`, and `client`,
  all healthy.
- Backend exposes `/health`, `/ready`, `/version`.
- Frontend shell confirms it can reach the backend.
- Config is entirely env-driven, validated at startup, documented in
  `.env.example`. No secrets committed.
- `make dev|stop|restart|logs|test|lint|clean|reset` all work.

## Non-goals

- No AI provider integration (Phase 2).
- No domain model / accelerator workflow (Phase 3).
- No portfolio/evidence/decision UI (Phase 4) — frontend is a landing
  page only.
- No ORM selection yet — deferred to Phase 3 since it's tied to the
  entity schema.

## Repo layout

```
AIaccelerator/
├── docker-compose.yml
├── .env.example
├── Makefile
├── server/                  # Node.js + TypeScript API (Express)
│   ├── src/
│   │   ├── index.ts          # entrypoint, /health /ready /version
│   │   ├── config.ts         # env validation, fail-fast on startup
│   │   └── db.ts             # Postgres client (pg)
│   ├── Dockerfile
│   ├── package.json
│   └── test/
├── client/                  # React + TypeScript + Vite
│   ├── src/
│   ├── Dockerfile
│   └── package.json
└── docs/
    ├── IMPLEMENTATION_STATUS.md
    └── superpowers/specs/
```

## Components

### server (Express + TypeScript)

- `GET /health` — process liveness, no dependencies checked.
- `GET /ready` — verifies Postgres connectivity; 503 with structured
  error body if the DB is unreachable.
- `GET /version` — returns `package.json` version + git SHA (passed as
  a Docker build arg).
- Structured JSON logging (request ID per request), no secrets logged.
- Errors return `{ "error": { "code": "...", "message": "..." } }`,
  never a raw stack trace to the client.
- Required env vars: `DATABASE_URL`, `PORT`. Missing required vars
  fail startup immediately with a clear message (no silent defaults
  for required config).
- Non-root user in the container; multi-stage Dockerfile; `HEALTHCHECK`
  hits `/health`.

### client (React + TS + Vite)

- Landing page that calls `server`'s `/health` and displays the
  result — proves the network path works end to end.
- Dev mode: Vite dev server with HMR, proxying `/api/*` to `server`.
- Prod mode: static build served via nginx in its own container.

### postgres

- Postgres 16, single `accelerator` database, named volume for
  persistence, standard `pg_isready` healthcheck.

### Compose wiring

`postgres` → `server` (waits for postgres healthy) → `client` (waits
for server healthy), one bridge network, `.env` supplies all
variables.

## Configuration (`.env.example`)

```
# Required
DATABASE_URL=postgres://accelerator:accelerator@postgres:5432/accelerator
PORT=4000

# Optional (enable features once available)
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=

# Development
NODE_ENV=development

# Production (documented now, required later when deploying beyond local Docker)
# CORS_ALLOWED_ORIGINS=
```

## Testing

- **Unit**: config validation (missing required env var throws with a
  clear message; present vars parse correctly).
- **Integration**: boots the server against a real test Postgres
  container; `/ready` returns 200 when DB is up and 503 (structured
  error) when DB is down/unreachable.
- **Container test**: `docker compose up -d` then poll `docker compose
  ps` / each service's healthcheck until healthy or timeout — wired as
  a `make test-containers` (or equivalent) target, and run as part of
  the Phase 1 acceptance check.
- **Lint/typecheck**: ESLint + `tsc --noEmit` for `server`; ESLint +
  `tsc --noEmit` for `client`.

## Error handling

- No swallowed errors: DB failures surface in `/ready` and logs, never
  silently ignored.
- No fallback to fake/mocked data if Postgres is unreachable — `/ready`
  reports unhealthy instead.

## Acceptance criteria (Definition of Done for Phase 1)

- [ ] `docker compose up -d` starts all three services successfully.
- [ ] `docker compose ps` shows all services healthy.
- [ ] `curl /health`, `/ready`, `/version` all return expected
      responses.
- [ ] Client landing page loads and shows a successful health check
      from the server.
- [ ] `make test`, `make lint` pass.
- [ ] No secrets committed; `.env.example` documents all variables.
- [ ] `docs/IMPLEMENTATION_STATUS.md` written, reflecting this phase's
      state and what's still missing (Phases 2–5).
