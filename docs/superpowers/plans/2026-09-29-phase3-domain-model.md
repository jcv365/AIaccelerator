# AI Accelerator — Phase 3: Core Domain Model + Minimal UI + API Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI Accelerator genuinely usable: Prisma-backed Opportunity/Evidence/Decision domain model with a server-enforced state machine, a REST API, a required shared API key protecting every non-health route (including Phase 2's `/ai/*` routes), and three bare-bones React screens.

**Architecture:** Prisma against the existing Postgres. Domain logic (state machine, request validation) lives in small pure modules; routes are thin Express handlers wrapped in a shared `asyncHandler` so thrown/rejected errors always reach `next(err)` (Express 4 doesn't auto-catch async rejections — established pattern from Phase 2). A single `requireAccelApiKey` middleware, mounted after the existing health routes and before everything else, gates the whole API with one shared secret. Frontend gets React Router and three plain-HTML pages calling a small `api.ts` fetch wrapper.

**Tech Stack:** Node.js 20 + TypeScript (existing server), Prisma + `@prisma/client`, Express 4, Vitest + Supertest (existing patterns), React 18 + Vite + `react-router-dom` (client).

**Spec:** `docs/superpowers/specs/2026-09-29-phase3-domain-model-design.md`

## Global Constraints

- Entities: `Opportunity`, `Evidence`, `Decision` only — no `Experiment`/`Learning`, no Evidence↔Decision join table (deferred).
- State machine exactly as specified: `DISCOVERED→QUALIFIED|REJECTED`, `QUALIFIED→HYPOTHESIS|NO_AI|REJECTED|DEFERRED`, `HYPOTHESIS→EXPERIMENT|REJECTED|DEFERRED`, `EXPERIMENT→PROVING|REJECTED|DEFERRED`, `PROVING→PROVEN|REJECTED`, `DEFERRED→QUALIFIED|REJECTED`, `PROVEN`/`REJECTED`/`NO_AI` terminal.
- `ACCELERATOR_API_KEY` is required at startup (fail-fast, like `DATABASE_URL`/`PORT`) and protects every route except `/health`, `/ready`, `/version`.
- Error contract unchanged: `{ error: { code, message } }`. New codes: `VALIDATION_ERROR` (400), `INVALID_TRANSITION` (400), `NOT_FOUND` (404), `UNAUTHORIZED` (401).
- No AI wiring in this phase — nothing here calls Phase 2's `AiClient`.
- No CSS framework, no component library, no responsive/accessibility pass — plain HTML only.

---

### Task 1: Prisma setup — schema, client, Docker wiring

**Files:**
- Create: `server/prisma/schema.prisma`
- Create: `server/src/db/prisma.ts`
- Modify: `server/package.json`
- Modify: `server/Dockerfile`
- Modify: `server/.dockerignore`

**Interfaces:**
- Produces: `export function createPrismaClient(): PrismaClient` from `server/src/db/prisma.ts` — Task 8 imports this into `index.ts`.

- [ ] **Step 1: Write `server/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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
  excerpt       String?
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

- [ ] **Step 2: Add Prisma to `server/package.json`**

Add to `dependencies`: `"@prisma/client": "^5.19.0"`, `"prisma": "^5.19.0"` (the CLI is a production dependency here, not dev-only — the Docker runtime image needs `npx prisma migrate deploy` at startup). Add to `scripts`: `"prisma:migrate": "prisma migrate dev"`, `"prisma:generate": "prisma generate"`.

- [ ] **Step 3: Write `server/src/db/prisma.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}
```

- [ ] **Step 4: Install and generate the initial migration**

Run (from `server/`): `npm install`
Run: `npx prisma generate`

This requires a reachable Postgres to create the migration SQL. Bring one up: from the repo root, `docker compose up -d postgres`. Then (from `server/`), with `DATABASE_URL` pointing at the mapped host port (check `docker-compose.yml` for the current mapping — Phase 1 mapped it to `5434`, confirm the actual value there):

```bash
DATABASE_URL=postgres://accelerator:accelerator@localhost:5434/accelerator npx prisma migrate dev --name init
```

Expected: creates `server/prisma/migrations/<timestamp>_init/migration.sql` and applies it. Commit the generated migration files — they're the source of truth for `migrate deploy` in Docker.

- [ ] **Step 5: Modify `server/Dockerfile`**

The build stage needs to run `prisma generate` (it needs `schema.prisma` copied in before `npm run build`, since the generated client is a build dependency of the TypeScript compile). Add after the existing `COPY src ./src` line and before `RUN npm run build`:

```dockerfile
COPY prisma ./prisma
RUN npx prisma generate
```

The runtime stage also needs `prisma/` (for `migrate deploy` to find the migration files) and needs to run migrations before starting the server. Add `COPY prisma ./prisma` to the runtime stage alongside the existing `COPY --from=build /app/dist ./dist`, and change the final `CMD` from `["node", "dist/index.js"]` to:

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```

- [ ] **Step 6: Modify `server/.dockerignore`**

Confirm `prisma/migrations` is NOT excluded (the existing `.dockerignore` excludes `node_modules`, `dist`, `*.log`, `.env`, `test` — none of these match `prisma/`, so no change should be needed; verify this explicitly and only edit if something unexpectedly excludes it).

- [ ] **Step 7: Verify the build**

Run (from `server/`): `docker build -t aiaccelerator-server-test .`
Expected: builds successfully, including the `prisma generate` step.

