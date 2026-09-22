# AI Accelerator — Phase 2: AI Provider Integration (the Conclave) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the server a thin, typed client for the already-deployed Council-of-ai-experts webapp ("the conclave"), exposed through two pass-through routes (`POST /ai/quick`, `POST /ai/session`), with no generic multi-provider abstraction and no other AI backend involved.

**Architecture:** `server/src/ai/client.ts` wraps the conclave's two external HTTP endpoints with `fetch`, translating non-2xx/network failures into a typed `AiClientError`. `server/src/app.ts` gains two routes that inject this client via `AppDeps` (same dependency-injection pattern as `pool`), map `AiClientError` codes to HTTP statuses, and stay within the existing `{error:{code,message}}` contract. Config for the conclave's URL/key is optional — the server still boots and serves `/health`/`/ready` without it.

**Tech Stack:** Node.js 20 + TypeScript (existing server), native `fetch`/`AbortSignal.timeout`, Vitest + Supertest for tests (existing patterns).

**Spec:** `docs/superpowers/specs/2026-09-22-phase2-ai-provider-design.md`

## Global Constraints

- No generic AI-provider abstraction — a direct, conclave-shaped client only (explicit user decision).
- `COUNCIL_BASE_URL`/`COUNCIL_API_KEY` are optional at startup — never fail-fast on them, unlike `DATABASE_URL`/`PORT`.
- Conclave errors normalized to `{error:{code,message}}` with codes: `AI_NOT_CONFIGURED` (503), `AI_UPSTREAM_ERROR` (502), `AI_BUSY` (409), `AI_BAD_REQUEST` (400), `AI_UNREACHABLE` (502).
- No automated test makes a real call to the conclave — both its endpoints spend real provider quota.
- No secrets (the API key) ever appear in a log line or error body.
- `runSession` uses a bounded timeout, not an indefinite wait.

---

### Task 1: `server/src/ai/errors.ts` — typed AI client error

**Files:**
- Create: `server/src/ai/errors.ts`
- Test: `server/test/ai/errors.test.ts`

**Interfaces:**
- Produces: `export type AiErrorCode = "AI_NOT_CONFIGURED" | "AI_UPSTREAM_ERROR" | "AI_BUSY" | "AI_BAD_REQUEST" | "AI_UNREACHABLE"` and `export class AiClientError extends Error { constructor(public readonly code: AiErrorCode, message: string) }` — Task 2 throws these, Task 4 catches and maps them.

- [ ] **Step 1: Write the failing test `server/test/ai/errors.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { AiClientError } from "../../src/ai/errors.js";

describe("AiClientError", () => {
  it("carries a code and message and is a real Error", () => {
    const err = new AiClientError("AI_BUSY", "Conclave is busy");

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("AI_BUSY");
    expect(err.message).toBe("Conclave is busy");
    expect(err.name).toBe("AiClientError");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `server/`): `npm test`
Expected: FAIL — `../../src/ai/errors.js` does not exist.

- [ ] **Step 3: Write `server/src/ai/errors.ts`**

```typescript
export type AiErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_UPSTREAM_ERROR"
  | "AI_BUSY"
  | "AI_BAD_REQUEST"
  | "AI_UNREACHABLE";

