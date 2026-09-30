# AI Accelerator — Frontend Operational Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Experiment`/`Learning` entities to complete the DISCOVER→LEARN lifecycle, replace the flat opportunity list with a status-grouped Portfolio board, and restructure the Opportunity Detail page into tabs (Overview/Evidence/Reasoning/Decisions/Experiments/Learnings).

**Architecture:** Two new Prisma models (`Experiment`, `Learning`) with routes added directly to the existing `server/src/domain/opportunities.ts` router (same pattern as Evidence/Decision). Client-side, `OpportunityList.tsx` is replaced by a new `Portfolio.tsx` that groups the existing `GET /opportunities` response by status client-side (no new backend query), and `OpportunityDetail.tsx` is restructured with simple client-side tab state (no new routes).

**Tech Stack:** Existing stack unchanged (Prisma/Postgres, Express/TS, React/Vite, Vitest).

**Spec:** `docs/superpowers/specs/2026-09-30-frontend-operational-views-design.md`

## Global Constraints

- No enforced Experiment state machine — `status` is a plain enum, freely settable via PATCH, no transition validation.
- No status gating on creating Experiments/Learnings relative to the parent Opportunity's status — same permissive pattern as Evidence/Decision.
- No separate `Result` entity — outcome fields (`resultSummary`, `success`) live directly on `Experiment`.
- `Learning.experimentId` is required — every learning traces to one specific experiment, not loosely to the opportunity.
- Error contract unchanged: `{error:{code,message}}`. Reused codes only: `NOT_FOUND` (404), `VALIDATION_ERROR` (400) — no new error codes.
- No changes to Opportunity/Evidence/Decision schema, routes, the 9-state lifecycle machine, or the auth system.
- Experiment/Learning routes live in the existing `opportunities.ts` router (not a separately-mounted sub-router).

---

### Task 1: Prisma schema — `Experiment`/`Learning` models + migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Migration: created via `npx prisma migrate dev` (generates a new file under `server/prisma/migrations/`)

**Interfaces:**
- Produces: Prisma models `Experiment` (fields: `id, opportunityId, title, method, status: ExperimentStatus, resultSummary, success, startedAt, completedAt, learnings, createdAt, updatedAt`) and `Learning` (fields: `id, experimentId, insight, createdAt`), plus enum `ExperimentStatus` (`PLANNED | RUNNING | COMPLETE | ABANDONED`). `Opportunity` gains `experiments Experiment[]`. Task 2/3 use `prisma.experiment.*`/`prisma.learning.*`.

- [ ] **Step 1: Modify `server/prisma/schema.prisma`**

Add this enum after the existing `EvidenceType` enum:

```prisma
enum ExperimentStatus {
  PLANNED
  RUNNING
  COMPLETE
  ABANDONED
}
```

Add `experiments Experiment[]` to the `Opportunity` model, right after the existing `decisions Decision[]` line:

```prisma
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
  experiments     Experiment[]
}
```

Add these two new models at the end of the file, after the existing `Decision` model:

```prisma
model Experiment {
  id            String           @id @default(cuid())
  opportunityId String
  opportunity   Opportunity      @relation(fields: [opportunityId], references: [id])
  title         String
  method        String
  status        ExperimentStatus @default(PLANNED)
  resultSummary String?
  success       Boolean?
  startedAt     DateTime?
  completedAt   DateTime?
  learnings     Learning[]
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
}

model Learning {
  id           String     @id @default(cuid())
  experimentId String
  experiment   Experiment @relation(fields: [experimentId], references: [id])
  insight      String
  createdAt    DateTime   @default(now())
}
```

- [ ] **Step 2: Generate and apply the migration**

Run (from `server/`, with the dev Postgres container running — `docker compose up -d postgres` from the repo root first if it isn't already up):

```bash
npx prisma migrate dev --name add_experiment_and_learning
```

Expected: a new directory under `server/prisma/migrations/` is created, and the command reports the migration applied successfully with no errors.

- [ ] **Step 3: Regenerate the Prisma client**

Run (from `server/`): `npx prisma generate`
Expected: completes with no errors — `@prisma/client`'s generated types now include `Experiment`/`Learning`.

- [ ] **Step 4: Run the full server test suite to confirm nothing broke**

Run (from `server/`): `npm test`
Expected: PASS — this task only adds schema, no test file changes are needed yet, and no existing test should reference the new models.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(server): add Experiment/Learning Prisma models and migration"
```

---

### Task 2: Server — create/update Experiment routes

**Files:**
- Modify: `server/src/domain/opportunities.ts`
- Modify: `server/test/domain/opportunities.test.ts`

**Interfaces:**
- Consumes: `Experiment`/`ExperimentStatus` types from `@prisma/client` (via `PrismaClient`'s generated types, already imported as `prisma: PrismaClient`).
- Produces: `POST /:id/experiments` and `PATCH /:id/experiments/:experimentId` routes on the existing `createOpportunitiesRouter` router — Task 3 adds the learnings route and the `GET /:id` include change in the same file/router.

- [ ] **Step 1: Add the failing tests (append to `server/test/domain/opportunities.test.ts`, after the existing `describe("POST /opportunities/:id/report", ...)` block)**

```typescript
describe("POST /opportunities/:id/experiments", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null) } };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/nope/experiments").send({ title: "T", method: "M" });

    expect(res.status).toBe(404);
  });

  it("returns 400 VALIDATION_ERROR when title or method is missing", async () => {
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1" }) },
      experiment: { create: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/1/experiments").send({ title: "T" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.experiment.create).not.toHaveBeenCalled();
  });

  it("creates an experiment with status PLANNED", async () => {
    const created = { id: "e1", opportunityId: "1", title: "T", method: "M", status: "PLANNED" };
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1" }) },
      experiment: { create: vi.fn().mockResolvedValue(created) },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/1/experiments").send({ title: "T", method: "M" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(prisma.experiment.create).toHaveBeenCalledWith({
      data: { opportunityId: "1", title: "T", method: "M" },
    });
  });
});