- [ ] **Step 8: Commit**

```bash
git add server/prisma server/src/db/prisma.ts server/package.json server/package-lock.json server/Dockerfile server/.dockerignore
git commit -m "feat(server): add Prisma schema, client, and initial migration"
```

---

### Task 2: state machine module

**Files:**
- Create: `server/src/domain/stateMachine.ts`
- Test: `server/test/domain/stateMachine.test.ts`

**Interfaces:**
- Produces: `export type OpportunityStatus = "DISCOVERED" | "QUALIFIED" | "HYPOTHESIS" | "EXPERIMENT" | "PROVING" | "PROVEN" | "REJECTED" | "DEFERRED" | "NO_AI"`, `export function isValidTransition(from: OpportunityStatus, to: OpportunityStatus): boolean`, `export function validTransitionsFrom(status: OpportunityStatus): OpportunityStatus[]` — Task 6's status route imports these.

- [ ] **Step 1: Write the failing test `server/test/domain/stateMachine.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { isValidTransition, validTransitionsFrom } from "../../src/domain/stateMachine.js";

describe("state machine", () => {
  it("allows DISCOVERED to QUALIFIED", () => {
    expect(isValidTransition("DISCOVERED", "QUALIFIED")).toBe(true);
  });

  it("allows DISCOVERED to REJECTED", () => {
    expect(isValidTransition("DISCOVERED", "REJECTED")).toBe(true);
  });

  it("rejects DISCOVERED to PROVEN directly", () => {
    expect(isValidTransition("DISCOVERED", "PROVEN")).toBe(false);
  });

  it("allows the full happy path QUALIFIED->HYPOTHESIS->EXPERIMENT->PROVING->PROVEN", () => {
    expect(isValidTransition("QUALIFIED", "HYPOTHESIS")).toBe(true);
    expect(isValidTransition("HYPOTHESIS", "EXPERIMENT")).toBe(true);
    expect(isValidTransition("EXPERIMENT", "PROVING")).toBe(true);
    expect(isValidTransition("PROVING", "PROVEN")).toBe(true);
  });

  it("allows DEFERRED back to QUALIFIED", () => {
    expect(isValidTransition("DEFERRED", "QUALIFIED")).toBe(true);
  });

  it("treats PROVEN, REJECTED, and NO_AI as terminal", () => {
    expect(validTransitionsFrom("PROVEN")).toEqual([]);
    expect(validTransitionsFrom("REJECTED")).toEqual([]);
    expect(validTransitionsFrom("NO_AI")).toEqual([]);
  });

  it("returns the exact valid-transitions list for QUALIFIED", () => {
    expect(validTransitionsFrom("QUALIFIED")).toEqual(["HYPOTHESIS", "NO_AI", "REJECTED", "DEFERRED"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `server/`): `npm test`
Expected: FAIL — `../../src/domain/stateMachine.js` does not exist.

- [ ] **Step 3: Write `server/src/domain/stateMachine.ts`**

```typescript
export type OpportunityStatus =
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