export class AiClientError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AiClientError";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/errors.ts server/test/ai/errors.test.ts
git commit -m "feat(server): add typed AiClientError"
```

---

### Task 2: `server/src/ai/client.ts` — conclave HTTP client

**Files:**
- Create: `server/src/ai/client.ts`
- Test: `server/test/ai/client.test.ts`

**Interfaces:**
- Consumes: `AiClientError`, `AiErrorCode` from Task 1's `server/src/ai/errors.js`.
- Produces: `export interface AiClientConfig { baseUrl: string; apiKey: string }`, `export interface QuickAskResult { ok: true; model: string; response: string }`, `export interface SessionResult { ok: true; sessionId: string; synthesis: unknown }`, `export interface AiClient { quickAsk(model: string, system: string, prompt: string): Promise<QuickAskResult>; runSession(goal: string): Promise<SessionResult> }`, `export function createAiClient(config: AiClientConfig): AiClient` — Task 4 imports `AiClient` and `createAiClient` from this file.

- [ ] **Step 1: Write the failing tests `server/test/ai/client.test.ts`**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { createAiClient } from "../../src/ai/client.js";
import { AiClientError } from "../../src/ai/errors.js";

const config = { baseUrl: "http://conclave.test", apiKey: "test-key" };

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce(response: { ok: boolean; status?: number; json: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("createAiClient.quickAsk", () => {
  it("posts to /api/external/quick with the X-API-Key header and returns the parsed result", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ ok: true, model: "Claude", response: "hi" }) });
    const client = createAiClient(config);

    const result = await client.quickAsk("Claude", "sys", "prompt");

    expect(result).toEqual({ ok: true, model: "Claude", response: "hi" });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://conclave.test/api/external/quick");
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-Key"]).toBe("test-key");
    expect(JSON.parse(init.body)).toEqual({ model: "Claude", system: "sys", prompt: "prompt" });
  });

  it("maps a 403 response to AI_UPSTREAM_ERROR", async () => {
    mockFetchOnce({ ok: false, status: 403, json: async () => ({}) });
    const client = createAiClient(config);

    await expect(client.quickAsk("Claude", "sys", "prompt")).rejects.toMatchObject({
      code: "AI_UPSTREAM_ERROR",
    });
  });

  it("maps a 409 response to AI_BUSY", async () => {
    mockFetchOnce({ ok: false, status: 409, json: async () => ({}) });
    const client = createAiClient(config);

    await expect(client.quickAsk("Claude", "sys", "prompt")).rejects.toMatchObject({ code: "AI_BUSY" });
  });

  it("maps a 400 response to AI_BAD_REQUEST", async () => {
    mockFetchOnce({ ok: false, status: 400, json: async () => ({}) });
    const client = createAiClient(config);

    await expect(client.quickAsk("Claude", "sys", "prompt")).rejects.toMatchObject({
      code: "AI_BAD_REQUEST",
    });
  });

  it("maps a network failure to AI_UNREACHABLE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const client = createAiClient(config);

    await expect(client.quickAsk("Claude", "sys", "prompt")).rejects.toMatchObject({
      code: "AI_UNREACHABLE",
    });
  });
});

describe("createAiClient.runSession", () => {
  it("posts to /api/external/session and maps session_id to sessionId", async () => {
    mockFetchOnce({
      ok: true,
      json: async () => ({ ok: true, session_id: "abc123", synthesis: { decision: "proceed" } }),
    });
    const client = createAiClient(config);

    const result = await client.runSession("evaluate X");

    expect(result).toEqual({ ok: true, sessionId: "abc123", synthesis: { decision: "proceed" } });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://conclave.test/api/external/session");
    expect(JSON.parse(init.body)).toEqual({ goal: "evaluate X" });
  });

  it("throws AI_UPSTREAM_ERROR when the conclave returns ok:false in a 200 response", async () => {
    mockFetchOnce({
      ok: true,
      json: async () => ({ ok: false, session_id: "abc123", error: { message: "chairman crashed" } }),
    });
    const client = createAiClient(config);

    await expect(client.runSession("evaluate X")).rejects.toMatchObject({ code: "AI_UPSTREAM_ERROR" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `../../src/ai/client.js` does not exist.

- [ ] **Step 3: Write `server/src/ai/client.ts`**

```typescript
import { AiClientError } from "./errors.js";

export interface AiClientConfig {
  baseUrl: string;
  apiKey: string;
}

export interface QuickAskResult {
  ok: true;
  model: string;
  response: string;
}

export interface SessionResult {
  ok: true;
  sessionId: string;
  synthesis: unknown;
}

export interface AiClient {
  quickAsk(model: string, system: string, prompt: string): Promise<QuickAskResult>;
  runSession(goal: string): Promise<SessionResult>;
}

async function postJson(url: string, apiKey: string, body: unknown, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new AiClientError("AI_UNREACHABLE", "Could not reach the conclave");
  }
}

