# AI Accelerator — Phase 4: Real Login + AI-Generated Opportunity Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared `ACCELERATOR_API_KEY` with a real single-local-account username/password login (bcrypt + JWT), and add the first domain-logic use of Phase 2's `AiClient` — an AI-synthesized report for an Opportunity.

**Architecture:** `server/src/auth.ts` gets JWT sign/verify + a `requireAuth` middleware, replacing `requireAccelApiKey` everywhere it was mounted. A new `POST /auth/login` route (public, bcrypt-compared against an env-configured hash) issues the token. `createOpportunitiesRouter` gains an optional `aiClient` parameter and a `POST /:id/report` route that builds a prompt from the opportunity's evidence/decisions and calls `aiClient.quickAsk`. Client-side, the existing API-key prompt is replaced with a real login form storing a JWT instead of a shared key.

**Tech Stack:** `bcryptjs` (pure JS, no native bindings — avoids Phase 3's Alpine/OpenSSL pain), `jsonwebtoken`, existing Express/Prisma/React stack.

**Spec:** `docs/superpowers/specs/2026-09-29-phase4-auth-and-report-design.md`

## Global Constraints

- Single local account, no user table, no signup flow — credentials via env vars (`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `AUTH_TOKEN_SECRET`), same required/fail-fast posture as `DATABASE_URL`/`PORT`.
- `ACCELERATOR_API_KEY`/`requireAccelApiKey` are fully removed — clean cutover, no backward-compat shim.
- `POST /auth/login` is the only route besides `/health`/`/ready`/`/version` that does NOT require the auth token.
- No AI-generated report is persisted to the database — displayed on screen only.
- No automated test calls the real conclave — the one live report-generation call happens manually during Task 7's verification.
- Error contract unchanged: `{error:{code,message}}`. `UNAUTHORIZED` (401) now also covers login failures and invalid/expired tokens.

---

### Task 1: `server/src/auth.ts` — JWT core (rewrite)

**Files:**
- Modify: `server/src/auth.ts` (full rewrite — read the current file first, it currently holds `requireAccelApiKey`, which this task removes entirely)
- Modify: `server/test/auth.test.ts` (full rewrite)
- Modify: `server/package.json`

**Interfaces:**
- Produces: `export function signToken(secret: string, username: string): string`, `export function verifyToken(secret: string, token: string): boolean`, `export function requireAuth(secret: string): RequestHandler` — Task 3 uses `signToken`, Task 4 wires `requireAuth` into `app.ts`.

- [ ] **Step 1: Add `jsonwebtoken` to `server/package.json`**

Add to `dependencies`: `"jsonwebtoken": "^9.0.2"`. Add to `devDependencies`: `"@types/jsonwebtoken": "^9.0.7"`.

- [ ] **Step 2: Write the failing test `server/test/auth.test.ts` (replace the existing content entirely)**

```typescript
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { signToken, verifyToken, requireAuth } from "../src/auth.js";

describe("signToken/verifyToken", () => {
  it("round-trips a valid token", () => {
    const token = signToken("secret", "admin");
    expect(verifyToken("secret", token)).toBe(true);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signToken("secret", "admin");
    expect(verifyToken("other-secret", token)).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(verifyToken("secret", "not-a-token")).toBe(false);
  });
});

function appWithAuth(secret: string) {
  const app = express();
  app.use(requireAuth(secret));
  app.get("/protected", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("requireAuth", () => {
  it("returns 401 when there is no Authorization header", async () => {
    const app = appWithAuth("secret");

    const res = await request(app).get("/protected");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
  });

  it("returns 401 for a malformed Authorization header", async () => {
    const app = appWithAuth("secret");

    const res = await request(app).get("/protected").set("Authorization", "NotBearer xyz");

    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid token", async () => {
    const app = appWithAuth("secret");

    const res = await request(app).get("/protected").set("Authorization", "Bearer garbage");

    expect(res.status).toBe(401);
  });

  it("allows the request through with a valid token", async () => {
    const token = signToken("secret", "admin");
    const app = appWithAuth("secret");

    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `server/`): `npm install && npm test`
Expected: FAIL — `requireAuth`/`signToken`/`verifyToken` don't exist yet (the old file only has `requireAccelApiKey`).

- [ ] **Step 4: Write `server/src/auth.ts` (replace entirely)**

```typescript
import jwt from "jsonwebtoken";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export function signToken(secret: string, username: string): string {
  return jwt.sign({ sub: username }, secret, { expiresIn: "7d" });
}

export function verifyToken(secret: string, token: string): boolean {
  try {
    jwt.verify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export function requireAuth(secret: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("Authorization") ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    const token = match?.[1] ?? "";

    if (!token || !verifyToken(secret, token)) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization token" } });
      return;
    }
    next();
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS for `auth.test.ts`. The rest of the suite will FAIL at this point (other files still reference `requireAccelApiKey`/`acceleratorApiKey`) — that's expected until Task 4; don't try to fix it in this task.

- [ ] **Step 6: Commit**

```bash
git add server/src/auth.ts server/test/auth.test.ts server/package.json server/package-lock.json
git commit -m "feat(server): rewrite auth.ts as JWT-based requireAuth, remove requireAccelApiKey"
```

---

### Task 2: `server/src/config.ts` — swap `acceleratorApiKey` for the 3 new required fields

**Files:**
- Modify: `server/src/config.ts` (read the current file first — it has existing `PORT` integer-range validation from Phase 2's fix; preserve that, only touch the `acceleratorApiKey`-related lines)
- Modify: `server/test/config.test.ts` (remove the `ACCELERATOR_API_KEY` tests, add 3 new ones)

**Interfaces:**
- Produces: `AppConfig` loses `acceleratorApiKey: string`, gains `adminUsername: string`, `adminPasswordHash: string`, `authTokenSecret: string` (all required) — Task 4 reads these into `AppDeps`.

- [ ] **Step 1: Modify `server/test/config.test.ts`**

Remove the existing `it("throws a clear error when ACCELERATOR_API_KEY is missing", ...)` test and remove `ACCELERATOR_API_KEY` from every other test's input object. Add these three tests inside the existing `describe("loadConfig", ...)` block:

```typescript
  it("throws a clear error when ADMIN_USERNAME is missing", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://u:p@h:5432/d", PORT: "4000", ADMIN_PASSWORD_HASH: "h", AUTH_TOKEN_SECRET: "s" })
    ).toThrowError("Missing required environment variable: ADMIN_USERNAME");
  });

  it("throws a clear error when ADMIN_PASSWORD_HASH is missing", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://u:p@h:5432/d", PORT: "4000", ADMIN_USERNAME: "admin", AUTH_TOKEN_SECRET: "s" })
    ).toThrowError("Missing required environment variable: ADMIN_PASSWORD_HASH");
  });

  it("throws a clear error when AUTH_TOKEN_SECRET is missing", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://u:p@h:5432/d", PORT: "4000", ADMIN_USERNAME: "admin", ADMIN_PASSWORD_HASH: "h" })
    ).toThrowError("Missing required environment variable: AUTH_TOKEN_SECRET");
  });
```

Update the existing "returns a parsed config when all required vars are present" test: remove `ACCELERATOR_API_KEY` from its input and `acceleratorApiKey` from its expected output; add `ADMIN_USERNAME: "admin"`, `ADMIN_PASSWORD_HASH: "hash"`, `AUTH_TOKEN_SECRET: "secret"` to the input and `adminUsername: "admin"`, `adminPasswordHash: "hash"`, `authTokenSecret: "secret"` to the expected output.

- [ ] **Step 2: Run test to verify it fails**

Run (from `server/`): `npm test`
Expected: FAIL — `config.ts` still requires `ACCELERATOR_API_KEY` and doesn't require the 3 new vars.

- [ ] **Step 3: Modify `server/src/config.ts`**

Remove `acceleratorApiKey: string;` from the `AppConfig` interface; add `adminUsername: string;`, `adminPasswordHash: string;`, `authTokenSecret: string;`.

In `loadConfig`, remove the `const acceleratorApiKey = requireEnv(env, "ACCELERATOR_API_KEY");` line; add:

```typescript
  const adminUsername = requireEnv(env, "ADMIN_USERNAME");
  const adminPasswordHash = requireEnv(env, "ADMIN_PASSWORD_HASH");
  const authTokenSecret = requireEnv(env, "AUTH_TOKEN_SECRET");
```

Update the returned object to drop `acceleratorApiKey` and include `adminUsername, adminPasswordHash, authTokenSecret`. Leave every other line (including the existing `PORT` integer-range check) untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: `config.test.ts` passes. Other files still fail (expected until Task 4).

- [ ] **Step 5: Commit**

```bash
git add server/src/config.ts server/test/config.test.ts
git commit -m "feat(server): replace ACCELERATOR_API_KEY config with ADMIN_USERNAME/ADMIN_PASSWORD_HASH/AUTH_TOKEN_SECRET"
```

---

### Task 3: login route + password-hash script

**Files:**
- Create: `server/src/domain/authRoutes.ts`
- Test: `server/test/domain/authRoutes.test.ts`
- Create: `server/scripts/hash-password.mjs`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: `signToken` from Task 1's `server/src/auth.js`, `asyncHandler` from `server/src/asyncHandler.js`.
- Produces: `export interface AuthRouterConfig { adminUsername: string; adminPasswordHash: string; authTokenSecret: string }`, `export function createAuthRouter(config: AuthRouterConfig): Router` (a `POST /login` route) — Task 4 mounts this at `/auth`, so the full path is `POST /auth/login`.

- [ ] **Step 1: Add `bcryptjs` to `server/package.json`**

Add to `dependencies`: `"bcryptjs": "^2.4.3"`. Add to `devDependencies`: `"@types/bcryptjs": "^2.4.6"`.

- [ ] **Step 2: Write the failing test `server/test/domain/authRoutes.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createAuthRouter } from "../../src/domain/authRoutes.js";