describe("PATCH /opportunities/:id/experiments/:experimentId", () => {
  it("returns 404 NOT_FOUND when the experiment doesn't exist or doesn't belong to the opportunity", async () => {
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1/experiments/nope").send({ status: "RUNNING" });

    expect(res.status).toBe(404);
    expect(prisma.experiment.update).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR for an invalid status value", async () => {
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue({ id: "e1", opportunityId: "1" }), update: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1/experiments/e1").send({ status: "NOT_A_STATUS" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.experiment.update).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR when success is not a boolean", async () => {
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue({ id: "e1", opportunityId: "1" }), update: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1/experiments/e1").send({ success: "yes" });

    expect(res.status).toBe(400);
    expect(prisma.experiment.update).not.toHaveBeenCalled();
  });

  it("updates the experiment with valid fields", async () => {
    const updated = { id: "e1", opportunityId: "1", status: "COMPLETE", resultSummary: "Worked", success: true };
    const prisma = {
      experiment: {
        findFirst: vi.fn().mockResolvedValue({ id: "e1", opportunityId: "1" }),
        update: vi.fn().mockResolvedValue(updated),
      },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app)
      .patch("/opportunities/1/experiments/e1")
      .send({ status: "COMPLETE", resultSummary: "Worked", success: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(prisma.experiment.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { status: "COMPLETE", resultSummary: "Worked", success: true },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `npm test`
Expected: FAIL — the routes and `prisma.experiment.*` calls don't exist yet.

- [ ] **Step 3: Modify `server/src/domain/opportunities.ts`**

Add this constant near the top of the file, after `EDITABLE_FIELDS`:

```typescript
const EXPERIMENT_STATUSES = ["PLANNED", "RUNNING", "COMPLETE", "ABANDONED"];

function pickExperimentUpdateFields(body: Record<string, unknown>): { data: Record<string, unknown>; error?: string } {
  const result: Record<string, unknown> = {};
  if ("title" in body) {
    if (typeof body.title !== "string") return { data: {}, error: "title must be a string" };
    result.title = body.title;
  }
  if ("method" in body) {
    if (typeof body.method !== "string") return { data: {}, error: "method must be a string" };
    result.method = body.method;
  }
  if ("status" in body) {
    if (typeof body.status !== "string" || !EXPERIMENT_STATUSES.includes(body.status)) {
      return { data: {}, error: `status must be one of ${EXPERIMENT_STATUSES.join(", ")}` };
    }
    result.status = body.status;
  }
  if ("resultSummary" in body) {
    if (body.resultSummary !== undefined && typeof body.resultSummary !== "string") {
      return { data: {}, error: "resultSummary must be a string" };
    }
    result.resultSummary = body.resultSummary;
  }
  if ("success" in body) {
    if (body.success !== undefined && typeof body.success !== "boolean") {
      return { data: {}, error: "success must be a boolean" };
    }
    result.success = body.success;
  }
  if ("startedAt" in body) {
    if (typeof body.startedAt !== "string") return { data: {}, error: "startedAt must be an ISO date string" };
    result.startedAt = new Date(body.startedAt);
  }
  if ("completedAt" in body) {
    if (typeof body.completedAt !== "string") return { data: {}, error: "completedAt must be an ISO date string" };
    result.completedAt = new Date(body.completedAt);
  }
  return { data: result };
}
```

Add these two routes inside `createOpportunitiesRouter`, after the existing `/:id/report` route, before `return router;`:

```typescript
  router.post(
    "/:id/experiments",
    asyncHandler(async (req, res) => {
      const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.title !== "string" || body.title.trim() === "" || typeof body.method !== "string" || body.method.trim() === "") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "title and method are required" } });
        return;
      }
      const experiment = await prisma.experiment.create({
        data: { opportunityId: req.params.id, title: body.title, method: body.method },
      });
      res.status(201).json(experiment);
    })
  );

  router.patch(
    "/:id/experiments/:experimentId",
    asyncHandler(async (req, res) => {
      const existing = await prisma.experiment.findFirst({
        where: { id: req.params.experimentId, opportunityId: req.params.id },
      });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Experiment not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const picked = pickExperimentUpdateFields(body);
      if (picked.error) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: picked.error } });
        return;
      }
      const updated = await prisma.experiment.update({
        where: { id: req.params.experimentId },
        data: picked.data,
      });
      res.status(200).json(updated);
    })
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/domain/opportunities.ts server/test/domain/opportunities.test.ts
git commit -m "feat(server): add create/update Experiment routes"
```

---

### Task 3: Server — create Learning route + extend `GET /:id` include

**Files:**
- Modify: `server/src/domain/opportunities.ts`
- Modify: `server/test/domain/opportunities.test.ts`

**Interfaces:**
- Consumes: Task 2's experiment routes (same file, no new imports needed).
- Produces: `POST /:id/experiments/:experimentId/learnings` route; `GET /:id` now returns `experiments: [{ ...fields, learnings: [...] }]` alongside `evidence`/`decisions`.

- [ ] **Step 1: Add the failing tests (append to `server/test/domain/opportunities.test.ts`)**

```typescript
describe("POST /opportunities/:id/experiments/:experimentId/learnings", () => {
  it("returns 404 NOT_FOUND when the experiment doesn't exist or doesn't belong to the opportunity", async () => {
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue(null) },
      learning: { create: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app)
      .post("/opportunities/1/experiments/nope/learnings")
      .send({ insight: "Something" });

    expect(res.status).toBe(404);
    expect(prisma.learning.create).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR when insight is missing", async () => {
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue({ id: "e1", opportunityId: "1" }) },
      learning: { create: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/1/experiments/e1/learnings").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.learning.create).not.toHaveBeenCalled();
  });

  it("creates a learning linked to the experiment", async () => {
    const created = { id: "l1", experimentId: "e1", insight: "It worked" };
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue({ id: "e1", opportunityId: "1" }) },
      learning: { create: vi.fn().mockResolvedValue(created) },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app)
      .post("/opportunities/1/experiments/e1/learnings")
      .send({ insight: "It worked" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(prisma.learning.create).toHaveBeenCalledWith({ data: { experimentId: "e1", insight: "It worked" } });
  });
});

describe("GET /opportunities/:id (experiments include)", () => {
  it("includes experiments with nested learnings", async () => {
    const opportunity = {
      id: "1",
      title: "X",
      evidence: [],
      decisions: [],
      experiments: [{ id: "e1", title: "T", learnings: [{ id: "l1", insight: "It worked" }] }],
    };
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(opportunity) } };
    const app = appWithPrisma(prisma);

    const res = await request(app).get("/opportunities/1");

    expect(res.status).toBe(200);
    expect(res.body.experiments).toEqual(opportunity.experiments);
    expect(prisma.opportunity.findUnique).toHaveBeenCalledWith({
      where: { id: "1" },
      include: { evidence: true, decisions: true, experiments: { include: { learnings: true } } },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `npm test`
Expected: FAIL — the learnings route doesn't exist, and `GET /:id`'s include doesn't yet cover experiments.

- [ ] **Step 3: Modify `server/src/domain/opportunities.ts`**

Add this route inside `createOpportunitiesRouter`, after the `/:id/experiments/:experimentId` PATCH route added in Task 2, before `return router;`:

```typescript
  router.post(
    "/:id/experiments/:experimentId/learnings",
    asyncHandler(async (req, res) => {
      const experiment = await prisma.experiment.findFirst({
        where: { id: req.params.experimentId, opportunityId: req.params.id },
      });
      if (!experiment) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Experiment not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.insight !== "string" || body.insight.trim() === "") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "insight is required" } });
        return;
      }
      const learning = await prisma.learning.create({
        data: { experimentId: req.params.experimentId, insight: body.insight },
      });
      res.status(201).json(learning);
    })
  );
```

Find the existing `GET /:id` route (added in Phase 3) and change its `include` from:

```typescript
        include: { evidence: true, decisions: true },
```

to:

```typescript
        include: { evidence: true, decisions: true, experiments: { include: { learnings: true } } },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — including the existing `GET /:id` tests (from Phase 3), which should still pass since they don't assert on the exact `include` shape (only this task's new test does).

- [ ] **Step 5: Commit**

```bash
git add server/src/domain/opportunities.ts server/test/domain/opportunities.test.ts
git commit -m "feat(server): add create Learning route, include experiments/learnings in GET /:id"
```

---

### Task 4: Client — Portfolio view (replaces `OpportunityList`)

**Files:**
- Create: `client/src/pages/Portfolio.tsx`
- Create: `client/src/pages/Portfolio.test.tsx`
- Delete: `client/src/pages/OpportunityList.tsx`
- Delete: `client/src/pages/OpportunityList.test.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/App.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` from `client/src/api.js` (unchanged signature).
- Produces: `Portfolio` default export, mounted at `/` in `App.tsx` in place of `OpportunityList`.

- [ ] **Step 1: Write the failing test `client/src/pages/Portfolio.test.tsx`**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Portfolio from "./Portfolio";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Portfolio", () => {
  it("groups opportunities into sections by status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { id: "1", title: "Discovered One", status: "DISCOVERED", owner: null },
          { id: "2", title: "Qualified One", status: "QUALIFIED", owner: null },
          { id: "3", title: "Discovered Two", status: "DISCOVERED", owner: null },
        ],
      })
    );

    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Discovered One")).toBeInTheDocument());
    expect(screen.getByText("Discovered Two")).toBeInTheDocument();
    expect(screen.getByText("Qualified One")).toBeInTheDocument();

    const discoveredHeading = screen.getByRole("heading", { name: "DISCOVERED" });
    const qualifiedHeading = screen.getByRole("heading", { name: "QUALIFIED" });
    expect(discoveredHeading).toBeInTheDocument();
    expect(qualifiedHeading).toBeInTheDocument();
  });

  it("does not render a heading for a status with no opportunities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: "1", title: "Discovered One", status: "DISCOVERED", owner: null }],
      })
    );

    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Discovered One")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "PROVEN" })).not.toBeInTheDocument();
  });

  it("keeps the + New link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));

    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>
    );

    expect(await screen.findByText("+ New")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `client/`): `npm test`