export function isValidTransition(from: OpportunityStatus, to: OpportunityStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function validTransitionsFrom(status: OpportunityStatus): OpportunityStatus[] {
  return TRANSITIONS[status];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/domain/stateMachine.ts server/test/domain/stateMachine.test.ts
git commit -m "feat(server): add opportunity state machine"
```

---

### Task 3: asyncHandler utility + API key auth middleware

**Files:**
- Create: `server/src/asyncHandler.ts`
- Create: `server/src/auth.ts`
- Test: `server/test/auth.test.ts`
- Modify: `server/src/config.ts`
- Modify: `server/test/config.test.ts`

**Interfaces:**
- Produces: `export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler` from `server/src/asyncHandler.ts`; `export function requireAccelApiKey(expectedKey: string): RequestHandler` from `server/src/auth.ts`; `AppConfig.acceleratorApiKey: string` (required) — Task 4 wires the middleware into `app.ts`, Task 5+ use `asyncHandler` in route handlers.

- [ ] **Step 1: Write the failing test `server/test/auth.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { requireAccelApiKey } from "../src/auth.js";

function appWithAuth(expectedKey: string) {
  const app = express();
  app.use(requireAccelApiKey(expectedKey));
  app.get("/protected", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("requireAccelApiKey", () => {
  it("returns 401 when the header is missing", async () => {
    const app = appWithAuth("correct-key");

    const res = await request(app).get("/protected");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
  });

  it("returns 401 when the header is wrong", async () => {
    const app = appWithAuth("correct-key");

    const res = await request(app).get("/protected").set("X-API-Key", "wrong-key");

    expect(res.status).toBe(401);
  });

  it("allows the request through when the header matches", async () => {
    const app = appWithAuth("correct-key");

    const res = await request(app).get("/protected").set("X-API-Key", "correct-key");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `server/`): `npm test`
Expected: FAIL — `../src/auth.js` does not exist.

- [ ] **Step 3: Write `server/src/asyncHandler.ts`**

```typescript
import type { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
```

- [ ] **Step 4: Write `server/src/auth.ts`**

```typescript
import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export function requireAccelApiKey(expectedKey: string): RequestHandler {
  const expectedBuf = Buffer.from(expectedKey);

  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = req.header("X-API-Key") ?? "";
    const providedBuf = Buffer.from(provided);
    const isValid = providedBuf.length === expectedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

    if (!isValid) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid X-API-Key" } });
      return;
    }
    next();
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Add `ACCELERATOR_API_KEY` to config (add to existing `server/test/config.test.ts`)**

Add this test inside the existing `describe("loadConfig", ...)` block:

```typescript
  it("throws a clear error when ACCELERATOR_API_KEY is missing", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://u:p@h:5432/d", PORT: "4000" })
    ).toThrowError("Missing required environment variable: ACCELERATOR_API_KEY");
  });
```

Update the existing "returns a parsed config when all required vars are present" test to also pass `ACCELERATOR_API_KEY: "test-key"` in its input and expect `acceleratorApiKey: "test-key"` in the returned object.

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `ACCELERATOR_API_KEY` isn't required yet.

- [ ] **Step 8: Modify `server/src/config.ts`**

Add `acceleratorApiKey: string;` to the `AppConfig` interface. In `loadConfig`, add `const acceleratorApiKey = requireEnv(env, "ACCELERATOR_API_KEY");` alongside the existing `databaseUrl`/`port` calls, and include it in the returned object.

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add server/src/asyncHandler.ts server/src/auth.ts server/test/auth.test.ts server/src/config.ts server/test/config.test.ts
git commit -m "feat(server): add asyncHandler utility and required API key auth"
```

---

### Task 4: wire auth middleware into `app.ts`, extend `AppDeps`

**Files:**
- Modify: `server/src/app.ts`
- Test: `server/test/authWiring.test.ts`

**Interfaces:**
- Consumes: `requireAccelApiKey` from Task 3's `server/src/auth.js`.
- Produces: `AppDeps.acceleratorApiKey: string` (required, not optional — every test/caller of `createApp` must now supply it), `AppDeps.prisma?: PrismaClient` (optional for now — Task 8 makes it effectively required by always constructing one in `index.ts`, but keeping the type optional here means Tasks 5-7's route tests can inject a mock without importing the real Prisma type chain).

**IMPORTANT:** adding a required `acceleratorApiKey` field to `AppDeps` means every existing test file that calls `createApp({...})` needs updating to include it (`server/test/health.test.ts`, `server/test/ready.test.ts`, `server/test/version.test.ts`, `server/test/errors.test.ts`, `server/test/ai/routes.test.ts`) — the app will fail to construct correctly otherwise. Use `"test-key"` as the value in all of them, and update `server/test/ai/routes.test.ts`'s requests to also `.set("X-API-Key", "test-key")` since `/ai/quick`/`/ai/session` are now gated too.

- [ ] **Step 1: Write the failing test `server/test/authWiring.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

const fakePool = {} as Pool;

describe("API key gating", () => {
  it("does not require a key for /health", async () => {
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test", acceleratorApiKey: "secret" });

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
  });

  it("does not require a key for /ready", async () => {
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test", acceleratorApiKey: "secret" });

    const res = await request(app).get("/ready");

    expect(res.status).not.toBe(401);
  });

  it("does not require a key for /version", async () => {
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test", acceleratorApiKey: "secret" });

    const res = await request(app).get("/version");

    expect(res.status).toBe(200);
  });

  it("requires a key for /ai/quick", async () => {
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test", acceleratorApiKey: "secret" });

    const res = await request(app).post("/ai/quick").send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(401);
  });

  it("allows /ai/quick through with the right key (still 503 AI_NOT_CONFIGURED since no aiClient)", async () => {
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test", acceleratorApiKey: "secret" });

    const res = await request(app)
      .post("/ai/quick")
      .set("X-API-Key", "secret")
      .send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `server/`): `npm test`
Expected: FAIL — `AppDeps` has no `acceleratorApiKey` field yet (TypeScript error), and no auth gating exists.

- [ ] **Step 3: Modify `server/src/app.ts`**

Add the import: `import { requireAccelApiKey } from "./auth.js";`

Add `acceleratorApiKey: string;` and `prisma?: import("@prisma/client").PrismaClient;` to the `AppDeps` interface.

Insert `app.use(requireAccelApiKey(deps.acceleratorApiKey));` immediately after the existing `/version` route and before the `/ai/quick` route (so `/health`, `/ready`, `/version` remain unauthenticated, and everything registered after this line — `/ai/quick`, `/ai/session`, and Task 8's `/opportunities` router — requires the key).

- [ ] **Step 4: Update the 5 existing test files to supply `acceleratorApiKey`**

In `server/test/health.test.ts`, `server/test/ready.test.ts`, `server/test/version.test.ts`, `server/test/errors.test.ts`, and `server/test/ai/routes.test.ts`: every call to `createApp({...})` needs `acceleratorApiKey: "test-key"` added to the deps object. In `server/test/ai/routes.test.ts` specifically, every `request(app).post("/ai/quick")` / `request(app).post("/ai/session")` call needs `.set("X-API-Key", "test-key")` added before `.send(...)`.

- [ ] **Step 5: Run the FULL test suite to verify everything passes**

Run: `npm test`
Expected: PASS — all prior tests (Phase 1 + Phase 2) plus this task's new tests, with none broken by the `AppDeps` signature change.

- [ ] **Step 6: Commit**

```bash
git add server/src/app.ts server/test/authWiring.test.ts server/test/health.test.ts server/test/ready.test.ts server/test/version.test.ts server/test/errors.test.ts server/test/ai/routes.test.ts
git commit -m "feat(server): gate all non-health routes behind ACCELERATOR_API_KEY"
```

---

### Task 5: opportunities router — list, create, get, update

**Files:**
- Create: `server/src/domain/opportunities.ts`
- Test: `server/test/domain/opportunities.test.ts`

**Interfaces:**
- Consumes: `asyncHandler` from Task 3's `server/src/asyncHandler.js`.
- Produces: `export function createOpportunitiesRouter(prisma: PrismaClient): Router` — Task 6 and Task 7 ADD routes to this same router (modify this file), Task 8 mounts it in `app.ts`.

- [ ] **Step 1: Write the failing tests `server/test/domain/opportunities.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createOpportunitiesRouter } from "../../src/domain/opportunities.js";

function appWithPrisma(prisma: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/opportunities", createOpportunitiesRouter(prisma as never));
  return app;
}

describe("GET /opportunities", () => {
  it("returns the list ordered newest first", async () => {
    const prisma = {
      opportunity: {
        findMany: vi.fn().mockResolvedValue([{ id: "1", title: "A" }]),
      },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).get("/opportunities");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "1", title: "A" }]);
    expect(prisma.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
  });
});

describe("POST /opportunities", () => {
  it("returns 400 VALIDATION_ERROR when title is missing", async () => {
    const prisma = { opportunity: { create: vi.fn() } };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.opportunity.create).not.toHaveBeenCalled();
  });

  it("creates an opportunity and returns 201", async () => {
    const created = { id: "1", title: "New idea", status: "DISCOVERED" };
    const prisma = { opportunity: { create: vi.fn().mockResolvedValue(created) } };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities").send({ title: "New idea" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });
});

describe("GET /opportunities/:id", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null) } };
    const app = appWithPrisma(prisma);

    const res = await request(app).get("/opportunities/nope");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns the opportunity with nested evidence/decisions", async () => {
    const found = { id: "1", title: "A", evidence: [], decisions: [] };
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(found) } };
    const app = appWithPrisma(prisma);

    const res = await request(app).get("/opportunities/1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(found);
    expect(prisma.opportunity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "1" }, include: { evidence: true, decisions: true } })
    );
  });
});

