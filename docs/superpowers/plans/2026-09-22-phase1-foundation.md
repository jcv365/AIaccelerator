# AI Accelerator — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a running, health-checked, Docker-Composed skeleton (Postgres + Express/TypeScript API + React/Vite client) with no accelerator logic yet — the foundation every later phase builds into.

**Architecture:** Three Docker services (`postgres`, `server`, `client`) on one bridge network. `server` is an Express + TypeScript API exposing `/health`, `/ready`, `/version`, backed by a Postgres connection pool. `client` is a React + Vite SPA served via nginx in production, calling `server`'s `/health` to prove the network path works. All config is env-driven and validated at startup.

**Tech Stack:** Node.js 20 + TypeScript, Express 4, `pg` (no ORM yet), Vitest + Supertest (server tests), React 18 + Vite 5 + Vitest + Testing Library (client tests), Postgres 16, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-22-phase1-foundation-design.md`

## Global Constraints

- No secrets committed; all config via `.env`, documented in `.env.example`.
- Required env vars: `DATABASE_URL`, `PORT`. Missing required vars fail startup immediately with a clear error message.
- No ORM in Phase 1 — deferred to Phase 3.
- No swallowed errors: DB failures surface as 503 on `/ready` and in structured logs, never silently ignored.
- Errors returned to clients are structured (`{ "error": { "code", "message" } }`), never raw stack traces.
- Structured JSON logs, request ID per request, no secrets logged.
- Containers run as non-root users; multi-stage Dockerfiles; `HEALTHCHECK` defined for `server` and `client`.
- `docker compose up -d` must bring up all three services healthy with no manual steps beyond `cp .env.example .env`.

---

### Task 1: Root scaffolding and env template

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `docs/IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Produces: `.env.example` variable names (`DATABASE_URL`, `PORT`, `NODE_ENV`, commented `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CORS_ALLOWED_ORIGINS`) that Task 3's `loadConfig` and `docker-compose.yml` (Task 10) both read.

- [ ] **Step 1: Write `.gitignore`**

```gitignore
node_modules/
dist/
build/
.env
*.log
coverage/
.DS_Store
```

- [ ] **Step 2: Write `.env.example`**

```dotenv
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

- [ ] **Step 3: Write `docs/IMPLEMENTATION_STATUS.md`**

```markdown
# Implementation Status

## Phase 1 — Foundation (in progress)

- Docker Compose skeleton: postgres + server (Express/TS) + client (React/Vite)
- Health checks: `/health`, `/ready`, `/version`
- Env-driven config, validated at startup
- No accelerator logic yet

## Not yet implemented

- Phase 2: AI provider abstraction (routes through Council-of-ai-experts)
- Phase 3: Core domain model (Opportunity, Evidence, Decision, Experiment, Learning)
- Phase 4: Frontend operational views (portfolio, evidence, reasoning, decisions, experiments, results, learning)
- Phase 5: Observability, security hardening, prompt-injection tests, e2e smoke test

## Risks

- Council-of-ai-experts is currently a Python CLI, not an HTTP service — Phase 2 needs a thin API wrapper or reimplementation of its provider-routing logic.
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore .env.example docs/IMPLEMENTATION_STATUS.md
git commit -m "chore: add root scaffolding, env template, implementation status"
```

---

### Task 2: server — package.json, tsconfig, minimal Express app with /health

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`
- Test: `server/test/health.test.ts`

**Interfaces:**
- Produces: `createApp(deps: { pool: Pool; version: string; commit: string }): Express` (from `server/src/app.ts`) — Task 4 (db/ready), Task 5 (version), Task 6 (logging/errors) all add to this same function.
- Consumes: nothing yet.

- [ ] **Step 1: Write `server/package.json`**

```json
{
  "name": "aiaccelerator-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:integration": "vitest run test/ready.integration.test.ts",
    "lint": "eslint src test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^4.19.2",
    "pg": "^8.12.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "@types/pg": "^8.11.6",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "eslint": "^9.9.0"
  }
}
```