Expected: FAIL — `./Portfolio` doesn't exist yet.

- [ ] **Step 3: Write `client/src/pages/Portfolio.tsx`**

```typescript
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

const STATUS_ORDER = [
  "DISCOVERED",
  "QUALIFIED",
  "HYPOTHESIS",
  "EXPERIMENT",
  "PROVING",
  "PROVEN",
  "REJECTED",
  "DEFERRED",
  "NO_AI",
] as const;

interface OpportunitySummary {
  id: string;
  title: string;
  status: string;
  owner: string | null;
}

export default function Portfolio() {
  const [opportunities, setOpportunities] = useState<OpportunitySummary[]>([]);

  useEffect(() => {
    apiFetch("/opportunities")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then(setOpportunities)
      .catch(() => setOpportunities([]));
  }, []);

  return (
    <main>
      <h1>AI Accelerator</h1>
      <Link to="/opportunities/new">+ New</Link>
      {STATUS_ORDER.map((status) => {
        const group = opportunities.filter((o) => o.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status}>
            <h2>{status}</h2>
            <ul>
              {group.map((o) => (
                <li key={o.id}>
                  <Link to={`/opportunities/${o.id}`}>{o.title}</Link> — {o.owner ?? "—"}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for `Portfolio.test.tsx`.

- [ ] **Step 5: Delete `client/src/pages/OpportunityList.tsx` and `client/src/pages/OpportunityList.test.tsx`**

- [ ] **Step 6: Modify `client/src/App.tsx`**

Change the import `import OpportunityList from "./pages/OpportunityList";` to `import Portfolio from "./pages/Portfolio";`, and change `<Route path="/" element={<OpportunityList />} />` to `<Route path="/" element={<Portfolio />} />`.

- [ ] **Step 7: Modify `client/src/App.test.tsx`**

This file's existing tests mock `fetch` and check for the text `"+ New"` to confirm the authenticated app rendered (e.g. `"shows the opportunity list once a token is already stored"`, `"logs in successfully and reveals the app"`). Since `Portfolio` also renders `"+ New"`, these assertions keep working unchanged — no edits needed to this file unless running the suite (next step) reveals a mismatch, in which case read the actual failure and fix only what's broken (e.g. if a test's mocked `fetch` response shape needs `status`/`owner` fields that weren't required before — `Portfolio` uses the same `OpportunitySummary` shape as the old `OpportunityList`, so this should not be needed).

- [ ] **Step 8: Run the full client suite**

Run (from `client/`): `npm test`
Expected: PASS — all files, including `App.test.tsx` and `OpportunityDetail.test.tsx`.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/Portfolio.tsx client/src/pages/Portfolio.test.tsx client/src/App.tsx client/src/App.test.tsx
git rm client/src/pages/OpportunityList.tsx client/src/pages/OpportunityList.test.tsx
git commit -m "feat(client): replace OpportunityList with status-grouped Portfolio view"
```

