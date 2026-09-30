# AI Accelerator — Frontend Operational Views: Experiment/Learning Entities + Portfolio & Tabbed Detail UI

## Context

Phases 1-4 shipped the foundation, AI provider integration, the core `Opportunity`/`Evidence`/`Decision` domain model with a 9-state lifecycle, and real login + AI-generated reports. The original roadmap's next phase was "Frontend operational views (portfolio, evidence, reasoning, decisions, experiments, results, learning)." Two of those — Experiment and Learning — don't exist as entities yet; the lifecycle's `EXPERIMENT`/`PROVING` statuses are currently just a status field with no structured record of what was actually tried or learned.

Per explicit user decisions made during brainstorming:
- **Full DISCOVER→LEARN lifecycle.** Add `Experiment` and `Learning` as real entities, not just better views of existing data.
- **One Opportunity has many Experiments, and each Experiment has many Learnings** — matches real iterative practice (retry with a different approach, multiple takeaways per run).
- **"Results" is not a separate entity** — outcome fields live directly on `Experiment`.
- **Learning links to the specific Experiment it came from** (`learning.experimentId`), not loosely to the Opportunity.
- **No status gating** on creating Experiments/Learnings — same permissive pattern as Evidence/Decision today.
- **Experiment has a simple status enum with no enforced transitions** — no second state machine to build/maintain.
- **OpportunityDetail is restructured into tabs** (Overview/Evidence/Reasoning/Decisions/Experiments/Learnings) rather than more inline sections, since the page would otherwise grow to 5+ sections.
- **The "Reasoning" tab holds the hypothesis field plus the Phase 4 "Generate Report" button/display**, moved here from its current location at the bottom of the page.
- **"Portfolio" replaces the flat `OpportunityList`** with a status-grouped board (opportunities grouped into sections by their 9 lifecycle statuses).

## Goals

- `Experiment` and `Learning` Prisma models, migrated.
- New nested REST routes for creating/updating experiments and creating learnings, following the existing `opportunities.ts` router pattern exactly (`asyncHandler`, `{error:{code,message}}` contract, type-validated `pickEditableFields`-style updates).
- `GET /opportunities/:id` extended to include experiments (with their learnings) alongside existing evidence/decisions.
- Client: `OpportunityList` replaced by a `Portfolio` component grouping opportunities by status; `OpportunityDetail` restructured into 6 tabs.
- Full test coverage (server + client) following the exact TDD patterns established in Phases 1-4.

## Non-goals

- No enforced Experiment state machine (simple status enum only, freely settable via PATCH).
- No status gating on Experiment/Learning creation relative to the parent Opportunity's status.
- No separate `Result` entity — outcome data lives on `Experiment` itself.
- No changes to the existing Opportunity/Evidence/Decision schema, routes, or the 9-state lifecycle machine.
- No changes to auth, login, or the AI report route itself (only its UI location moves, to the new Reasoning tab).

## Data Model

Two new Prisma models added to `server/prisma/schema.prisma`, alongside the existing `Opportunity`/`Evidence`/`Decision`:

```prisma
enum ExperimentStatus {
  PLANNED
  RUNNING
  COMPLETE
  ABANDONED
}

model Experiment {
  id             String           @id @default(cuid())
  opportunityId  String
  opportunity    Opportunity      @relation(fields: [opportunityId], references: [id])
  title          String
  method         String
  status         ExperimentStatus @default(PLANNED)
  resultSummary  String?
  success        Boolean?
  startedAt      DateTime?
  completedAt    DateTime?
  learnings      Learning[]
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
}

model Learning {
  id            String     @id @default(cuid())
  experimentId  String
  experiment    Experiment @relation(fields: [experimentId], references: [id])
  insight       String
  createdAt     DateTime   @default(now())
}
```

`Opportunity` gains an `experiments Experiment[]` back-relation field. A new Prisma migration captures this.

## API

New routes added directly to `server/src/domain/opportunities.ts`'s existing `createOpportunitiesRouter` (not a separately-mounted sub-router) — the same file Evidence and Decision routes already live in, as further nested paths on the same router:

- `POST /opportunities/:id/experiments` — body `{ title, method }` (both required strings); creates with `status: "PLANNED"`. 404 if opportunity doesn't exist. 400 `VALIDATION_ERROR` on missing/wrong-typed fields.
- `PATCH /opportunities/:id/experiments/:experimentId` — editable fields: `title`, `method`, `status` (must be a valid `ExperimentStatus` value), `resultSummary`, `success`, `startedAt`, `completedAt`. Same type-validated `pickEditableFields`-style pattern as `PATCH /opportunities/:id`. 404 if the experiment doesn't exist or doesn't belong to the given opportunity.
- `POST /opportunities/:id/experiments/:experimentId/learnings` — body `{ insight }` (required string). 404 if the opportunity or experiment doesn't exist (or the experiment doesn't belong to that opportunity).

`GET /opportunities/:id` is extended: `include: { evidence: true, decisions: true, experiments: { include: { learnings: true } } }`.

No standalone top-level routes for experiments/learnings outside their opportunity — consistent with how Evidence/Decision work today (always accessed through the parent).

## Client

### Portfolio (replaces `OpportunityList.tsx`)

Fetches all opportunities (existing `GET /opportunities`), groups them client-side by `status` into the 9 lifecycle buckets (in `DISCOVERED → QUALIFIED → HYPOTHESIS → EXPERIMENT → PROVING → PROVEN/REJECTED/NO_AI/DEFERRED` order, matching `stateMachine.ts`'s ordering), renders each bucket as a labeled section/column with its opportunities as simple cards (title + link to detail). Keeps the existing "+ New" link. No new backend query needed — grouping happens client-side over the existing list response.

### OpportunityDetail — tabbed restructure

Six tabs, client-side tab state (no new routes — `/opportunities/:id` stays a single route):

1. **Overview** — existing title/description/businessProblem/etc. fields and status-transition control.
2. **Evidence** — existing evidence list + add form, unchanged.
3. **Reasoning** — hypothesis field (existing, moved here) + the Phase 4 "Generate Report" button and report display (moved here from the page bottom).
4. **Decisions** — existing decisions list + add form, unchanged.
5. **Experiments** — list of the opportunity's experiments (title, method, status, resultSummary, success), an add-experiment form, and inline controls to PATCH an experiment's status/result once it's complete.
6. **Learnings** — flat list of all learnings across all of the opportunity's experiments, each entry showing which experiment it came from; an add-learning form with a dropdown to pick which experiment the learning belongs to (disabled/hidden if there are no experiments yet).

### `client/src/api.ts`

No changes — the existing `apiFetch` helper is reused as-is for all new experiment/learning calls.

## Error Handling

Unchanged `{error:{code,message}}` contract. New/reused codes for this phase: `NOT_FOUND` (404) for missing opportunity/experiment, `VALIDATION_ERROR` (400) for bad experiment/learning fields — consistent with existing codes, no new error codes introduced.

## Testing

- Prisma migration applied and verified against the dev Postgres instance (matching Phase 3's Task 1 pattern — live `--no-cache` Docker rebuild verification given Phase 3's hard-won Prisma/Alpine lessons).
- Server: TDD route tests for all 3 new endpoints (create experiment success/400/404, update experiment success/400/404, create learning success/400/404-on-missing-opportunity/404-on-missing-experiment/404-on-experiment-belonging-to-a-different-opportunity), plus an updated `GET /opportunities/:id` test confirming experiments+learnings are included.
- Client: component tests for `Portfolio`'s status-grouping logic, and for each new/moved `OpportunityDetail` tab (tab switching, Experiments list+form, Learnings list+form with experiment dropdown, Reasoning tab showing hypothesis+report).
- No test calls the real conclave (unchanged rule from Phase 2/4).

## Acceptance Criteria (Definition of Done)

- [ ] `Experiment`/`Learning` Prisma models migrated and live-verified via a clean Docker rebuild.
- [ ] All 3 new routes work per the error/validation rules above, with full test coverage.
- [ ] `GET /opportunities/:id` returns experiments (with nested learnings) alongside evidence/decisions.
- [ ] Portfolio view groups opportunities by status correctly, replacing the flat list.
- [ ] OpportunityDetail is tabbed with all 6 tabs functioning, Reasoning tab hosting the relocated hypothesis field + Generate Report feature.
- [ ] `npm test`/`npm run lint` pass in both `server/` and `client/`.
- [ ] `docker compose up -d --build` works end to end from a clean rebuild with the new schema.
- [ ] `docs/IMPLEMENTATION_STATUS.md` updated.