- [ ] **Step 2: Write `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing test `server/test/health.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns 200 and status ok without touching the database", async () => {
    const fakePool = {} as Pool;
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test" });

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run (from `server/`): `npm install && npm test`
Expected: FAIL — `../src/app.js` does not exist.

- [ ] **Step 5: Write minimal implementation `server/src/app.ts`**

```typescript
import express, { Express } from "express";
import type { Pool } from "pg";

export interface AppDeps {
  pool: Pool;
  version: string;
  commit: string;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return app;
}
```

- [ ] **Step 6: Write `server/src/index.ts`**

```typescript
import { createApp } from "./app.js";
import { Pool } from "pg";

const port = Number(process.env.PORT ?? 4000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = createApp({ pool, version: "0.1.0", commit: process.env.GIT_SHA ?? "dev" });

app.listen(port, () => {
  console.log(JSON.stringify({ level: "info", msg: `server listening on ${port}` }));
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add server/package.json server/tsconfig.json server/src/app.ts server/src/index.ts server/test/health.test.ts
git commit -m "feat(server): scaffold Express app with GET /health"
```

---

### Task 3: server — config validation (loadConfig)

**Files:**
- Create: `server/src/config.ts`
- Test: `server/test/config.test.ts`
- Modify: `server/src/index.ts` (use `loadConfig` instead of raw `process.env`)

**Interfaces:**
- Produces: `interface AppConfig { port: number; databaseUrl: string; nodeEnv: string }` and `function loadConfig(env?: NodeJS.ProcessEnv): AppConfig` — Task 4 and Task 6 import `AppConfig`/`loadConfig` from `server/src/config.ts`.
- Consumes: `server/src/index.ts` (Task 2) currently reads `process.env` directly; this task replaces that.

- [ ] **Step 1: Write the failing test `server/test/config.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("throws a clear error when DATABASE_URL is missing", () => {
    expect(() => loadConfig({ PORT: "4000" })).toThrowError(
      "Missing required environment variable: DATABASE_URL"
    );
  });

  it("throws a clear error when PORT is missing", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://u:p@h:5432/d" })
    ).toThrowError("Missing required environment variable: PORT");
  });

  it("returns a parsed config when all required vars are present", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://u:p@h:5432/d",
      PORT: "4000",
      NODE_ENV: "test",
    });

    expect(config).toEqual({
      databaseUrl: "postgres://u:p@h:5432/d",
      port: 4000,
      nodeEnv: "test",
    });
  });

  it("defaults nodeEnv to development when unset", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://u:p@h:5432/d",
      PORT: "4000",
    });

    expect(config.nodeEnv).toBe("development");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/config.js` does not exist.

- [ ] **Step 3: Write minimal implementation `server/src/config.ts`**

```typescript
export interface AppConfig {
  databaseUrl: string;
  port: number;
  nodeEnv: string;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = requireEnv(env, "DATABASE_URL");
  const port = Number(requireEnv(env, "PORT"));
  const nodeEnv = env.NODE_ENV ?? "development";

  return { databaseUrl, port, nodeEnv };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Update `server/src/index.ts` to use `loadConfig`**

```typescript
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { Pool } from "pg";

const config = loadConfig();
const pool = new Pool({ connectionString: config.databaseUrl });
const app = createApp({ pool, version: "0.1.0", commit: process.env.GIT_SHA ?? "dev" });

app.listen(config.port, () => {
  console.log(JSON.stringify({ level: "info", msg: `server listening on ${config.port}` }));
});
```

- [ ] **Step 6: Commit**

```bash
git add server/src/config.ts server/test/config.test.ts server/src/index.ts
git commit -m "feat(server): add fail-fast env config validation"
```

---

### Task 4: server — Postgres pool, /ready endpoint, integration test

**Files:**
- Create: `server/src/db.ts`
- Modify: `server/src/app.ts` (add `/ready` route)
- Test: `server/test/ready.test.ts` (unit, mocked pool)
- Test: `server/test/ready.integration.test.ts` (real Postgres via `DATABASE_URL`)

**Interfaces:**
- Produces: `function checkDbConnection(pool: Pool): Promise<boolean>` from `server/src/db.ts` — used by `/ready` route in `app.ts`.
- Consumes: `AppDeps` from Task 2's `app.ts`.

- [ ] **Step 1: Write the failing unit test `server/test/ready.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

