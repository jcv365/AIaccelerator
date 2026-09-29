# AI Accelerator — Phase 3: Core Domain Model + Minimal UI + API Auth

## Context

Phases 1 (Foundation) and 2 (AI Provider Integration) are complete and merged. The platform can boot via Docker Compose and talk to the conclave, but has no actual accelerator domain logic and no real UI — just a health-check landing page. This phase makes the platform genuinely usable today: track opportunities through the DISCOVER→REASON→DECIDE→PROVE→LEARN lifecycle, attach evidence and record decisions, via both a REST API and a bare-bones UI, with the whole API protected by a shared API key (the single biggest gap flagged after Phase 2).

Trimmed for a same-day scope, per explicit user decision:
- **Entities:** `Opportunity`, `Evidence`, `Decision` only. `Experiment`/`Learning` (the PROVE/LEARN stages) are deferred to a fast-follow phase.
- **No AI wiring:** evidence and decisions are entered manually via the UI/API. Phase 2's `/ai/*` routes exist independently; nothing in this phase calls them.
- **No Evidence↔Decision join table:** evidence and decisions are both scoped to an Opportunity but not linked to each other yet (YAGNI — the UI doesn't need per-decision evidence citation today).
- **UI is intentionally unstyled:** three screens (list, detail, create form), functional only, no design pass, no responsive layout — approved as a wireframe, not a mockup.

## Goals

- Prisma-backed `Opportunity`/`Evidence`/`Decision` schema and migrations against the existing Postgres.
- REST API: create/list/get opportunities, validated status transitions, add evidence, add decisions.
- Server-side enforcement of the opportunity state machine (defined below) — invalid transitions rejected with 400.
- A single shared-secret `ACCELERATOR_API_KEY`, required at server startup (fail-fast, like `DATABASE_URL`/`PORT`), protecting every route except `/health`, `/ready`, `/version`.
- Three React screens: Opportunity List, Opportunity Detail (evidence + decisions), New Opportunity form. Client prompts for the API key once and stores it (localStorage) for subsequent requests.
- Full stack still boots via `docker compose up -d --build`.

## Non-goals

- `Experiment`/`Learning` entities (fast-follow).
- Evidence↔Decision linkage (fast-follow).
- Any AI-assisted reasoning/hypothesis generation (fast-follow — Phase 2's client exists but isn't called from domain logic yet).
- Visual design, responsive layout, accessibility pass (fast-follow, once real usage informs what's needed).
- Multi-user auth (roles, sessions, individual accounts) — one shared key for the whole app today.

## Data model

```prisma
enum OpportunityStatus {
  DISCOVERED
  QUALIFIED
  HYPOTHESIS
  EXPERIMENT
  PROVING
  PROVEN
  REJECTED
  DEFERRED
  NO_AI
}

enum EvidenceType {
  FACT
  INFERENCE
  ASSUMPTION
  AI_HYPOTHESIS
}

model Opportunity {
  id              String            @id @default(cuid())
  title           String
  description     String?
  businessProblem String?
  potentialValue  String?
  complexity      String?
  dependencies    String?
  aiSuitability   String?
  risks           String?
  owner           String?
  hypothesis      String?
  status          OpportunityStatus @default(DISCOVERED)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  evidence        Evidence[]
  decisions       Decision[]
}

model Evidence {
  id            String       @id @default(cuid())
  opportunityId String
  opportunity   Opportunity  @relation(fields: [opportunityId], references: [id])
  claim         String
  type          EvidenceType
  confidence    Float?
  source        String?
  location      String?
  excerpt        String?
  capturedAt    DateTime     @default(now())
}

model Decision {
  id                     String      @id @default(cuid())
  opportunityId          String
  opportunity            Opportunity @relation(fields: [opportunityId], references: [id])
  decision               String
  rationale              String?
  assumptions            String?
  confidence             Float?
  alternativesConsidered String?
  risks                  String?
  owner                  String?
  decidedAt              DateTime    @default(now())
}
```

## State machine

```
DISCOVERED → QUALIFIED | REJECTED
QUALIFIED  → HYPOTHESIS | NO_AI | REJECTED | DEFERRED
HYPOTHESIS → EXPERIMENT | REJECTED | DEFERRED
EXPERIMENT → PROVING | REJECTED | DEFERRED
PROVING    → PROVEN | REJECTED
DEFERRED   → QUALIFIED | REJECTED
PROVEN, REJECTED, NO_AI → (terminal, no further transitions)
```

## API surface

All routes below require `X-API-Key: <ACCELERATOR_API_KEY>`, except `/health`, `/ready`, `/version` (unchanged from Phase 1) and Phase 2's `/ai/quick`/`/ai/session` (also now gated by this same key — see Auth below).

- `GET /opportunities` — list, newest first, includes `evidence`/`decisions` counts (not full nested data, to keep the list light).
- `POST /opportunities` — create. Body: `title` (required), the rest of the fields optional. `status` always starts at `DISCOVERED`, not settable on create.
- `GET /opportunities/:id` — full detail, including nested `evidence[]` and `decisions[]`. 404 if not found.
- `PATCH /opportunities/:id` — update editable fields (everything except `id`, `status`, `createdAt`, `updatedAt`). 404 if not found.
- `PATCH /opportunities/:id/status` — body `{ status }`. Validates against the transition table; 400 `INVALID_TRANSITION` if the requested transition isn't legal from the current status. 404 if opportunity not found.
- `POST /opportunities/:id/evidence` — body `{ claim, type, confidence?, source?, location?, excerpt? }`. `type` must be one of the 4 enum values (400 if not). 404 if opportunity not found.
- `POST /opportunities/:id/decisions` — body `{ decision, rationale?, assumptions?, confidence?, alternativesConsidered?, risks?, owner? }`. 404 if opportunity not found.

Error contract unchanged: `{ error: { code, message } }`. New codes: `VALIDATION_ERROR` (400, malformed body), `INVALID_TRANSITION` (400), `NOT_FOUND` (404, distinct from the existing catch-all 404 handler — this one fires for a well-formed route with a nonexistent `:id`), `UNAUTHORIZED` (401, missing/wrong `X-API-Key`).

## Auth

- `ACCELERATOR_API_KEY` becomes a required env var (`loadConfig` fails fast if unset, same as `DATABASE_URL`/`PORT`) — this is a breaking change to Phase 1/2's "everything but DB/PORT is optional" posture, deliberately: the whole point of this phase is that the API is no longer wide open.
- Middleware `requireAccelApiKey` checks the `X-API-Key` header against `config.acceleratorApiKey` using a constant-time comparison (mirroring the conclave's own `apikey.py` pattern — `crypto.timingSafeEqual`, not `===`). Mounted on every route except `/health`, `/ready`, `/version`.
- This also now protects Phase 2's `/ai/quick`/`/ai/session` routes, closing the "unauthenticated AI routes" gap flagged in the Phase 2 final review.
- `.env.example` documents `ACCELERATOR_API_KEY` as required, with a note to generate a random value (not a placeholder like "changeme").

## Frontend

- Add `react-router-dom` to `client/package.json`.
- `client/src/api.ts`: a small fetch wrapper that reads the stored API key from `localStorage` and attaches `X-API-Key` to every request; on a `401`, clears the stored key and re-prompts.
- `client/src/pages/OpportunityList.tsx` — table (title, status, owner), "+ New" button, click-through to detail.
- `client/src/pages/OpportunityDetail.tsx` — field display, a status `<select>` populated only with the current status's valid next transitions (client mirrors the same transition table, purely for UX — the server is still the source of truth and re-validates), an evidence list + add-evidence form, a decisions list + add-decision form.
- `client/src/pages/NewOpportunity.tsx` — plain form for the creatable fields, submits, redirects to the new detail page.
- `client/src/App.tsx` becomes a router shell (replacing Phase 1's health-check landing page — that check can move into a small footer/status indicator instead of being the whole page).
- No CSS framework, no component library — plain HTML elements, minimal inline/utility styling only where needed for basic usability (e.g. table borders).

## Testing

- Prisma schema: a migration applied against the real test Postgres (this phase's server test suite gains its first tests that need a real DB — follow Phase 1's `ready.integration.test.ts` pattern: excluded from the default `npm test`, run explicitly, documented in the README).
- Domain logic (state machine validation, request validation) unit-tested with a mocked Prisma client — no real DB needed for these.
- Route tests (Vitest + Supertest) with a mocked Prisma client, same DI pattern as `pool`/`aiClient`.
- Auth middleware unit-tested directly (valid key passes, missing/wrong key returns 401, `/health` etc. bypass it).
- Frontend: minimal — one smoke test per page confirming it renders and makes the expected API call (mocked `fetch`), matching Phase 1's `App.test.tsx` depth. No exhaustive UI test suite given the "bare-bones, fast-follow" nature of this UI.

## Acceptance criteria (Definition of Done for Phase 3)

- [ ] Prisma schema + migration applied; `Opportunity`/`Evidence`/`Decision` tables exist.
- [ ] All 7 API routes implemented, validated, tested.
- [ ] State machine enforced server-side, matching the table above exactly.
- [ ] `ACCELERATOR_API_KEY` required; `/ai/*` and all `/opportunities*` routes protected; `/health`/`/ready`/`/version` remain open.
- [ ] Three UI screens implemented and manually verified against a running stack.
- [ ] `docker compose up -d --build` still works end to end from a clean state.
- [ ] `make test`/`make lint` (or their raw equivalents) pass.
- [ ] No secrets committed; `.env.example` updated.