---

### Task 5: Client — `OpportunityDetail` tab shell (Overview/Evidence/Reasoning/Decisions)

**Files:**
- Modify: `client/src/pages/OpportunityDetail.tsx`
- Modify: `client/src/pages/OpportunityDetail.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (unchanged).
- Produces: introduces a `activeTab` state (`"overview" | "evidence" | "reasoning" | "decisions" | "experiments" | "learnings"`) and tab-switch buttons. This task implements the first 4 tabs; Task 6/7 add the Experiments/Learnings tab bodies into the same tab-switch structure.

**Note:** The current page has no hypothesis display/edit control at all (only title, status, evidence, decisions, report). The Reasoning tab in this task ADDS a hypothesis edit field (via `PATCH /opportunities/:id`, reusing the existing pattern from the Overview tab's title, since `hypothesis` is already one of the server's `EDITABLE_FIELDS`) — this is new functionality, not a relocation of pre-existing UI, other than the Report button/display which genuinely does move here from the page bottom.

- [ ] **Step 1: Read the current `client/src/pages/OpportunityDetail.tsx` and `client/src/pages/OpportunityDetail.test.tsx` in full**

Confirm they match the plan's assumptions (title/status/evidence/decisions/report, no hypothesis field) before editing — if either has drifted since this plan was written, treat the live file as authoritative and note the difference in your self-review.

- [ ] **Step 2: Replace `client/src/pages/OpportunityDetail.test.tsx` entirely**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import OpportunityDetail from "./OpportunityDetail";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderAtId(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/opportunities/${id}`]}>
      <Routes>
        <Route path="/opportunities/:id" element={<OpportunityDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

const baseOpportunity = {
  id: "1",
  title: "X",
  status: "DISCOVERED",
  hypothesis: null,
  evidence: [],
  decisions: [],
  experiments: [],
};

describe("OpportunityDetail tabs", () => {
  it("shows the Overview tab by default with tab buttons for all sections", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => baseOpportunity }));

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evidence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reasoning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decisions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Experiments" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Learnings" })).toBeInTheDocument();
  });

  it("switches to the Evidence tab and shows evidence content", async () => {
    const opp = { ...baseOpportunity, evidence: [{ id: "ev1", claim: "A claim", type: "FACT" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => opp }));

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Evidence" }));

    expect(screen.getByText(/A claim/)).toBeInTheDocument();
  });

  it("switches to the Reasoning tab, shows hypothesis and the Generate Report button", async () => {
    const opp = { ...baseOpportunity, hypothesis: "This will save time" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => opp });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reasoning" }));

    expect(screen.getByDisplayValue("This will save time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Report" })).toBeInTheDocument();
  });

  it("switches to the Decisions tab and shows decision content", async () => {
    const opp = { ...baseOpportunity, decisions: [{ id: "d1", decision: "Proceed" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => opp }));

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Decisions" }));

    expect(screen.getByText("Proceed")).toBeInTheDocument();
  });

  it("generates and displays a report from the Reasoning tab", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/report")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ report: "A generated report." }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => baseOpportunity });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reasoning" }));
    fireEvent.click(screen.getByRole("button", { name: /generate report/i }));

    await waitFor(() => expect(screen.getByText("A generated report.")).toBeInTheDocument());
  });

  it("updates the hypothesis field via PATCH", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...baseOpportunity, hypothesis: "New hypothesis" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => baseOpportunity });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reasoning" }));
    fireEvent.change(screen.getByLabelText(/hypothesis/i), { target: { value: "New hypothesis" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from `client/`): `npm test`
Expected: FAIL — no tab buttons exist yet.

- [ ] **Step 4: Replace `client/src/pages/OpportunityDetail.tsx` entirely**

```typescript
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api";

type OpportunityStatus =
  | "DISCOVERED"
  | "QUALIFIED"
  | "HYPOTHESIS"
  | "EXPERIMENT"
  | "PROVING"
  | "PROVEN"
  | "REJECTED"
  | "DEFERRED"
  | "NO_AI";

const TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  DISCOVERED: ["QUALIFIED", "REJECTED"],
  QUALIFIED: ["HYPOTHESIS", "NO_AI", "REJECTED", "DEFERRED"],
  HYPOTHESIS: ["EXPERIMENT", "REJECTED", "DEFERRED"],
  EXPERIMENT: ["PROVING", "REJECTED", "DEFERRED"],
  PROVING: ["PROVEN", "REJECTED"],
  DEFERRED: ["QUALIFIED", "REJECTED"],
  PROVEN: [],
  REJECTED: [],
  NO_AI: [],
};

interface Evidence {
  id: string;
  claim: string;
  type: string;
}

interface Decision {
  id: string;
  decision: string;
}

interface Learning {
  id: string;
  insight: string;
}

interface Experiment {
  id: string;
  title: string;
  method: string;
  status: string;
  resultSummary: string | null;
  success: boolean | null;
  learnings: Learning[];
}

interface OpportunityDetailData {
  id: string;
  title: string;
  status: OpportunityStatus;
  hypothesis: string | null;
  evidence: Evidence[];
  decisions: Decision[];
  experiments: Experiment[];
}

type Tab = "overview" | "evidence" | "reasoning" | "decisions" | "experiments" | "learnings";

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const [opportunity, setOpportunity] = useState<OpportunityDetailData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [claim, setClaim] = useState("");
  const [evidenceType, setEvidenceType] = useState("FACT");
  const [decisionText, setDecisionText] = useState("");
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [hypothesisDraft, setHypothesisDraft] = useState("");

  function reload() {
    apiFetch(`/opportunities/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: OpportunityDetailData) => {
        setOpportunity(data);
        setHypothesisDraft(data.hypothesis ?? "");
      })
      .catch(() => setOpportunity(null));
  }

  useEffect(() => {
    reload();
  }, [id]);

  if (!opportunity) return <main>Loading...</main>;

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const res = await apiFetch(`/opportunities/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: e.target.value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to update status");
      return;
    }
    reload();
  }

  async function handleAddEvidence(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch(`/opportunities/${id}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim, type: evidenceType }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to add evidence");
      return;
    }
    setClaim("");
    reload();
  }

  async function handleAddDecision(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch(`/opportunities/${id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: decisionText }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to add decision");
      return;
    }
    setDecisionText("");
    reload();
  }

  async function handleGenerateReport() {
    setReportLoading(true);
    const res = await apiFetch(`/opportunities/${id}/report`, { method: "POST" });
    setReportLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to generate report");
      return;
    }
    const body = (await res.json()) as { report: string };
    setReport(body.report);
  }

  async function handleSaveHypothesis(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch(`/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hypothesis: hypothesisDraft }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to save hypothesis");
      return;
    }
    reload();
  }

  const nextStatuses = TRANSITIONS[opportunity.status];

  return (
    <main>
      <h1>{opportunity.title}</h1>
      <nav>
        <button onClick={() => setActiveTab("overview")}>Overview</button>
        <button onClick={() => setActiveTab("evidence")}>Evidence</button>
        <button onClick={() => setActiveTab("reasoning")}>Reasoning</button>
        <button onClick={() => setActiveTab("decisions")}>Decisions</button>
        <button onClick={() => setActiveTab("experiments")}>Experiments</button>
        <button onClick={() => setActiveTab("learnings")}>Learnings</button>
      </nav>

      {activeTab === "overview" && (
        <section>
          <label>
            Status
            <select value={opportunity.status} onChange={handleStatusChange}>
              <option value={opportunity.status}>{opportunity.status}</option>
              {nextStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {activeTab === "evidence" && (
        <section>
          <h2>Evidence</h2>
          <ul>
            {opportunity.evidence.map((ev) => (
              <li key={ev.id}>
                [{ev.type}] {ev.claim}
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddEvidence}>
            <input value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="Claim" required />
            <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)}>
              <option value="FACT">FACT</option>
              <option value="INFERENCE">INFERENCE</option>
              <option value="ASSUMPTION">ASSUMPTION</option>
              <option value="AI_HYPOTHESIS">AI_HYPOTHESIS</option>
            </select>
            <button type="submit">Add</button>
          </form>
        </section>
      )}

      {activeTab === "reasoning" && (
        <section>
          <h2>Reasoning</h2>
          <form onSubmit={handleSaveHypothesis}>
            <label>
              Hypothesis
              <textarea value={hypothesisDraft} onChange={(e) => setHypothesisDraft(e.target.value)} />
            </label>
            <button type="submit">Save</button>
          </form>
          <h2>Report</h2>
          <button onClick={handleGenerateReport} disabled={reportLoading}>
            {reportLoading ? "Generating..." : "Generate Report"}
          </button>
          {report && <pre>{report}</pre>}
        </section>
      )}

      {activeTab === "decisions" && (
        <section>
          <h2>Decisions</h2>
          <ul>
            {opportunity.decisions.map((d) => (
              <li key={d.id}>{d.decision}</li>
            ))}
          </ul>
          <form onSubmit={handleAddDecision}>
            <input value={decisionText} onChange={(e) => setDecisionText(e.target.value)} placeholder="Decision" required />
            <button type="submit">Add</button>
          </form>
        </section>
      )}
    </main>
  );
}
```

(Note: this version's `activeTab === "experiments"`/`"learnings"` branches are intentionally left unimplemented — Tasks 6/7 add them. The tab buttons for Experiments/Learnings render now but their sections show nothing yet; this is expected and covered by this task's own tests, which don't yet assert on Experiments/Learnings tab content.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS for `OpportunityDetail.test.tsx`. Confirm the full client suite passes too.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/OpportunityDetail.tsx client/src/pages/OpportunityDetail.test.tsx
git commit -m "feat(client): restructure OpportunityDetail into tabs, add hypothesis editing to Reasoning tab"
```

---

### Task 6: Client — Experiments tab

**Files:**
- Modify: `client/src/pages/OpportunityDetail.tsx`
- Modify: `client/src/pages/OpportunityDetail.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`; the `Experiment` interface already defined in Task 5's version of this file.
- Produces: the `activeTab === "experiments"` section body — Task 7's Learnings tab reads `opportunity.experiments` (already fetched) to populate its experiment-picker dropdown.

- [ ] **Step 1: Add the failing tests (append to `client/src/pages/OpportunityDetail.test.tsx`)**

```typescript
describe("OpportunityDetail Experiments tab", () => {
  it("lists experiments and adds a new one", async () => {
    const opp = {
      ...baseOpportunity,
      experiments: [
        { id: "e1", title: "Try automation", method: "Script the workflow", status: "PLANNED", resultSummary: null, success: null, learnings: [] },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/experiments")) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ id: "e2", title: "New one", method: "M", status: "PLANNED", resultSummary: null, success: null, learnings: [] }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => opp });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Experiments" }));

    expect(screen.getByText("Try automation")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "New one" } });
    fireEvent.change(screen.getByPlaceholderText("Method"), { target: { value: "M" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Experiment" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1/experiments"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("updates an experiment's status via PATCH", async () => {
    const opp = {
      ...baseOpportunity,
      experiments: [
        { id: "e1", title: "Try automation", method: "Script it", status: "PLANNED", resultSummary: null, success: null, learnings: [] },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH" && url.includes("/experiments/e1")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...opp.experiments[0], status: "RUNNING" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => opp });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Experiments" }));
    fireEvent.change(screen.getByLabelText(/experiment status/i), { target: { value: "RUNNING" } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1/experiments/e1"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `client/`): `npm test`
Expected: FAIL — the Experiments tab body doesn't exist yet.

- [ ] **Step 3: Modify `client/src/pages/OpportunityDetail.tsx`**

Add two new state variables alongside the existing ones:

```typescript
  const [experimentTitle, setExperimentTitle] = useState("");
  const [experimentMethod, setExperimentMethod] = useState("");
```

Add two new handlers, alongside the existing ones:

```typescript
  async function handleAddExperiment(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch(`/opportunities/${id}/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: experimentTitle, method: experimentMethod }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to add experiment");
      return;
    }
    setExperimentTitle("");
    setExperimentMethod("");
    reload();
  }

  async function handleExperimentStatusChange(experimentId: string, status: string) {
    const res = await apiFetch(`/opportunities/${id}/experiments/${experimentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to update experiment");
      return;
    }
    reload();
  }
```

Replace the empty `{activeTab === "experiments" && ( ... )}` placeholder region (there isn't one in Task 5's code — insert this new block right after the `{activeTab === "decisions" && ( ... )}` section, before the closing `</main>`):

```tsx
      {activeTab === "experiments" && (
        <section>
          <h2>Experiments</h2>
          <ul>
            {opportunity.experiments.map((exp) => (
              <li key={exp.id}>
                <strong>{exp.title}</strong> — {exp.method}
                <label>
                  Experiment status
                  <select
                    value={exp.status}
                    onChange={(e) => handleExperimentStatusChange(exp.id, e.target.value)}
                  >
                    <option value="PLANNED">PLANNED</option>
                    <option value="RUNNING">RUNNING</option>
                    <option value="COMPLETE">COMPLETE</option>
                    <option value="ABANDONED">ABANDONED</option>
                  </select>
                </label>
                {exp.resultSummary && <p>{exp.resultSummary}</p>}
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddExperiment}>
            <input value={experimentTitle} onChange={(e) => setExperimentTitle(e.target.value)} placeholder="Title" required />
            <input value={experimentMethod} onChange={(e) => setExperimentMethod(e.target.value)} placeholder="Method" required />
            <button type="submit">Add Experiment</button>
          </form>
        </section>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/OpportunityDetail.tsx client/src/pages/OpportunityDetail.test.tsx
git commit -m "feat(client): add Experiments tab to OpportunityDetail"
```

---

### Task 7: Client — Learnings tab

**Files:**
- Modify: `client/src/pages/OpportunityDetail.tsx`
- Modify: `client/src/pages/OpportunityDetail.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`; `opportunity.experiments` (populated by Task 6/5's fetch, already includes nested `learnings`).

- [ ] **Step 1: Add the failing tests (append to `client/src/pages/OpportunityDetail.test.tsx`)**

```typescript
describe("OpportunityDetail Learnings tab", () => {
  it("lists learnings across experiments and adds a new one", async () => {
    const opp = {
      ...baseOpportunity,
      experiments: [
        { id: "e1", title: "Try automation", method: "Script it", status: "COMPLETE", resultSummary: "Worked", success: true, learnings: [{ id: "l1", insight: "Automation saves 2 days" }] },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/learnings")) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: "l2", experimentId: "e1", insight: "New insight" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => opp });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Learnings" }));

    expect(screen.getByText(/Automation saves 2 days/)).toBeInTheDocument();
    expect(screen.getByText(/Try automation/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/experiment/i), { target: { value: "e1" } });
    fireEvent.change(screen.getByPlaceholderText("Insight"), { target: { value: "New insight" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Learning" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1/experiments/e1/learnings"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("hides the add-learning form when there are no experiments yet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => baseOpportunity }));

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Learnings" }));

    expect(screen.queryByPlaceholderText("Insight")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `client/`): `npm test`
Expected: FAIL — the Learnings tab body doesn't exist yet.

- [ ] **Step 3: Modify `client/src/pages/OpportunityDetail.tsx`**

Add two new state variables:

```typescript
  const [learningExperimentId, setLearningExperimentId] = useState("");
  const [learningInsight, setLearningInsight] = useState("");
```

Add a new handler:

```typescript
  async function handleAddLearning(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch(`/opportunities/${id}/experiments/${learningExperimentId}/learnings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insight: learningInsight }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to add learning");
      return;
    }
    setLearningInsight("");
    reload();
  }
```

Add this block right after the `{activeTab === "experiments" && ( ... )}` section from Task 6, before the closing `</main>`:

```tsx
      {activeTab === "learnings" && (
        <section>
          <h2>Learnings</h2>
          <ul>
            {opportunity.experiments.flatMap((exp) =>
              exp.learnings.map((l) => (
                <li key={l.id}>
                  {l.insight} <em>({exp.title})</em>
                </li>
              ))
            )}
          </ul>
          {opportunity.experiments.length > 0 && (
            <form onSubmit={handleAddLearning}>
              <label>
                Experiment
                <select value={learningExperimentId} onChange={(e) => setLearningExperimentId(e.target.value)} required>
                  <option value="">Select an experiment</option>
                  {opportunity.experiments.map((exp) => (
                    <option key={exp.id} value={exp.id}>
                      {exp.title}
                    </option>
                  ))}
                </select>
              </label>
              <input value={learningInsight} onChange={(e) => setLearningInsight(e.target.value)} placeholder="Insight" required />
              <button type="submit">Add Learning</button>
            </form>
          )}
        </section>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — run the full client suite to confirm no regressions across all `OpportunityDetail.test.tsx` cases (Tasks 5, 6, 7's tests all together) and `Portfolio.test.tsx`/`App.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/OpportunityDetail.tsx client/src/pages/OpportunityDetail.test.tsx
git commit -m "feat(client): add Learnings tab to OpportunityDetail"
```

---

### Task 8: final validation against the Definition of Done

**Files:** none created — verification only.

- [ ] **Step 1: Full test suites**

Run (from `server/`): `npm test` — confirm all pass.
Run (from `client/`): `npm test` — confirm all pass.

- [ ] **Step 2: Lint**

Run (from `server/`): `npm run lint`
Run (from `client/`): `npm run lint`
Expected: both clean.

- [ ] **Step 3: Clean rebuild and migration verification**

Run (from repo root, with `.env` populated as established in Phase 4): `docker compose down -v && docker compose build --no-cache && docker compose up -d`.
Run: `docker compose ps` — confirm `postgres`/`server`/`client` healthy. Since the server's `CMD` runs `npx prisma migrate deploy` on startup, confirm the server container's logs show the new `add_experiment_and_learning` migration applied cleanly: `docker compose logs server | grep -i migrat`.

- [ ] **Step 4: Manual end-to-end walkthrough**

Log in, create a test opportunity via curl or the UI, add an experiment, mark it COMPLETE with a result summary, add a learning to it, confirm the Portfolio view groups it under the correct status section, and confirm the Learnings tab shows the learning tagged with its experiment's title. State explicitly whether this was done via a real browser or via curl (matching the precedent from Phases 3/4).

- [ ] **Step 5: Tear down cleanly**

Run: `docker compose down`

- [ ] **Step 6: Update `docs/IMPLEMENTATION_STATUS.md`**

Add a new section after the Phase 4 section:

```markdown
## Frontend Operational Views — Experiment/Learning + Portfolio/Tabs (complete)

- [x] Experiment/Learning Prisma models, migrated
- [x] POST/PATCH experiment routes, POST learning route, GET /opportunities/:id includes both
- [x] Portfolio view groups opportunities by status
- [x] OpportunityDetail restructured into 6 tabs (Overview/Evidence/Reasoning/Decisions/Experiments/Learnings)
- [x] Hypothesis field is now editable (previously had no UI at all)
```

- [ ] **Step 7: Tear down cleanly (if re-brought-up during Step 4)**

Run: `docker compose down` (idempotent if already down from Step 5).

- [ ] **Step 8: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "docs: mark Frontend Operational Views (Experiment/Learning + Portfolio/tabs) complete"
```