describe("GET /ready", () => {
  it("returns 200 when the database is reachable", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }) } as unknown as Pool;
    const app = createApp({ pool, version: "0.1.0", commit: "test" });

    const res = await request(app).get("/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("returns 503 with a structured error when the database is unreachable", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("connection refused")),
    } as unknown as Pool;
    const app = createApp({ pool, version: "0.1.0", commit: "test" });

    const res = await request(app).get("/ready");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: { code: "DB_UNAVAILABLE", message: "Database is unreachable" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `/ready` route does not exist (404).

- [ ] **Step 3: Write `server/src/db.ts`**

```typescript
import { Pool } from "pg";

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}

export async function checkDbConnection(pool: Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Add `/ready` route to `server/src/app.ts`**

```typescript
import express, { Express } from "express";
import type { Pool } from "pg";
import { checkDbConnection } from "./db.js";

export interface AppDeps {
  pool: Pool;
  version: string;
  commit: string;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/ready", async (_req, res) => {
    const dbOk = await checkDbConnection(deps.pool);
    if (!dbOk) {
      res
        .status(503)
        .json({ error: { code: "DB_UNAVAILABLE", message: "Database is unreachable" } });
      return;
    }
    res.status(200).json({ status: "ok" });
  });

  return app;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Write the integration test `server/test/ready.integration.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool } from "../src/db.js";
import { loadConfig } from "../src/config.js";

// Requires a reachable Postgres at DATABASE_URL (e.g. `docker compose up -d postgres`).
// Run explicitly via `npm run test:integration`; not part of the default `npm test`.
describe("GET /ready (integration)", () => {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const app = createApp({ pool, version: "0.1.0", commit: "test" });

  afterAll(async () => {
    await pool.end();
  });

  it("returns 200 against a real Postgres connection", async () => {
    const res = await request(app).get("/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 7: Run the integration test against a real Postgres**

Run (from repo root): `docker compose up -d postgres`
Run (from `server/`): `DATABASE_URL=postgres://accelerator:accelerator@localhost:5432/accelerator PORT=4000 npm run test:integration`
Expected: PASS (skip this step until Task 10's `docker-compose.yml` exists — revisit after Task 10 to confirm).

- [ ] **Step 8: Commit**

```bash
git add server/src/db.ts server/src/app.ts server/test/ready.test.ts server/test/ready.integration.test.ts
git commit -m "feat(server): add Postgres pool and GET /ready with DB check"
```

---

### Task 5: server — /version endpoint

**Files:**
- Modify: `server/src/app.ts` (add `/version` route)
- Test: `server/test/version.test.ts`

**Interfaces:**
- Consumes: `AppDeps.version` and `AppDeps.commit` from Task 2/4's `app.ts`.

- [ ] **Step 1: Write the failing test `server/test/version.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

describe("GET /version", () => {
  it("returns the configured version and commit", async () => {
    const fakePool = {} as Pool;
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "abc1234" });

    const res = await request(app).get("/version");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: "0.1.0", commit: "abc1234" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `/version` route does not exist (404).

- [ ] **Step 3: Add `/version` route to `server/src/app.ts`**

```typescript
  app.get("/version", (_req, res) => {
    res.status(200).json({ version: deps.version, commit: deps.commit });
  });
```

(Insert this block inside `createApp`, after the `/ready` route, before `return app;`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/app.ts server/test/version.test.ts
git commit -m "feat(server): add GET /version"
```

---

### Task 6: server — structured logging, request ID, error handler

**Files:**
- Create: `server/src/logger.ts`
- Create: `server/src/errors.ts`
- Modify: `server/src/app.ts` (wire in request-ID middleware and error handler)
- Test: `server/test/errors.test.ts`

**Interfaces:**
- Produces: `function requestIdMiddleware(req, res, next): void` and `function errorHandler(err, req, res, next): void` from `server/src/errors.ts`; `function logJson(level: "info"|"error", msg: string, fields?: Record<string, unknown>): void` from `server/src/logger.ts`.
- Consumes: `AppDeps` from Task 2's `app.ts`.

- [ ] **Step 1: Write the failing test `server/test/errors.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

describe("error handling", () => {
  it("returns a structured 500 body and never leaks a stack trace", async () => {
    const throwingPool = {
      query: () => {
        throw new Error("boom");
      },
    } as unknown as Pool;
    const app = createApp({ pool: throwingPool, version: "0.1.0", commit: "test" });

    const res = await request(app).get("/ready");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: { code: "DB_UNAVAILABLE", message: "Database is unreachable" },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:\d+/);
  });

  it("attaches an X-Request-Id header to every response", async () => {
    const fakePool = {} as Pool;
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test" });

    const res = await request(app).get("/health");

    expect(res.headers["x-request-id"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — no `x-request-id` header set yet.

- [ ] **Step 3: Write `server/src/logger.ts`**

```typescript
type Level = "info" | "error";

export function logJson(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, msg, ...fields, time: new Date().toISOString() });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}
```

- [ ] **Step 4: Write `server/src/errors.ts`**

```typescript
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { logJson } from "./logger.js";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = randomUUID();
  res.setHeader("X-Request-Id", id);
  (req as Request & { id: string }).id = id;
  next();
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const message = err instanceof Error ? err.message : "Unknown error";
  logJson("error", "unhandled error", {
    requestId: (req as Request & { id?: string }).id,
    path: req.path,
    message,
  });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}