function mapStatusToError(status: number): AiClientError {
  if (status === 403) return new AiClientError("AI_UPSTREAM_ERROR", "Conclave rejected the API key");
  if (status === 409) return new AiClientError("AI_BUSY", "Conclave is busy with another session");
  if (status === 400) return new AiClientError("AI_BAD_REQUEST", "Conclave rejected the request");
  return new AiClientError("AI_UPSTREAM_ERROR", `Conclave returned status ${status}`);
}

export function createAiClient(config: AiClientConfig): AiClient {
  return {
    async quickAsk(model, system, prompt) {
      const res = await postJson(
        `${config.baseUrl}/api/external/quick`,
        config.apiKey,
        { model, system, prompt },
        30_000
      );
      if (!res.ok) throw mapStatusToError(res.status);
      return (await res.json()) as QuickAskResult;
    },

    async runSession(goal) {
      const res = await postJson(
        `${config.baseUrl}/api/external/session`,
        config.apiKey,
        { goal },
        5 * 60_000
      );
      if (!res.ok) throw mapStatusToError(res.status);
      const body = (await res.json()) as {
        ok: boolean;
        session_id: string;
        synthesis?: unknown;
        error?: unknown;
      };
      if (!body.ok) {
        throw new AiClientError("AI_UPSTREAM_ERROR", `Conclave session failed: ${JSON.stringify(body.error)}`);
      }
      return { ok: true, sessionId: body.session_id, synthesis: body.synthesis };
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/client.ts server/test/ai/client.test.ts
git commit -m "feat(server): add AiClient wrapping the conclave's external endpoints"
```

---

### Task 3: server config — optional conclave settings

**Files:**
- Modify: `server/src/config.ts`
- Modify: `server/test/config.test.ts`

**Interfaces:**
- Consumes: existing `AppConfig`, `loadConfig` from Task 1 (Phase 1) — extends the interface, does not replace it.
- Produces: `AppConfig.councilBaseUrl?: string`, `AppConfig.councilApiKey?: string` — Task 5 (`index.ts`) reads these to decide whether to construct an `AiClient`.

- [ ] **Step 1: Write the failing tests (add to `server/test/config.test.ts`)**

Add these two `it` blocks inside the existing `describe("loadConfig", ...)` block:

```typescript
  it("leaves councilBaseUrl and councilApiKey undefined when unset", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://u:p@h:5432/d",
      PORT: "4000",
    });

    expect(config.councilBaseUrl).toBeUndefined();
    expect(config.councilApiKey).toBeUndefined();
  });

  it("reads councilBaseUrl and councilApiKey when set", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://u:p@h:5432/d",
      PORT: "4000",
      COUNCIL_BASE_URL: "http://192.168.1.195:8010",
      COUNCIL_API_KEY: "secret",
    });

    expect(config.councilBaseUrl).toBe("http://192.168.1.195:8010");
    expect(config.councilApiKey).toBe("secret");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `config.councilBaseUrl` is `undefined` in the second test where it should be a string (or a TypeScript error if `AppConfig` doesn't have the field yet, depending on how the test file is typed — either way, it fails).

- [ ] **Step 3: Modify `server/src/config.ts`**

Update the `AppConfig` interface and `loadConfig` function:

```typescript
export interface AppConfig {
  databaseUrl: string;
  port: number;
  nodeEnv: string;
  councilBaseUrl?: string;
  councilApiKey?: string;
}
```

In `loadConfig`, after the existing `nodeEnv` line, add:

```typescript
  const councilBaseUrl = env.COUNCIL_BASE_URL || undefined;
  const councilApiKey = env.COUNCIL_API_KEY || undefined;
```

And include both in the returned object: `return { databaseUrl, port, nodeEnv, councilBaseUrl, councilApiKey };`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — note the existing test `"returns a parsed config when all required vars are present"` uses `toEqual` with an exact object; if it doesn't already tolerate extra `undefined` fields, update its expected object to include `councilBaseUrl: undefined, councilApiKey: undefined` so it still passes (Vitest's `toEqual` treats an explicit `undefined` property the same as an absent one, so this should already pass unchanged — verify, and only touch that test if it doesn't).

- [ ] **Step 5: Commit**

```bash
git add server/src/config.ts server/test/config.test.ts
git commit -m "feat(server): add optional COUNCIL_BASE_URL/COUNCIL_API_KEY config"
```

---

### Task 4: server — `/ai/quick` and `/ai/session` routes

**Files:**
- Modify: `server/src/app.ts`
- Test: `server/test/ai/routes.test.ts`

**Interfaces:**
- Consumes: `AiClient`, `AiClientError`, `AiErrorCode` from Task 1/2's `server/src/ai/{errors,client}.js`.
- Produces: `AppDeps.aiClient?: AiClient` (new optional field) — Task 5 (`index.ts`) constructs this and passes it in.

- [ ] **Step 1: Write the failing tests `server/test/ai/routes.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { AiClientError } from "../../src/ai/errors.js";
import type { AiClient } from "../../src/ai/client.js";

const fakePool = {} as Pool;

function appWithAiClient(aiClient?: AiClient) {
  return createApp({ pool: fakePool, version: "0.1.0", commit: "test", aiClient });
}

describe("POST /ai/quick", () => {
  it("returns 503 AI_NOT_CONFIGURED when no aiClient is configured", async () => {
    const app = appWithAiClient(undefined);

    const res = await request(app).post("/ai/quick").send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: { code: "AI_NOT_CONFIGURED", message: expect.any(String) } });
  });

  it("returns 400 AI_BAD_REQUEST when the body is missing required fields", async () => {
    const aiClient = { quickAsk: vi.fn(), runSession: vi.fn() } as unknown as AiClient;
    const app = appWithAiClient(aiClient);

    const res = await request(app).post("/ai/quick").send({ model: "Claude" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("AI_BAD_REQUEST");
    expect(aiClient.quickAsk).not.toHaveBeenCalled();
  });

  it("passes through a successful quickAsk result", async () => {
    const aiClient = {
      quickAsk: vi.fn().mockResolvedValue({ ok: true, model: "Claude", response: "hi" }),
      runSession: vi.fn(),
    } as unknown as AiClient;
    const app = appWithAiClient(aiClient);

    const res = await request(app).post("/ai/quick").send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, model: "Claude", response: "hi" });
    expect(aiClient.quickAsk).toHaveBeenCalledWith("Claude", "s", "p");
  });

  it("maps an AiClientError to the matching HTTP status", async () => {
    const aiClient = {
      quickAsk: vi.fn().mockRejectedValue(new AiClientError("AI_BUSY", "busy")),
      runSession: vi.fn(),
    } as unknown as AiClient;
    const app = appWithAiClient(aiClient);

    const res = await request(app).post("/ai/quick").send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: "AI_BUSY", message: "busy" } });
  });
});

describe("POST /ai/session", () => {
  it("returns 503 AI_NOT_CONFIGURED when no aiClient is configured", async () => {
    const app = appWithAiClient(undefined);

    const res = await request(app).post("/ai/session").send({ goal: "evaluate X" });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("returns 400 AI_BAD_REQUEST when goal is missing", async () => {
    const aiClient = { quickAsk: vi.fn(), runSession: vi.fn() } as unknown as AiClient;
    const app = appWithAiClient(aiClient);

    const res = await request(app).post("/ai/session").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("AI_BAD_REQUEST");
  });

  it("passes through a successful runSession result", async () => {
    const aiClient = {
      quickAsk: vi.fn(),
      runSession: vi.fn().mockResolvedValue({ ok: true, sessionId: "abc123", synthesis: { decision: "go" } }),
    } as unknown as AiClient;
    const app = appWithAiClient(aiClient);

    const res = await request(app).post("/ai/session").send({ goal: "evaluate X" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, session_id: "abc123", synthesis: { decision: "go" } });
    expect(aiClient.runSession).toHaveBeenCalledWith("evaluate X");
  });

  it("maps an AiClientError to the matching HTTP status", async () => {
    const aiClient = {
      quickAsk: vi.fn(),
      runSession: vi.fn().mockRejectedValue(new AiClientError("AI_UNREACHABLE", "down")),
    } as unknown as AiClient;
    const app = appWithAiClient(aiClient);

    const res = await request(app).post("/ai/session").send({ goal: "evaluate X" });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: { code: "AI_UNREACHABLE", message: "down" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — the routes don't exist yet (404s), and `AppDeps` has no `aiClient` field (TypeScript error).

- [ ] **Step 3: Modify `server/src/app.ts`**

Add the import at the top, alongside the existing imports:

```typescript
import type { AiClient } from "./ai/client.js";
import { AiClientError, type AiErrorCode } from "./ai/errors.js";
```

Add `aiClient?: AiClient;` to the `AppDeps` interface.

Add this helper function above `createApp` (or inside it, above `return app;` — your call, keep it out of the route handlers themselves):

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

(The `default` branch is unreachable given `AiErrorCode`'s five members are all listed above it, but `tsc --strict` requires every code path of a function to return explicitly — a switch with no `default` doesn't satisfy that for a non-`void` return type, so this avoids a real compile error.)

Add these two routes inside `createApp`, after the existing `/version` route and before the 404 handler (`app.use((_req, res) => {...})`):

```typescript
  app.post("/ai/quick", async (req, res, next) => {
    if (!deps.aiClient) {
      res.status(503).json({ error: { code: "AI_NOT_CONFIGURED", message: "AI backend is not configured" } });
      return;
    }
    const { model, system, prompt } = req.body ?? {};
    if (typeof model !== "string" || typeof system !== "string" || typeof prompt !== "string") {
      res
        .status(400)
        .json({ error: { code: "AI_BAD_REQUEST", message: "model, system, and prompt must be strings" } });
      return;
    }
    try {
      const result = await deps.aiClient.quickAsk(model, system, prompt);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AiClientError) {
        res.status(aiErrorStatus(err.code)).json({ error: { code: err.code, message: err.message } });
        return;
      }
      next(err);
    }
  });

  app.post("/ai/session", async (req, res, next) => {
    if (!deps.aiClient) {
      res.status(503).json({ error: { code: "AI_NOT_CONFIGURED", message: "AI backend is not configured" } });
      return;
    }
    const { goal } = req.body ?? {};
    if (typeof goal !== "string") {
      res.status(400).json({ error: { code: "AI_BAD_REQUEST", message: "goal must be a string" } });
      return;
    }
    try {
      const result = await deps.aiClient.runSession(goal);
      res.status(200).json({ ok: result.ok, session_id: result.sessionId, synthesis: result.synthesis });
    } catch (err) {
      if (err instanceof AiClientError) {
        res.status(aiErrorStatus(err.code)).json({ error: { code: err.code, message: err.message } });
        return;
      }
      next(err);
    }
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — and confirm the full suite (all prior Phase 1 tests plus these) still passes, nothing broken by the `AppDeps` change.

- [ ] **Step 5: Commit**

```bash
git add server/src/app.ts server/test/ai/routes.test.ts
git commit -m "feat(server): add POST /ai/quick and POST /ai/session routes"
```

---

### Task 5: wire config into `index.ts`, docker-compose, and `.env.example`

**Files:**
- Modify: `server/src/index.ts`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `createAiClient` from Task 2, `config.councilBaseUrl`/`config.councilApiKey` from Task 3, `AppDeps.aiClient` from Task 4.

- [ ] **Step 1: Modify `server/src/index.ts`**

Add the import:

```typescript
import { createAiClient } from "./ai/client.js";
```

Before the `createApp({...})` call, add:

```typescript
const aiClient =
  config.councilBaseUrl && config.councilApiKey
    ? createAiClient({ baseUrl: config.councilBaseUrl, apiKey: config.councilApiKey })
    : undefined;
```

Update the `createApp` call to pass `aiClient` as a fourth property in the deps object (alongside `pool`, `version`, `commit`).

- [ ] **Step 2: Modify `docker-compose.yml`**

In the `server` service's `environment:` block, add two lines alongside the existing `DATABASE_URL`/`PORT`/`NODE_ENV`:

```yaml
      COUNCIL_BASE_URL: ${COUNCIL_BASE_URL:-}
      COUNCIL_API_KEY: ${COUNCIL_API_KEY:-}
```

- [ ] **Step 3: Modify `.env.example`**

Uncomment/replace the placeholder AI-provider lines with:

```dotenv
# Optional (enable features once available)
# The conclave's own external-API auth: http://<host>:<port> and the X-API-Key value.
# Leave both unset and /ai/quick + /ai/session return 503 AI_NOT_CONFIGURED.
# COUNCIL_BASE_URL=http://192.168.1.195:8010
# COUNCIL_API_KEY=
```

(Replace whatever placeholder `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` lines are there from Phase 1 — this project doesn't call those providers directly, per Phase 2's spec.)

- [ ] **Step 4: Rebuild and verify locally**

Run: `docker compose up -d --build`
Run: `docker compose ps` — confirm `postgres` and `server` still show healthy (proving the optional config doesn't break startup when unset).
Run: `curl -s -X POST http://localhost:4000/ai/quick -H "Content-Type: application/json" -d '{"model":"Claude","system":"s","prompt":"p"}'`
Expected: `{"error":{"code":"AI_NOT_CONFIGURED","message":"..."}}` with HTTP 503 (since `.env` doesn't have real conclave credentials by default).

- [ ] **Step 5: Manual live verification (not an automated test)**

With the repo's real `.env` populated with the actual `COUNCIL_BASE_URL=http://192.168.1.195:8010` and a real `COUNCIL_API_KEY`, restart the stack (`docker compose up -d --build`) and run:

```bash
curl -s -X POST http://localhost:4000/ai/quick \
  -H "Content-Type: application/json" \
  -d '{"model":"Claude","system":"You are a helpful assistant.","prompt":"Say hello in five words or fewer."}'
```

Expected: HTTP 200 with `{"ok":true,"model":"Claude","response":"..."}` — a real response from the conclave. This spends real provider quota (one small call) — do this once, not repeatedly. Record the result in the task's report; do not commit any real API key.

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts docker-compose.yml .env.example
git commit -m "feat: wire optional conclave config into index.ts, compose, and .env.example"
```

---

### Task 6: final validation against Phase 2's Definition of Done

**Files:** none created — verification only.

- [ ] **Step 1: Full test suite**

Run: `cd server && npm test` — confirm all tests pass (Phase 1's 14 plus Phase 2's new ones).
Run: `cd client && npm test` — confirm unaffected (Phase 2 touches no client code), 2/2 passing.

- [ ] **Step 2: Lint**

Run: `cd server && npm run lint` and `cd client && npm run lint` — both clean.

- [ ] **Step 3: Clean rebuild**

Run: `docker compose down -v && docker compose build --no-cache && docker compose up -d`
Run: `docker compose ps` — `postgres` and `server` healthy, with `COUNCIL_BASE_URL`/`COUNCIL_API_KEY` unset in `.env` (default state) — confirms the "optional, doesn't break startup" requirement one more time from a clean image.

- [ ] **Step 4: Confirm no secrets committed**

Run: `git log -p -- .env.example docker-compose.yml server/src/index.ts server/src/config.ts | grep -iE "COUNCIL_API_KEY=.+[a-zA-Z0-9]"` (excluding the `${COUNCIL_API_KEY:-}` interpolation syntax itself)
Expected: no output — no real key value anywhere in the diff history for this task's commits.

- [ ] **Step 5: Update `docs/IMPLEMENTATION_STATUS.md`**

Add a new section (after the existing Phase 1 one):

```markdown
## Phase 2 — AI Provider Integration (complete)

- [x] AiClient wrapping the conclave's /api/external/quick and /api/external/session
- [x] POST /ai/quick and POST /ai/session routes
- [x] COUNCIL_BASE_URL/COUNCIL_API_KEY optional, server boots without them
- [x] Manually verified against the live conclave
```

Update the "Not yet implemented" list to remove Phase 2 and keep Phases 3-5.

- [ ] **Step 6: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "docs: mark Phase 2 AI Provider Integration complete"
```