describe("PATCH /opportunities/:id", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/nope").send({ title: "X" });

    expect(res.status).toBe(404);
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it("updates and returns the opportunity", async () => {
    const updated = { id: "1", title: "Updated" };
    const prisma = {
      opportunity: {
        findUnique: vi.fn().mockResolvedValue({ id: "1", title: "Old" }),
        update: vi.fn().mockResolvedValue(updated),
      },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1").send({ title: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `npm test`
Expected: FAIL — `../../src/domain/opportunities.js` does not exist.

- [ ] **Step 3: Write `server/src/domain/opportunities.ts`**

```typescript
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../asyncHandler.js";

const EDITABLE_FIELDS = [
  "title",
  "description",
  "businessProblem",
  "potentialValue",
  "complexity",
  "dependencies",
  "aiSuitability",
  "risks",
  "owner",
  "hypothesis",
] as const;

function pickEditableFields(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) result[field] = body[field];
  }
  return result;
}

export function createOpportunitiesRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const opportunities = await prisma.opportunity.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { evidence: true, decisions: true } } },
      });
      res.status(200).json(opportunities);
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.title !== "string" || body.title.trim() === "") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "title is required" } });
        return;
      }
      const opportunity = await prisma.opportunity.create({
        data: pickEditableFields(body) as { title: string },
      });
      res.status(201).json(opportunity);
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: req.params.id },
        include: { evidence: true, decisions: true },
      });
      if (!opportunity) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      res.status(200).json(opportunity);
    })
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const updated = await prisma.opportunity.update({
        where: { id: req.params.id },
        data: pickEditableFields(body),
      });
      res.status(200).json(updated);
    })
  );

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/domain/opportunities.ts server/test/domain/opportunities.test.ts
git commit -m "feat(server): add opportunities router (list/create/get/update)"
```

---

### Task 6: opportunity status transition route

**Files:**
- Modify: `server/src/domain/opportunities.ts`
- Modify: `server/test/domain/opportunities.test.ts`

**Interfaces:**
- Consumes: `isValidTransition`, `validTransitionsFrom`, `OpportunityStatus` from Task 2's `server/src/domain/stateMachine.js`.

- [ ] **Step 1: Add the failing tests (append to `server/test/domain/opportunities.test.ts`)**

```typescript
describe("PATCH /opportunities/:id/status", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/nope/status").send({ status: "QUALIFIED" });

    expect(res.status).toBe(404);
  });

  it("returns 400 INVALID_TRANSITION for an illegal jump", async () => {
    const prisma = {
      opportunity: {
        findUnique: vi.fn().mockResolvedValue({ id: "1", status: "DISCOVERED" }),
        update: vi.fn(),
      },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1/status").send({ status: "PROVEN" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it("applies a valid transition", async () => {
    const updated = { id: "1", status: "QUALIFIED" };
    const prisma = {
      opportunity: {
        findUnique: vi.fn().mockResolvedValue({ id: "1", status: "DISCOVERED" }),
        update: vi.fn().mockResolvedValue(updated),
      },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1/status").send({ status: "QUALIFIED" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(prisma.opportunity.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { status: "QUALIFIED" },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `npm test`
Expected: FAIL — the `/status` route doesn't exist yet.

- [ ] **Step 3: Modify `server/src/domain/opportunities.ts`**

Add the import: `import { isValidTransition, validTransitionsFrom, type OpportunityStatus } from "./stateMachine.js";`

Add this route inside `createOpportunitiesRouter`, after the `PATCH /:id` route, before `return router;`:

```typescript
  router.patch(
    "/:id/status",
    asyncHandler(async (req, res) => {
      const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      const { status } = (req.body ?? {}) as { status?: unknown };
      const currentStatus = existing.status as OpportunityStatus;
      if (typeof status !== "string" || !isValidTransition(currentStatus, status as OpportunityStatus)) {
        const valid = validTransitionsFrom(currentStatus);
        res.status(400).json({
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot transition from ${currentStatus} to ${String(status)}. Valid: ${
              valid.join(", ") || "none (terminal)"
            }`,
          },
        });
        return;
      }
      const updated = await prisma.opportunity.update({
        where: { id: req.params.id },
        data: { status: status as OpportunityStatus },
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
git commit -m "feat(server): add validated status transition route"
```

---

### Task 7: evidence and decision routes

**Files:**
- Modify: `server/src/domain/opportunities.ts`
- Modify: `server/test/domain/opportunities.test.ts`

**Interfaces:** none new — both routes are added to the same router from Tasks 5/6.

- [ ] **Step 1: Add the failing tests (append to `server/test/domain/opportunities.test.ts`)**

```typescript
describe("POST /opportunities/:id/evidence", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null) }, evidence: { create: vi.fn() } };
    const app = appWithPrisma(prisma);

    const res = await request(app)
      .post("/opportunities/nope/evidence")
      .send({ claim: "x", type: "FACT" });

    expect(res.status).toBe(404);
  });

  it("returns 400 VALIDATION_ERROR for an invalid type", async () => {
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1" }) },
      evidence: { create: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app)
      .post("/opportunities/1/evidence")
      .send({ claim: "x", type: "NOT_A_TYPE" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.evidence.create).not.toHaveBeenCalled();
  });

  it("creates evidence and returns 201", async () => {
    const created = { id: "e1", claim: "x", type: "FACT" };
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1" }) },
      evidence: { create: vi.fn().mockResolvedValue(created) },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/1/evidence").send({ claim: "x", type: "FACT" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });
});

describe("POST /opportunities/:id/decisions", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null) }, decision: { create: vi.fn() } };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/nope/decisions").send({ decision: "Proceed" });

    expect(res.status).toBe(404);
  });

  it("returns 400 VALIDATION_ERROR when decision text is missing", async () => {
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1" }) },
      decision: { create: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/1/decisions").send({});

    expect(res.status).toBe(400);
    expect(prisma.decision.create).not.toHaveBeenCalled();
  });

  it("creates a decision and returns 201", async () => {
    const created = { id: "d1", decision: "Proceed" };
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1" }) },
      decision: { create: vi.fn().mockResolvedValue(created) },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/1/decisions").send({ decision: "Proceed" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `npm test`
Expected: FAIL — the evidence/decision routes don't exist yet.

- [ ] **Step 3: Modify `server/src/domain/opportunities.ts`**

Add these two routes inside `createOpportunitiesRouter`, after the `/status` route, before `return router;`:

```typescript
  const EVIDENCE_TYPES = ["FACT", "INFERENCE", "ASSUMPTION", "AI_HYPOTHESIS"];

  router.post(
    "/:id/evidence",
    asyncHandler(async (req, res) => {
      const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.claim !== "string" || body.claim.trim() === "" || !EVIDENCE_TYPES.includes(body.type as string)) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "claim is required and type must be one of FACT, INFERENCE, ASSUMPTION, AI_HYPOTHESIS",
          },
        });
        return;
      }
      const evidence = await prisma.evidence.create({
        data: {
          opportunityId: req.params.id,
          claim: body.claim,
          type: body.type as string,
          confidence: body.confidence as number | undefined,
          source: body.source as string | undefined,
          location: body.location as string | undefined,
          excerpt: body.excerpt as string | undefined,
        } as never,
      });
      res.status(201).json(evidence);
    })
  );

  router.post(
    "/:id/decisions",
    asyncHandler(async (req, res) => {
      const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.decision !== "string" || body.decision.trim() === "") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "decision is required" } });
        return;
      }
      const decision = await prisma.decision.create({
        data: {
          opportunityId: req.params.id,
          decision: body.decision,
          rationale: body.rationale as string | undefined,
          assumptions: body.assumptions as string | undefined,
          confidence: body.confidence as number | undefined,
          alternativesConsidered: body.alternativesConsidered as string | undefined,
          risks: body.risks as string | undefined,
          owner: body.owner as string | undefined,
        } as never,
      });
      res.status(201).json(decision);
    })
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/domain/opportunities.ts server/test/domain/opportunities.test.ts
git commit -m "feat(server): add evidence and decision routes"
```

---

### Task 8: mount the opportunities router, construct Prisma client, update config docs

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/index.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `createOpportunitiesRouter` from Task 7's `server/src/domain/opportunities.js`, `createPrismaClient` from Task 1's `server/src/db/prisma.js`.

- [ ] **Step 1: Modify `server/src/app.ts`**

Add the import: `import { createOpportunitiesRouter } from "./domain/opportunities.js";`

After the `requireAccelApiKey` middleware and the existing `/ai/session` route, before the 404 handler, add:

```typescript
  if (deps.prisma) {
    app.use("/opportunities", createOpportunitiesRouter(deps.prisma));
  }
```

(Guarding on `deps.prisma` being present keeps every existing test — which doesn't pass a `prisma` dep — working unchanged; `index.ts` in Step 2 always constructs one for the real server.)

- [ ] **Step 2: Modify `server/src/index.ts`**

Add the import: `import { createPrismaClient } from "./db/prisma.js";`

Before the `createApp({...})` call, add: `const prisma = createPrismaClient();`

Add `prisma` as a fifth property in the `createApp` deps object.

- [ ] **Step 3: Modify `.env.example`**

Add, alongside the existing `DATABASE_URL`/`PORT` in the "Required" section:

```dotenv
# Generate with: openssl rand -hex 32 (or any long random string) — do not use a placeholder value.
ACCELERATOR_API_KEY=
```

- [ ] **Step 4: Modify `docker-compose.yml`**

In the `server` service's `environment:` block, add: `ACCELERATOR_API_KEY: ${ACCELERATOR_API_KEY}` (no default — it's required, so an unset `.env` value should surface as the server's own fail-fast error, not a silently-empty string).

- [ ] **Step 5: Run the full suite and verify a real build**

Run (from `server/`): `npm test` — confirm all tests still pass.
Run (from repo root): `cp .env.example .env` then edit `.env` to set a real `ACCELERATOR_API_KEY` value (e.g. `ACCELERATOR_API_KEY=dev-local-key-change-me`) and `docker compose up -d --build`.
Run: `docker compose ps` — confirm `postgres`/`server` healthy.
Run: `curl -s -X POST http://localhost:4000/opportunities -H "X-API-Key: dev-local-key-change-me" -H "Content-Type: application/json" -d '{"title":"Test opportunity"}'`
Expected: `201` with the created opportunity JSON (this is the first real end-to-end proof the Prisma migration + route wiring works).

- [ ] **Step 6: Commit**

```bash
git add server/src/app.ts server/src/index.ts .env.example docker-compose.yml
git commit -m "feat: mount opportunities router, wire Prisma client into index.ts"
```

---

### Task 9: Prisma integration test

**Files:**
- Create: `server/test/domain/opportunities.integration.test.ts`
- Modify: `server/vitest.config.ts`

**Interfaces:** none new — exercises the real `createOpportunitiesRouter` against a real Prisma client.

- [ ] **Step 1: Write `server/test/domain/opportunities.integration.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { createPrismaClient } from "../../src/db/prisma.js";
import { createOpportunitiesRouter } from "../../src/domain/opportunities.js";

// Requires a reachable, migrated Postgres at DATABASE_URL. Run explicitly
// via `npm run test:integration`; not part of the default `npm test`.
describe("opportunities router (integration)", () => {
  const prisma = createPrismaClient();
  const app = express();
  app.use(express.json());
  app.use("/opportunities", createOpportunitiesRouter(prisma));

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates, reads, transitions, and lists a real opportunity end to end", async () => {
    const createRes = await request(app).post("/opportunities").send({ title: "Integration test opportunity" });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    const getRes = await request(app).get(`/opportunities/${id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe("DISCOVERED");

    const statusRes = await request(app).patch(`/opportunities/${id}/status`).send({ status: "QUALIFIED" });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("QUALIFIED");

    const listRes = await request(app).get("/opportunities");
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((o: { id: string }) => o.id === id)).toBe(true);

    await prisma.decision.deleteMany({ where: { opportunityId: id } });
    await prisma.evidence.deleteMany({ where: { opportunityId: id } });
    await prisma.opportunity.delete({ where: { id } });
  });
});
```

- [ ] **Step 2: Confirm `server/vitest.config.ts`'s exclusion covers this file**

Check the file — Phase 2's fix already scoped the integration-test exclusion into the `test` npm script rather than the global config (per that task's fix). Confirm `server/package.json`'s `test` script excludes `**/*.integration.test.ts` broadly (not just the one Phase 1 file by name) — if it only names `ready.integration.test.ts` specifically, broaden the exclude pattern to `**/*.integration.test.ts` so this new file is covered by the same rule without needing a second one-off exclusion.

- [ ] **Step 3: Run it against a real, migrated Postgres**

Run (from repo root): `docker compose up -d postgres`
Run (from `server/`): `DATABASE_URL=postgres://accelerator:accelerator@localhost:5434/accelerator npx prisma migrate deploy`
Run: `DATABASE_URL=postgres://accelerator:accelerator@localhost:5434/accelerator npm run test:integration`
Expected: PASS. Confirm `npm test` (the default suite) does NOT pick up this file (should still show the same test-file count as before this task, plus any other default-suite additions from this plan's other tasks — not this one).

- [ ] **Step 4: Commit**

```bash
git add server/test/domain/opportunities.integration.test.ts server/vitest.config.ts server/package.json
git commit -m "test: add Prisma integration test for the opportunities router"
```

---

### Task 10: frontend — router, API client, API key prompt

**Files:**
- Modify: `client/package.json`
- Create: `client/src/api.ts`
- Test: `client/src/api.test.ts`

**Interfaces:**
- Produces: `export function getApiKey(): string | null`, `export function setApiKey(key: string): void`, `export async function apiFetch(path: string, init?: RequestInit): Promise<Response>` from `client/src/api.ts` — Tasks 11-13's pages import `apiFetch` and `getApiKey`.

- [ ] **Step 1: Add `react-router-dom` to `client/package.json`**

Add to `dependencies`: `"react-router-dom": "^6.26.0"`.

- [ ] **Step 2: Write the failing test `client/src/api.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getApiKey, setApiKey, apiFetch } from "./api";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api key storage", () => {
  it("returns null when no key is stored", () => {
    expect(getApiKey()).toBeNull();
  });

  it("stores and retrieves a key", () => {
    setApiKey("my-key");
    expect(getApiKey()).toBe("my-key");
  });
});

describe("apiFetch", () => {
  it("attaches the stored key as X-API-Key", async () => {
    setApiKey("my-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/opportunities");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-API-Key"]).toBe("my-key");
  });

  it("clears the stored key on a 401 response", async () => {
    setApiKey("my-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await apiFetch("/opportunities");

    expect(getApiKey()).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `client/`): `npm install && npm test`
Expected: FAIL — `./api` does not exist.

- [ ] **Step 4: Write `client/src/api.ts`**

```typescript
const STORAGE_KEY = "aiaccelerator_api_key";

export function getApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = getApiKey() ?? "";
  const headers = { ...(init.headers as Record<string, string> | undefined), "X-API-Key": key };
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 401) {
    clearApiKey();
  }
  return res;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/package.json client/package-lock.json client/src/api.ts client/src/api.test.ts