```

- [ ] **Step 5: Wire both into `server/src/app.ts`**

```typescript
import express, { Express } from "express";
import type { Pool } from "pg";
import { checkDbConnection } from "./db.js";
import { requestIdMiddleware, errorHandler } from "./errors.js";

export interface AppDeps {
  pool: Pool;
  version: string;
  commit: string;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/ready", async (_req, res) => {
    const dbOk = await checkDbConnection(deps.pool);
    if (!dbOk) {
      res
        .status(503)
        .json({ error: { code: "DB_UNAVAILABLE", message: "Database is unreachable" } });
      return;
    }
    res.status(200).json({ status: "ok" });
  });

  app.get("/version", (_req, res) => {
    res.status(200).json({ version: deps.version, commit: deps.commit });
  });

  app.use(errorHandler);

  return app;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/logger.ts server/src/errors.ts server/src/app.ts server/test/errors.test.ts
git commit -m "feat(server): add structured logging, request IDs, and error handler"
```

---

### Task 7: server — Dockerfile

**Files:**
- Create: `server/Dockerfile`
- Create: `server/.dockerignore`

**Interfaces:**
- Consumes: `server/package.json` build/start scripts from Task 2.
- Produces: an image exposing `PORT` with `HEALTHCHECK` hitting `/health`, consumed by `docker-compose.yml` in Task 10.

- [ ] **Step 1: Write `server/.dockerignore`**

```
node_modules
dist
*.log
.env
test
```

- [ ] **Step 2: Write `server/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Build the image to verify it compiles**