const passwordHash = bcrypt.hashSync("correct-password", 10);
const config = { adminUsername: "admin", adminPasswordHash: passwordHash, authTokenSecret: "test-secret" };

function app() {
  const a = express();
  a.use(express.json());
  a.use("/auth", createAuthRouter(config));
  return a;
}

describe("POST /auth/login", () => {
  it("returns a token for correct credentials", async () => {
    const res = await request(app()).post("/auth/login").send({ username: "admin", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
  });

  it("returns 401 for a wrong username", async () => {
    const res = await request(app()).post("/auth/login").send({ username: "nope", password: "correct-password" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
  });

  it("returns 401 for a wrong password", async () => {
    const res = await request(app()).post("/auth/login").send({ username: "admin", password: "wrong" });

    expect(res.status).toBe(401);
  });

  it("returns 401 when the body is missing fields", async () => {
    const res = await request(app()).post("/auth/login").send({});

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `server/`): `npm install && npm test`
Expected: FAIL — `../../src/domain/authRoutes.js` does not exist.

- [ ] **Step 4: Write `server/src/domain/authRoutes.ts`**

```typescript
import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { asyncHandler } from "../asyncHandler.js";
import { signToken } from "../auth.js";

export interface AuthRouterConfig {
  adminUsername: string;
  adminPasswordHash: string;
  authTokenSecret: string;
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

export function createAuthRouter(config: AuthRouterConfig): Router {
  const router = Router();

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
      const { username, password } = body;

      if (typeof username !== "string" || typeof password !== "string") {
        res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
        return;
      }

      const usernameOk = constantTimeEqual(username, config.adminUsername);
      const passwordOk = bcrypt.compareSync(password, config.adminPasswordHash);

      if (!usernameOk || !passwordOk) {
        res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
        return;
      }

      const token = signToken(config.authTokenSecret, username);
      res.status(200).json({ token });
    })
  );

  return router;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: `authRoutes.test.ts` passes.

- [ ] **Step 6: Write `server/scripts/hash-password.mjs`**

```javascript
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}
console.log(bcrypt.hashSync(password, 10));
```

Verify it runs: `node server/scripts/hash-password.mjs test123` — expect a bcrypt hash string printed.

- [ ] **Step 7: Commit**

```bash
git add server/src/domain/authRoutes.ts server/test/domain/authRoutes.test.ts server/scripts/hash-password.mjs server/package.json server/package-lock.json
git commit -m "feat(server): add POST /auth/login route and password-hash generation script"
```

---

### Task 4: wire auth into `app.ts`, update every existing call site

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/index.ts`
- Modify: `server/test/health.test.ts`, `server/test/ready.test.ts`, `server/test/version.test.ts`, `server/test/errors.test.ts`, `server/test/ai/routes.test.ts`, `server/test/authWiring.test.ts`, `server/test/ready.integration.test.ts`

**Interfaces:**
- Consumes: `requireAuth` from Task 1's `server/src/auth.js`, `createAuthRouter` from Task 3's `server/src/domain/authRoutes.js`.
- Produces: `AppDeps` loses `acceleratorApiKey: string`, gains `adminUsername: string`, `adminPasswordHash: string`, `authTokenSecret: string`.

**This is a breaking, wide-reaching change — the same shape as Phase 3's Task 4.** Before writing any code, run `grep -rn "acceleratorApiKey\|ACCELERATOR_API_KEY\|requireAccelApiKey\|X-API-Key" server/src server/test` to find every call site. Do not assume the list above is exhaustive — it's the list known when this plan was written; trust the grep over it if they differ.

- [ ] **Step 1: Read `server/src/app.ts` in full**

Understand its current route order (health → ready → version → the old `requireAccelApiKey` middleware → `/ai/quick` → `/ai/session` → the `/opportunities` mount → 404 handler → `errorHandler`) before changing anything.

- [ ] **Step 2: Modify `server/src/app.ts`**

Replace the import of `requireAccelApiKey` from `./auth.js` with `requireAuth`. Add an import for `createAuthRouter` from `./domain/authRoutes.js`.

In `AppDeps`, remove `acceleratorApiKey: string;`; add `adminUsername: string;`, `adminPasswordHash: string;`, `authTokenSecret: string;`.

Replace the old `app.use(requireAccelApiKey(deps.acceleratorApiKey));` line with:

```typescript
  app.use(
    "/auth",
    createAuthRouter({
      adminUsername: deps.adminUsername,
      adminPasswordHash: deps.adminPasswordHash,
      authTokenSecret: deps.authTokenSecret,
    })
  );
  app.use(requireAuth(deps.authTokenSecret));
```

Placed exactly where the old middleware was (after `/version`, before `/ai/quick`) — so `/auth/login` is registered and reachable BEFORE the `requireAuth` gate, making it the one public route besides health/ready/version.

- [ ] **Step 3: Modify `server/src/index.ts`**

Update the `createApp({...})` deps object: remove `acceleratorApiKey: config.acceleratorApiKey`, add `adminUsername: config.adminUsername, adminPasswordHash: config.adminPasswordHash, authTokenSecret: config.authTokenSecret`.

- [ ] **Step 4: Update every existing test file**

For `server/test/health.test.ts`, `server/test/ready.test.ts`, `server/test/version.test.ts`, `server/test/errors.test.ts`, `server/test/ready.integration.test.ts`: every `createApp({...})` call currently passes `acceleratorApiKey: "test-key"` (or similar) — replace with `adminUsername: "admin", adminPasswordHash: "test-hash", authTokenSecret: "test-secret"`. These files' actual requests don't need an auth header change since they only hit `/health`/`/ready`/`/version` (public) or, in `errors.test.ts`'s case, may hit an authenticated route for its 404 test — if so, replace `.set("X-API-Key", "test-key")` with `.set("Authorization", "Bearer " + signToken("test-secret", "admin"))` (import `signToken` from `../src/auth.js`).

For `server/test/ai/routes.test.ts`: replace every `createApp({...})` call's `acceleratorApiKey: "test-key"` with the 3 new fields (same values as above), and replace every `.set("X-API-Key", "test-key")` with `.set("Authorization", "Bearer " + token)` where `token` is a real token signed with the same `authTokenSecret` used in the deps (`signToken("test-secret", "admin")`, imported from `../../src/auth.js`).

For `server/test/authWiring.test.ts`: rewrite entirely to match the new auth model:

```typescript
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { signToken } from "../src/auth.js";

const fakePool = {} as Pool;
const authDeps = {
  pool: fakePool,
  version: "0.1.0",
  commit: "test",
  adminUsername: "admin",
  adminPasswordHash: bcrypt.hashSync("correct-password", 10),
  authTokenSecret: "test-secret",
};

describe("auth gating", () => {
  it("does not require a token for /health", async () => {
    const app = createApp(authDeps);

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
  });

  it("does not require a token for /ready", async () => {
    const app = createApp(authDeps);

    const res = await request(app).get("/ready");

    expect(res.status).not.toBe(401);
  });

  it("does not require a token for /version", async () => {
    const app = createApp(authDeps);

    const res = await request(app).get("/version");

    expect(res.status).toBe(200);
  });

  it("does not require a token for POST /auth/login", async () => {
    const app = createApp(authDeps);

    const res = await request(app).post("/auth/login").send({ username: "admin", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
  });

  it("requires a token for /ai/quick", async () => {
    const app = createApp(authDeps);

    const res = await request(app).post("/ai/quick").send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(401);
  });

  it("allows /ai/quick through with a valid token (still 503 AI_NOT_CONFIGURED since no aiClient)", async () => {
    const app = createApp(authDeps);
    const token = signToken("test-secret", "admin");

    const res = await request(app)
      .post("/ai/quick")
      .set("Authorization", `Bearer ${token}`)
      .send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(503);
  });

  it("requires a token for /opportunities", async () => {
    const fakePrisma = { opportunity: { findMany: vi.fn() } };
    const app = createApp({ ...authDeps, prisma: fakePrisma as never });

    const res = await request(app).get("/opportunities");

    expect(res.status).toBe(401);
  });

  it("returns 401 for an unauthenticated request to an unknown route (no route enumeration)", async () => {
    const app = createApp(authDeps);

    const res = await request(app).get("/totally-not-a-real-route");

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 5: Run the FULL test suite to verify everything passes**

Run (from `server/`): `npm test`
Expected: PASS — every file, with no leftover references to `acceleratorApiKey`/`ACCELERATOR_API_KEY`/`X-API-Key`/`requireAccelApiKey` anywhere. Run the grep from Step 0 again to confirm zero matches (aside from this plan file itself and the git history, which aren't part of the source tree check).

- [ ] **Step 6: Commit**

```bash
git add server/src/app.ts server/src/index.ts server/test/health.test.ts server/test/ready.test.ts server/test/version.test.ts server/test/errors.test.ts server/test/ai/routes.test.ts server/test/authWiring.test.ts server/test/ready.integration.test.ts
git commit -m "feat(server): wire real JWT auth into app.ts, remove all ACCELERATOR_API_KEY references"
```

---

### Task 5: move `aiErrorStatus` into `server/src/ai/errors.ts` (pure refactor)

**Files:**
- Modify: `server/src/ai/errors.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Produces: `export function aiErrorStatus(code: AiErrorCode): number` from `server/src/ai/errors.js` — Task 6's report route imports it from here instead of `app.ts` defining its own copy.

- [ ] **Step 1: Read the current `aiErrorStatus` function in `server/src/app.ts`**

It should look like this (confirm against the actual file — it was written in Phase 2 with a `default` case added for `tsc --strict` exhaustiveness):

```typescript
function aiErrorStatus(code: AiErrorCode): number {
  switch (code) {
    case "AI_NOT_CONFIGURED":
      return 503;
    case "AI_BUSY":
      return 409;
    case "AI_BAD_REQUEST":
      return 400;
    case "AI_UPSTREAM_ERROR":
    case "AI_UNREACHABLE":
      return 502;
    default:
      return 502;
  }
}
```

- [ ] **Step 2: Move it to `server/src/ai/errors.ts`**

Add the exact function above (with `export`) to `server/src/ai/errors.ts`, alongside the existing `AiClientError`/`AiErrorCode` exports.

- [ ] **Step 3: Remove the local copy from `server/src/app.ts` and import instead**

Delete the local `function aiErrorStatus(...)` definition from `app.ts`. Update the existing import line (`import { AiClientError, type AiErrorCode } from "./ai/errors.js";`) to also import `aiErrorStatus`: `import { AiClientError, aiErrorStatus, type AiErrorCode } from "./ai/errors.js";`.

- [ ] **Step 4: Run the full test suite to verify nothing broke**

Run (from `server/`): `npm test`
Expected: PASS — this is a pure refactor, no test file should need changes, no behavior change.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/errors.ts server/src/app.ts
git commit -m "refactor(server): move aiErrorStatus into ai/errors.ts for reuse"
```

---

### Task 6: AI report route

**Files:**
- Modify: `server/src/domain/opportunities.ts`
- Modify: `server/test/domain/opportunities.test.ts`

**Interfaces:**
- Consumes: `AiClient` type from `server/src/ai/client.js`, `AiClientError`/`aiErrorStatus` from Task 5's `server/src/ai/errors.js`.
- Produces: `createOpportunitiesRouter`'s signature changes from `(prisma: PrismaClient) => Router` to `(prisma: PrismaClient, aiClient?: AiClient) => Router` — Task 7 updates the one call site in `app.ts` to pass `deps.aiClient` as the second argument.

- [ ] **Step 1: Add the failing tests (append to `server/test/domain/opportunities.test.ts`)**

First, add this import at the top of the file: `import { AiClientError } from "../../src/ai/errors.js";`

Then add a new helper and describe block:

```typescript
function appWithPrismaAndAi(prisma: unknown, aiClient?: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/opportunities", createOpportunitiesRouter(prisma as never, aiClient as never));
  return app;
}

describe("POST /opportunities/:id/report", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null) } };
    const app = appWithPrismaAndAi(prisma, { quickAsk: vi.fn() });

    const res = await request(app).post("/opportunities/nope/report").send({});

    expect(res.status).toBe(404);
  });

  it("returns 503 AI_NOT_CONFIGURED when no aiClient is provided", async () => {
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1", title: "X", evidence: [], decisions: [] }) },
    };
    const app = appWithPrismaAndAi(prisma, undefined);

    const res = await request(app).post("/opportunities/1/report").send({});

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("returns a generated report on success, including evidence/decisions in the prompt", async () => {
    const opportunity = {
      id: "1",
      title: "Contract renewals",
      description: "desc",
      businessProblem: "problem",
      status: "QUALIFIED",
      evidence: [{ type: "FACT", claim: "Volume is high" }],
      decisions: [{ decision: "Proceed", rationale: "Strong evidence" }],
    };
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(opportunity) } };
    const quickAsk = vi.fn().mockResolvedValue({ ok: true, model: "Claude", response: "A generated report." });
    const app = appWithPrismaAndAi(prisma, { quickAsk });

    const res = await request(app).post("/opportunities/1/report").send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ report: "A generated report." });
    expect(quickAsk).toHaveBeenCalledWith("Claude", expect.any(String), expect.stringContaining("Volume is high"));
  });

  it("maps an AiClientError to the matching HTTP status", async () => {
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1", title: "X", evidence: [], decisions: [] }) },
    };
    const quickAsk = vi.fn().mockRejectedValue(new AiClientError("AI_BUSY", "busy"));
    const app = appWithPrismaAndAi(prisma, { quickAsk });

    const res = await request(app).post("/opportunities/1/report").send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("AI_BUSY");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `npm test`
Expected: FAIL — the `/report` route doesn't exist yet, and `createOpportunitiesRouter` doesn't accept a second argument.

- [ ] **Step 3: Modify `server/src/domain/opportunities.ts`**

Add the imports: `import type { AiClient } from "../ai/client.js"; import { AiClientError, aiErrorStatus } from "../ai/errors.js";`

Change the function signature: `export function createOpportunitiesRouter(prisma: PrismaClient, aiClient?: AiClient): Router {`

Add this route inside `createOpportunitiesRouter`, after the decisions route, before `return router;`:

```typescript
  router.post(
    "/:id/report",
    asyncHandler(async (req, res, next) => {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: req.params.id },
        include: { evidence: true, decisions: true },
      });
      if (!opportunity) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      if (!aiClient) {
        res.status(503).json({ error: { code: "AI_NOT_CONFIGURED", message: "AI backend is not configured" } });
        return;
      }
      const system =
        "You are a business analyst producing a concise report on an AI opportunity. Base your report only on the information given below. Clearly distinguish established facts from inferences or assumptions. Do not invent information not present in the input.";
      const evidenceLines = opportunity.evidence.length
        ? opportunity.evidence.map((e: { type: string; claim: string }) => `- [${e.type}] ${e.claim}`).join("\n")
        : "(none)";
      const decisionLines = opportunity.decisions.length
        ? opportunity.decisions
            .map((d: { decision: string; rationale: string | null }) => `- ${d.decision}${d.rationale ? ` — ${d.rationale}` : ""}`)
            .join("\n")
        : "(none)";
      const prompt = `Opportunity: ${opportunity.title}
Description: ${opportunity.description ?? "—"}
Business problem: ${opportunity.businessProblem ?? "—"}
Status: ${opportunity.status}

Evidence:
${evidenceLines}

Decisions:
${decisionLines}

Write a concise report (3-5 paragraphs) summarizing the opportunity, the strength of the evidence, and the decisions made so far.`;
      try {
        const result = await aiClient.quickAsk("Claude", system, prompt);
        res.status(200).json({ report: result.response });
      } catch (err) {
        if (err instanceof AiClientError) {
          res.status(aiErrorStatus(err.code)).json({ error: { code: err.code, message: err.message } });
          return;
        }
        next(err);
      }
    })
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/domain/opportunities.ts server/test/domain/opportunities.test.ts
git commit -m "feat(server): add POST /opportunities/:id/report backed by the conclave"
```

---

### Task 7: wire `aiClient` into the router mount, update env/compose, live verification

**Files:**
- Modify: `server/src/app.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `createOpportunitiesRouter(prisma, aiClient)` from Task 6.

- [ ] **Step 1: Modify `server/src/app.ts`**

Find the line `app.use("/opportunities", createOpportunitiesRouter(deps.prisma));` and change it to `app.use("/opportunities", createOpportunitiesRouter(deps.prisma, deps.aiClient));` (still inside the existing `if (deps.prisma) { ... }` guard).

- [ ] **Step 2: Modify `.env.example`**

Remove the `ACCELERATOR_API_KEY` entry (from Phase 3) entirely. Add to the "Required" section:

```dotenv
# Single local admin account. Generate the hash with:
#   node server/scripts/hash-password.mjs <your-password>
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=
# Generate with: openssl rand -hex 32
AUTH_TOKEN_SECRET=
```

- [ ] **Step 3: Modify `docker-compose.yml`**

In the `server` service's `environment:` block, remove the `ACCELERATOR_API_KEY: ${ACCELERATOR_API_KEY}` line. Add:

```yaml
      ADMIN_USERNAME: ${ADMIN_USERNAME}
      ADMIN_PASSWORD_HASH: ${ADMIN_PASSWORD_HASH}
      AUTH_TOKEN_SECRET: ${AUTH_TOKEN_SECRET}
```

(No `:-` defaults — all three are required, an unset value should surface the server's own fail-fast error.)

- [ ] **Step 4: Run the full server test suite**

Run (from `server/`): `npm test`
Expected: PASS.

- [ ] **Step 5: Real Docker verification — login**

From the repo root: ensure `.env` has real values — generate a password hash (`node server/scripts/hash-password.mjs your-test-password`), set `ADMIN_USERNAME=admin`, paste the generated hash into `ADMIN_PASSWORD_HASH`, set `AUTH_TOKEN_SECRET` to any long random string (`openssl rand -hex 32`). Run `docker compose up -d --build`. Confirm `docker compose ps` shows `postgres`/`server` healthy. Then:

```bash
curl -s -X POST http://localhost:4000/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"your-test-password"}'
```

Expected: `200` with a real JWT in `{"token": "..."}`. Save it, then confirm it works on a protected route:

```bash
curl -s http://localhost:4000/opportunities -H "Authorization: Bearer <token-from-above>"
```

Expected: `200` with a (possibly empty) JSON array.

- [ ] **Step 6: Real Docker verification — AI report (spends real conclave quota, do this once)**

With `COUNCIL_BASE_URL`/`COUNCIL_API_KEY` set to real values in `.env` (restart the stack if you just added them: `docker compose up -d --build`), create a test opportunity and request its report:

```bash
TOKEN="<token from Step 5>"
OPP_ID=$(curl -s -X POST http://localhost:4000/opportunities -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"Test report opportunity","description":"A test case for AI report generation."}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).id))")
curl -s -X POST http://localhost:4000/opportunities/$OPP_ID/evidence -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"claim":"Manual process takes 3 days per case","type":"FACT"}'
curl -s -X POST "http://localhost:4000/opportunities/$OPP_ID/report" -H "Authorization: Bearer $TOKEN"
```

Expected: `200` with `{"report": "<a real, multi-paragraph AI-generated report>"}`. If `COUNCIL_BASE_URL`/`COUNCIL_API_KEY` aren't available in this environment, confirm instead that the response is a clean `503 AI_NOT_CONFIGURED` (not a crash), and note in the report that the live conclave call itself couldn't be verified here.

- [ ] **Step 7: Tear down cleanly**

Run: `docker compose down`

- [ ] **Step 8: Commit**

```bash
git add server/src/app.ts .env.example docker-compose.yml
git commit -m "feat: wire aiClient into opportunities router, update env/compose for real auth"
```

---

### Task 8: client — `api.ts` rewrite (token storage + login)

**Files:**
- Modify: `client/src/api.ts` (rewrite — read the current file first, it holds Phase 3's `getApiKey`/`setApiKey`/`clearApiKey`/`apiFetch`)
- Modify: `client/src/api.test.ts` (rewrite)

**Interfaces:**
- Produces: `export function getToken(): string | null`, `export function setToken(token: string): void`, `export function clearToken(): void`, `export async function login(username: string, password: string): Promise<boolean>`, `export async function apiFetch(path: string, init?: RequestInit): Promise<Response>` — Task 9 imports `getToken`/`login`, Task 10 (and all existing pages) import `apiFetch`.

- [ ] **Step 1: Write the failing tests `client/src/api.test.ts` (replace entirely)**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getToken, setToken, clearToken, login, apiFetch } from "./api";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("token storage", () => {
  it("returns null when no token is stored", () => {
    expect(getToken()).toBeNull();
  });

  it("stores and retrieves a token", () => {
    setToken("my-token");
    expect(getToken()).toBe("my-token");
  });

  it("clears a stored token", () => {
    setToken("my-token");
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe("login", () => {
  it("stores the token and returns true on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "issued-token" }) })
    );

    const result = await login("admin", "correct-password");

    expect(result).toBe(true);
    expect(getToken()).toBe("issued-token");
  });

  it("returns false and stores nothing on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await login("admin", "wrong");

    expect(result).toBe(false);
    expect(getToken()).toBeNull();
  });
});

describe("apiFetch", () => {
  it("attaches the stored token as a Bearer Authorization header", async () => {
    setToken("my-token");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/opportunities");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer my-token");
  });

  it("clears the stored token on a 401 response", async () => {
    setToken("my-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await apiFetch("/opportunities");

    expect(getToken()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `client/`): `npm test`
Expected: FAIL — `getToken`/`setToken`/`clearToken`/`login` don't exist yet.

- [ ] **Step 3: Write `client/src/api.ts` (replace entirely)**

```typescript
const STORAGE_KEY = "aiaccelerator_auth_token";

export function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function login(username: string, password: string): Promise<boolean> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { token: string };
  setToken(body.token);
  return true;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken() ?? "";
  const headers = { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` };
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 401) {
    clearToken();
  }
  return res;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for `api.test.ts`. Other page tests will fail until Task 9 (they still import `getApiKey`/etc. from the old `api.ts` shape) — expected, don't fix them here.

- [ ] **Step 5: Commit**

```bash
git add client/src/api.ts client/src/api.test.ts
git commit -m "feat(client): rewrite api.ts for JWT token storage and login()"
```

---

### Task 9: client — `App.tsx` real login form

**Files:**
- Modify: `client/src/App.tsx` (rewrite — read the current file first, it holds Phase 3's `ApiKeyPrompt`)
- Modify: `client/src/App.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `getToken`, `login` from Task 8's `client/src/api.js`.

- [ ] **Step 1: Write the failing tests `client/src/App.test.tsx` (replace entirely)**

```typescript
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("shows the login form when no token is stored", async () => {
    render(<App />);

    expect(await screen.findByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  it("shows the opportunity list once a token is already stored", async () => {
    localStorage.setItem("aiaccelerator_auth_token", "existing-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/health")) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("+ New")).toBeInTheDocument());
  });

  it("logs in successfully and reveals the app", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/auth/login")) {
          return Promise.resolve({ ok: true, json: async () => ({ token: "new-token" }) });
        }
        if (url.includes("/health")) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      })
    );

    render(<App />);

    fireEvent.change(await screen.findByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-password" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByText("+ New")).toBeInTheDocument());
  });

  it("shows an error message on failed login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    render(<App />);

    fireEvent.change(await screen.findByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/invalid/i));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `client/`): `npm test`
Expected: FAIL — `App` still renders Phase 3's `ApiKeyPrompt`, not a login form with username/password fields.

- [ ] **Step 3: Write `client/src/App.tsx` (replace entirely)**

```typescript
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import OpportunityList from "./pages/OpportunityList";
import NewOpportunity from "./pages/NewOpportunity";
import OpportunityDetail from "./pages/OpportunityDetail";
import { getToken, login } from "./api";

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ok = await login(username, password);
    if (ok) {
      onSuccess();
    } else {
      setError("Invalid username or password");
    }
  }

  return (
    <main>
      <h1>AI Accelerator</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit">Log in</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}

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
  const [hasToken, setHasToken] = useState(() => getToken() !== null);

  useEffect(() => {
    const interval = setInterval(() => {
      const present = getToken() !== null;
      setHasToken((prev) => (prev !== present ? present : prev));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!hasToken) {
    return <LoginForm onSuccess={() => setHasToken(true)} />;
  }

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
Expected: PASS for `App.test.tsx`. Confirm the rest of the client suite passes too (`OpportunityList`/`NewOpportunity`/`OpportunityDetail` tests were already updated to use `apiFetch` in Phase 3 and don't reference the old key functions directly, so they should be unaffected).

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/App.test.tsx
git commit -m "feat(client): replace API-key prompt with a real username/password login form"
```

---

### Task 10: client — "Generate Report" button on Opportunity Detail

**Files:**
- Modify: `client/src/pages/OpportunityDetail.tsx`
- Modify: `client/src/pages/OpportunityDetail.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` from `client/src/api.js` (already imported in this file from Phase 3).

- [ ] **Step 1: Read the current `client/src/pages/OpportunityDetail.tsx` in full**

Understand its current structure (evidence section, decisions section, existing mutation handlers) before adding to it.

- [ ] **Step 2: Add the failing test (append to `client/src/pages/OpportunityDetail.test.tsx`)**

```typescript
it("generates and displays a report", async () => {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/report")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ report: "A generated report." }) });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ id: "1", title: "X", status: "PROVING", evidence: [], decisions: [] }),
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  renderAtId("1");

  await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /generate report/i }));

  await waitFor(() => expect(screen.getByText("A generated report.")).toBeInTheDocument());
});
```

(This uses the file's existing `renderAtId` helper and `fireEvent` import — both already present from Phase 3's version of this test file.)

- [ ] **Step 3: Run test to verify it fails**

Run (from `client/`): `npm test`
Expected: FAIL — no "Generate Report" button exists yet.

- [ ] **Step 4: Modify `client/src/pages/OpportunityDetail.tsx`**

Add state near the component's existing `useState` calls:

```typescript
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
```

Add a handler alongside the existing `handleStatusChange`/`handleAddEvidence`/`handleAddDecision`:

```typescript
  async function handleGenerateReport() {
    setReportLoading(true);
    const res = await apiFetch(`/opportunities/${id}/report`, { method: "POST" });
    setReportLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to generate report");
      return;
    }
    const body = await res.json();
    setReport(body.report);
  }
```

Add a section to the JSX, after the Decisions section, before the closing `</main>`:

```tsx
      <h2>Report</h2>
      <button onClick={handleGenerateReport} disabled={reportLoading}>
        {reportLoading ? "Generating..." : "Generate Report"}
      </button>
      {report && <pre>{report}</pre>}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS — confirm the full client suite (all page tests) passes together.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/OpportunityDetail.tsx client/src/pages/OpportunityDetail.test.tsx
git commit -m "feat(client): add Generate Report button to Opportunity Detail page"
```

---

### Task 11: final validation against Phase 4's Definition of Done

**Files:** none created — verification only.

- [ ] **Step 1: Full test suites**

Run (from `server/`): `npm test` — confirm all pass.
Run (from `client/`): `npm test` — confirm all pass.

- [ ] **Step 2: Lint**

Run (from `server/`): `npm run lint`
Run (from `client/`): `npm run lint`
Expected: both clean.

- [ ] **Step 3: Clean rebuild**

Run (from repo root): `docker compose down -v && docker compose build --no-cache && docker compose up -d` (with `.env` populated as in Task 7's Step 5).
Run: `docker compose ps` — confirm `postgres`/`server` healthy.

- [ ] **Step 4: Manual end-to-end walkthrough (login → create → report)**

Repeat Task 7's Steps 5-6 verification against the freshly rebuilt stack — login, get a token, create an opportunity, add evidence, generate a report. If a real browser is available in this environment, use it against `http://localhost:8080` to confirm the login form and Generate Report button work visually; otherwise the curl sequence is an acceptable substitute (matching Phase 3's Task 15 precedent) — state explicitly which method was used.

- [ ] **Step 5: Confirm no secrets committed**

Run: `git log --all -p -- .env.example docker-compose.yml server/src/index.ts server/src/config.ts | grep -iE "(ADMIN_PASSWORD_HASH|AUTH_TOKEN_SECRET)=.+[a-zA-Z0-9]"` (excluding `${...}` interpolation syntax) — expect no output. Also confirm `ACCELERATOR_API_KEY` no longer appears anywhere in `server/src`, `client/src`, `.env.example`, or `docker-compose.yml` (a leftover reference would mean Task 4's sweep missed something): `grep -rn "ACCELERATOR_API_KEY\|acceleratorApiKey" server/src client/src .env.example docker-compose.yml` — expect no output.

- [ ] **Step 6: Update `docs/IMPLEMENTATION_STATUS.md`**

Add a new section after Phase 3:

```markdown
## Phase 4 — Real Login + AI-Generated Opportunity Report (complete)

- [x] POST /auth/login: real username/password against a bcrypt-hashed, env-configured single local account
- [x] JWT-based requireAuth replaces the shared ACCELERATOR_API_KEY everywhere
- [x] POST /opportunities/:id/report: AI-synthesized report via the conclave, using the opportunity's evidence and decisions
- [x] Client: real login form, Generate Report button
```

Update "Not yet implemented" to remove Phase 4 if it was listed, and add this phase's own deferred items (report not persisted to DB; no multi-user support; no refresh-token rotation) alongside the existing Phase 5 entry.

- [ ] **Step 7: Tear down cleanly**

Run: `docker compose down`

- [ ] **Step 8: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "docs: mark Phase 4 real login + AI report complete"
```