git commit -m "feat(client): add react-router-dom dependency and API client with key storage"
```

---

### Task 11: frontend — Opportunity List page

**Files:**
- Create: `client/src/pages/OpportunityList.tsx`
- Test: `client/src/pages/OpportunityList.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` from Task 10's `client/src/api.ts`.
- Produces: default export `OpportunityList` component — Task 14 routes to it.

- [ ] **Step 1: Write the failing test `client/src/pages/OpportunityList.test.tsx`**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import OpportunityList from "./OpportunityList";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OpportunityList", () => {
  it("renders the fetched opportunities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: "1", title: "Contract renewals", status: "QUALIFIED", owner: "J. Smith" }],
      })
    );

    render(
      <MemoryRouter>
        <OpportunityList />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Contract renewals")).toBeInTheDocument());
    expect(screen.getByText("QUALIFIED")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `client/`): `npm test`
Expected: FAIL — `./OpportunityList` does not exist.

- [ ] **Step 3: Write `client/src/pages/OpportunityList.tsx`**

```typescript
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

interface OpportunitySummary {
  id: string;
  title: string;
  status: string;
  owner: string | null;
}

export default function OpportunityList() {
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
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((o) => (
            <tr key={o.id}>
              <td>
                <Link to={`/opportunities/${o.id}`}>{o.title}</Link>
              </td>
              <td>{o.status}</td>
              <td>{o.owner ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/OpportunityList.tsx client/src/pages/OpportunityList.test.tsx
git commit -m "feat(client): add OpportunityList page"
```

---

### Task 12: frontend — New Opportunity page

**Files:**
- Create: `client/src/pages/NewOpportunity.tsx`
- Test: `client/src/pages/NewOpportunity.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` from Task 10's `client/src/api.ts`.
- Produces: default export `NewOpportunity` component — Task 14 routes to it.

- [ ] **Step 1: Write the failing test `client/src/pages/NewOpportunity.test.tsx`**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import NewOpportunity from "./NewOpportunity";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NewOpportunity", () => {
  it("submits the title field to the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "new-id", title: "Fresh idea" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <NewOpportunity />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Fresh idea" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ title: "Fresh idea" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `client/`): `npm test`
Expected: FAIL — `./NewOpportunity` does not exist.

- [ ] **Step 3: Write `client/src/pages/NewOpportunity.tsx`**

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

export default function NewOpportunity() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [businessProblem, setBusinessProblem] = useState("");
  const [owner, setOwner] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch("/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, businessProblem, owner }),
    });
    if (res.ok) {
      const created = await res.json();
      navigate(`/opportunities/${created.id}`);
    }
  }

  return (
    <main>
      <h1>New Opportunity</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          Business problem
          <textarea value={businessProblem} onChange={(e) => setBusinessProblem(e.target.value)} />
        </label>
        <label>
          Owner
          <input value={owner} onChange={(e) => setOwner(e.target.value)} />
        </label>
        <button type="submit">Create</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/NewOpportunity.tsx client/src/pages/NewOpportunity.test.tsx
git commit -m "feat(client): add NewOpportunity page"
```

---

### Task 13: frontend — Opportunity Detail page

**Files:**
- Create: `client/src/pages/OpportunityDetail.tsx`
- Test: `client/src/pages/OpportunityDetail.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` from Task 10's `client/src/api.ts`.
- Produces: default export `OpportunityDetail` component — Task 14 routes to it.

- [ ] **Step 1: Write the failing test `client/src/pages/OpportunityDetail.test.tsx`**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "@testing-library/jest-dom";
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

describe("OpportunityDetail", () => {
  it("renders the opportunity, its evidence, and its decisions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "1",
          title: "Contract renewals",
          status: "QUALIFIED",
          evidence: [{ id: "e1", claim: "Renewal volume is high", type: "FACT" }],
          decisions: [{ id: "d1", decision: "Proceed to hypothesis phase" }],
        }),
      })
    );

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("Contract renewals")).toBeInTheDocument());
    expect(screen.getByText(/Renewal volume is high/)).toBeInTheDocument();
    expect(screen.getByText("Proceed to hypothesis phase")).toBeInTheDocument();
  });

  it("only offers valid next statuses in the transition select", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "1", title: "X", status: "PROVING", evidence: [], decisions: [] }),
      })
    );

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    const select = screen.getByLabelText(/status/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(["PROVING", "PROVEN", "REJECTED"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `client/`): `npm test`
Expected: FAIL — `./OpportunityDetail` does not exist.

- [ ] **Step 3: Write `client/src/pages/OpportunityDetail.tsx`**

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

interface OpportunityDetailData {
  id: string;
  title: string;
  status: OpportunityStatus;
  evidence: Evidence[];
  decisions: Decision[];
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const [opportunity, setOpportunity] = useState<OpportunityDetailData | null>(null);
  const [claim, setClaim] = useState("");
  const [evidenceType, setEvidenceType] = useState("FACT");
  const [decisionText, setDecisionText] = useState("");

  function reload() {
    apiFetch(`/opportunities/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then(setOpportunity)
      .catch(() => setOpportunity(null));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!opportunity) return <main>Loading...</main>;

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await apiFetch(`/opportunities/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: e.target.value }),
    });
    reload();
  }

  async function handleAddEvidence(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch(`/opportunities/${id}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim, type: evidenceType }),
    });
    setClaim("");
    reload();
  }

  async function handleAddDecision(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch(`/opportunities/${id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: decisionText }),
    });
    setDecisionText("");
    reload();
  }

  const nextStatuses = TRANSITIONS[opportunity.status];

  return (
    <main>
      <h1>{opportunity.title}</h1>
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
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/OpportunityDetail.tsx client/src/pages/OpportunityDetail.test.tsx
git commit -m "feat(client): add OpportunityDetail page with evidence/decisions/status transition"
```

---

### Task 14: frontend — router shell wiring all pages

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/App.test.tsx`

**Interfaces:**
- Consumes: `OpportunityList` (Task 11), `NewOpportunity` (Task 12), `OpportunityDetail` (Task 13).

- [ ] **Step 1: Rewrite `client/src/App.test.tsx`**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("shows the opportunity list at the root route by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/health")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("AI Accelerator")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `client/`): `npm test`
Expected: FAIL — `App` still renders Phase 1's plain health-check landing page, not a router.