Run (from `server/`): `docker build -t aiaccelerator-server .`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add server/Dockerfile server/.dockerignore
git commit -m "feat(server): add multi-stage Dockerfile with healthcheck"
```

---

### Task 8: client — Vite React TS scaffold with health-check landing page

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Test: `client/src/App.test.tsx`

**Interfaces:**
- Produces: `App` component (default export from `client/src/App.tsx`) that `fetch`es `/api/health` — Task 10's Vite dev proxy and nginx config both route `/api/*` to `server`.

- [ ] **Step 1: Write `client/package.json`**

```json
{
  "name": "aiaccelerator-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `client/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://server:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 4: Write `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>AI Accelerator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write the failing test `client/src/App.test.tsx`**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("shows the backend status once the health check resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok" }),
      })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText(/backend status: ok/i)).toBeInTheDocument());
  });

  it("shows an error state when the health check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/backend status: unreachable/i)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run (from `client/`): `npm install && npm test`
Expected: FAIL — `./App` does not exist.

- [ ] **Step 7: Write `client/src/App.tsx`**

```typescript
import { useEffect, useState } from "react";

type Status = "loading" | "ok" | "unreachable";

export default function App() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("not ok"))))
      .then(() => setStatus("ok"))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <main>
      <h1>AI Accelerator</h1>
      <p>Backend status: {status}</p>
    </main>
  );
}
```

- [ ] **Step 8: Write `client/src/main.tsx`**

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add client/package.json client/tsconfig.json client/vite.config.ts client/index.html client/src/main.tsx client/src/App.tsx client/src/App.test.tsx
git commit -m "feat(client): scaffold Vite React app with backend health check"
```

---

### Task 9: client — Dockerfile and nginx config

**Files:**
- Create: `client/Dockerfile`
- Create: `client/.dockerignore`
- Create: `client/nginx.conf`

**Interfaces:**
- Consumes: `client/package.json` build script from Task 8.
- Produces: an image serving the built SPA on port 80, proxying `/api/*` to `server:4000`, consumed by `docker-compose.yml` in Task 10.

- [ ] **Step 1: Write `client/.dockerignore`**

```
node_modules
dist
*.log
```

- [ ] **Step 2: Write `client/nginx.conf`**

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location /api/ {
    proxy_pass http://server:4000/;
    proxy_set_header Host $host;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

- [ ] **Step 3: Write `client/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O- http://localhost:80/ || exit 1
EXPOSE 80
```

- [ ] **Step 4: Build the image to verify it compiles**

Run (from `client/`): `docker build -t aiaccelerator-client .`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add client/Dockerfile client/.dockerignore client/nginx.conf
git commit -m "feat(client): add nginx-based production Dockerfile"
```

---

### Task 10: docker-compose.yml wiring all three services

**Files:**
- Create: `docker-compose.yml`

**Interfaces:**
- Consumes: `server/Dockerfile` (Task 7), `client/Dockerfile` (Task 9), `.env.example` variable names (Task 1).

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: accelerator
      POSTGRES_PASSWORD: accelerator
      POSTGRES_DB: accelerator
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U accelerator -d accelerator"]
      interval: 5s
      timeout: 3s
      retries: 5
    ports:
      - "5432:5432"

  server:
    build: ./server
    environment:
      DATABASE_URL: ${DATABASE_URL:-postgres://accelerator:accelerator@postgres:5432/accelerator}
      PORT: ${PORT:-4000}
      NODE_ENV: ${NODE_ENV:-development}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
    ports:
      - "4000:4000"

  client:
    build: ./client
    depends_on:
      server:
        condition: service_healthy
    ports:
      - "8080:80"

volumes:
  pgdata:
```

- [ ] **Step 2: Bring the stack up and verify health**

Run: `cp .env.example .env && docker compose up -d --build`
Run: `docker compose ps`
Expected: all three services show `healthy` (or `running` for services without a defined healthcheck window yet — `postgres` and `server` show `healthy` explicitly).

- [ ] **Step 3: Verify endpoints manually**

Run: `curl -s http://localhost:4000/health`
Expected: `{"status":"ok"}`

Run: `curl -s http://localhost:4000/ready`
Expected: `{"status":"ok"}`

Run: `curl -s http://localhost:4000/version`
Expected: `{"version":"0.1.0","commit":"dev"}`

Run: `curl -s http://localhost:8080/`
Expected: HTML containing `Backend status: ok` after client-side fetch (or check via browser).

- [ ] **Step 4: Re-run Task 4's integration test now that Postgres is reachable**

Run (from `server/`): `DATABASE_URL=postgres://accelerator:accelerator@localhost:5432/accelerator PORT=4000 npm run test:integration`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: wire postgres, server, and client into docker-compose"
```

---

### Task 11: Makefile

**Files:**
- Create: `Makefile`

**Interfaces:**
- Consumes: `docker-compose.yml` (Task 10), `server/package.json` and `client/package.json` scripts (Tasks 2, 8).

- [ ] **Step 1: Write `Makefile`**

```makefile
.PHONY: dev stop restart logs test lint clean reset test-containers

dev:
	docker compose up -d --build

stop:
	docker compose stop

restart:
	docker compose restart

logs:
	docker compose logs -f

test:
	cd server && npm test
	cd client && npm test

lint:
	cd server && npm run lint
	cd client && npm run lint

clean:
	docker compose down

reset:
	docker compose down -v

test-containers:
	bash scripts/test-containers.sh
```

- [ ] **Step 2: Verify targets run**

Run: `make dev`
Expected: stack starts (same as Task 10 Step 2).

Run: `make stop`
Expected: containers stop without removing volumes.

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "chore: add Makefile with dev/stop/restart/logs/test/lint/clean/reset targets"
```

---

### Task 12: container test script (test-containers)

**Files:**
- Create: `scripts/test-containers.sh`

**Interfaces:**
- Consumes: `docker-compose.yml` (Task 10), the `Makefile`'s `test-containers` target (Task 11).

- [ ] **Step 1: Write `scripts/test-containers.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  echo "Tearing down..."
  docker compose down -v
}
trap cleanup EXIT

echo "Building and starting stack..."
docker compose up -d --build

echo "Waiting for services to report healthy..."
for i in $(seq 1 30); do
  unhealthy=$(docker compose ps --format json | grep -c '"Health":"unhealthy"' || true)
  starting=$(docker compose ps --format json | grep -c '"Health":"starting"' || true)
  if [ "$unhealthy" = "0" ] && [ "$starting" = "0" ]; then
    echo "All services healthy."
    break
  fi
  if [ "$i" = "30" ]; then
    echo "Timed out waiting for services to become healthy."
    docker compose ps
    exit 1
  fi
  sleep 2
done

echo "Verifying endpoints..."
curl -sf http://localhost:4000/health | grep -q '"status":"ok"'
curl -sf http://localhost:4000/ready | grep -q '"status":"ok"'
curl -sf http://localhost:4000/version | grep -q '"version"'
curl -sf http://localhost:8080/ >/dev/null

echo "Container test passed."
```

- [ ] **Step 2: Make it executable and run it**

Run: `chmod +x scripts/test-containers.sh && make test-containers`
Expected: script prints "Container test passed." and exits 0; stack is torn down afterward via the trap.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-containers.sh
git commit -m "test: add end-to-end container health/endpoint test script"
```

---

### Task 13: Final validation against Definition of Done

**Files:** none created — verification only.

- [ ] **Step 1: Clean rebuild from scratch**

Run: `docker compose down -v && docker compose build --no-cache && docker compose up -d`

- [ ] **Step 2: Verify all services healthy**

Run: `docker compose ps`
Expected: `postgres` and `server` show `healthy`; `client` is `running` (nginx has no compose-level healthcheck dependency beyond its own `HEALTHCHECK` instruction).

- [ ] **Step 3: Run full test suite and lint**

Run: `make test && make lint`
Expected: all pass.

- [ ] **Step 4: Run the container smoke test**

Run: `make test-containers`
Expected: passes (this also re-validates the clean-rebuild state).

- [ ] **Step 5: Update `docs/IMPLEMENTATION_STATUS.md`**

Change the "Phase 1 — Foundation (in progress)" heading to "Phase 1 — Foundation (complete)" and check off each bullet under it.

- [ ] **Step 6: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "docs: mark Phase 1 Foundation complete"
```