- [ ] **Step 3: Rewrite `client/src/App.tsx`**

```typescript
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import OpportunityList from "./pages/OpportunityList";
import NewOpportunity from "./pages/NewOpportunity";
import OpportunityDetail from "./pages/OpportunityDetail";

function BackendStatus() {
  const [status, setStatus] = useState<"loading" | "ok" | "unreachable">("loading");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("not ok"))))
      .then(() => setStatus("ok"))
      .catch(() => setStatus("unreachable"));
  }, []);

  return <footer>Backend status: {status}</footer>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<OpportunityList />} />
        <Route path="/opportunities/new" element={<NewOpportunity />} />
        <Route path="/opportunities/:id" element={<OpportunityDetail />} />
      </Routes>
      <BackendStatus />
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — confirm the full client suite (all prior page tests plus this one) passes together.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/App.test.tsx
git commit -m "feat(client): wire router shell connecting all three pages"
```

---

### Task 15: final validation against Phase 3's Definition of Done

**Files:** none created — verification only.

- [ ] **Step 1: Full test suites**

Run (from `server/`): `npm test` — confirm all pass.
Run (from `client/`): `npm test` — confirm all pass.

- [ ] **Step 2: Lint**

Run (from `server/`): `npm run lint`
Run (from `client/`): `npm run lint`
Expected: both clean.

- [ ] **Step 3: Clean rebuild**

Run (from repo root): `docker compose down -v && docker compose build --no-cache && docker compose up -d`
Run: `docker compose ps` — confirm `postgres`/`server` healthy. Confirm the server's logs show `prisma migrate deploy` ran successfully before the app started (`docker compose logs server`).

- [ ] **Step 4: Manual end-to-end UI verification**

Open `http://localhost:8080` in a browser (or via curl/screenshot tooling if no browser is available in this environment). Verify: the list page loads (empty or shows prior test data), creating a new opportunity via the form works and redirects to its detail page, the status dropdown only shows valid next transitions and successfully transitions on selection, adding evidence and a decision both appear in their respective lists without a page reload. If a browser isn't available in this environment, verify the equivalent flow via `curl` calls mirroring what the UI does (create → get → status → evidence → decision), matching Task 8 Step 5's pattern.

- [ ] **Step 5: Confirm no secrets committed**

Run: `git log --all -p -- .env.example docker-compose.yml server/src/index.ts server/src/config.ts | grep -iE "ACCELERATOR_API_KEY=.+[a-zA-Z0-9]"` (excluding the `${ACCELERATOR_API_KEY}` interpolation syntax)
Expected: no output.

- [ ] **Step 6: Update `docs/IMPLEMENTATION_STATUS.md`**

Add a new section after Phase 2:

```markdown
## Phase 3 — Core Domain Model + Minimal UI + API Auth (complete)

- [x] Prisma schema: Opportunity/Evidence/Decision, migrated
- [x] REST API: list/create/get/update opportunities, validated status transitions, evidence, decisions
- [x] ACCELERATOR_API_KEY required, protects all non-health routes including /ai/*
- [x] Three UI screens: list, detail, new-opportunity form
```

Update "Not yet implemented" to remove Phase 3 and note the deferred items from this phase (Experiment/Learning entities, Evidence↔Decision linkage, AI-assisted reasoning, UI styling pass) alongside the existing Phase 4/5 list.

- [ ] **Step 7: Tear down cleanly**

Run: `docker compose down`

- [ ] **Step 8: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "docs: mark Phase 3 domain model + minimal UI + API auth complete"
```
