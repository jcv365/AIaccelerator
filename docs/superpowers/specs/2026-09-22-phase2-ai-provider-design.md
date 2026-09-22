# AI Accelerator — Phase 2: AI Provider Integration (the Conclave)

## Context

Phase 1 (Foundation) is complete and merged: Docker Compose skeleton with
Postgres + Express/TS server + React/Vite client, no AI logic yet. Phase 2
adds the platform's only AI backend integration.

The user has an existing, separately-deployed project — `Council-of-ai-experts`
("the conclave") — a FastAPI webapp (`council/webapp.py`) already running at
`http://192.168.1.195:8010`, exposing two endpoints built specifically for
external callers:

- `POST /api/external/quick` — fast, stateless, single-expert passthrough.
  Body: `{model, system, prompt}`, where `model` must name a configured
  expert in the conclave's own roster (`experts.yaml`) — e.g. `Claude`,
  `ChatGPT`, `Fusion`, `Nemotron`, `Nemotron Ultra`, `GPT-OSS`, `Abacus`,
  `Antigravity`, `Kimi`. Returns `{ok, model, response}`.
- `POST /api/external/session` — full multi-expert deliberation (proposal →
  scrutiny → chairman synthesis), blocking for the real duration of a round
  (minutes). Body: `{goal}`. Returns `{ok, session_id, synthesis}` on
  success, `{ok: false, session_id, error}` on failure, or `409` if a
  session is already running (single-engine-slot guard).

Both require an `X-API-Key` header, checked server-side against
`COUNCIL_API_KEY` (`council/apikey.py`, fails closed if unset).

**Explicit decision (per user instruction):** the AI Accelerator talks
*only* to this conclave webapp. No generic multi-provider abstraction layer,
no direct calls to freellmapi or any other provider — the conclave already
routes to freellmapi and CLI-based providers internally for its own experts;
that's its concern, not this platform's.

## Goals

- A thin `AiClient` module wrapping the two conclave endpoints.
- Two new server routes (`POST /ai/quick`, `POST /ai/session`) as thin
  pass-throughs, so the integration is testable end-to-end now, the way
  Phase 1's client landing page proved the client→server path.
- Config for the conclave's base URL and API key, optional at startup (the
  server must still boot and serve `/health`/`/ready` without AI
  configured).
- Conclave error responses (403 bad key, 409 busy, 400 bad model, network
  failure) normalized into the existing `{error:{code,message}}` contract
  with distinct, documented codes.
- Unit tests with a mocked `fetch` — no automated test makes a real call to
  the conclave, since both endpoints spend real provider quota.

## Non-goals

- No generic AI-provider interface/abstraction (explicit user decision).
- No accelerator domain logic (Opportunity/Evidence/Decision/etc.) calling
  these routes yet — that's Phase 3. Phase 2 only proves the AI Accelerator
  can reach the conclave and get a structured response back.
- No UI for this (Phase 4).
- No request-level rate limiting or queuing beyond what the conclave itself
  already enforces (its own 409 single-slot guard).

## Components

### `server/src/ai/errors.ts`

Typed error class(es) distinguishing failure modes so routes can map them
to the right HTTP status/code without string-matching:

```ts
export class AiClientError extends Error {
  constructor(
    public readonly code: "AI_NOT_CONFIGURED" | "AI_UPSTREAM_ERROR" | "AI_BUSY" | "AI_BAD_REQUEST" | "AI_UNREACHABLE",
    message: string
  ) {
    super(message);
  }
}
```

### `server/src/ai/client.ts`

```ts
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

export function createAiClient(config: AiClientConfig): {
  quickAsk(model: string, system: string, prompt: string): Promise<QuickAskResult>;
  runSession(goal: string): Promise<SessionResult>;
};
```

- `quickAsk`/`runSession` POST JSON to `${baseUrl}/api/external/quick` /
  `/api/external/session` with the `X-API-Key` header.
- Non-2xx or a network/timeout failure is translated into an `AiClientError`
  with the appropriate code (403→`AI_UPSTREAM_ERROR`, 409→`AI_BUSY`,
  400→`AI_BAD_REQUEST`, fetch throwing/timing out→`AI_UNREACHABLE`).
- `runSession` uses a bounded timeout (e.g. `AbortSignal.timeout(...)`,
  several minutes) rather than waiting forever.

### `server/src/config.ts` (extended)

`councilBaseUrl` and `councilApiKey` become optional fields on `AppConfig`
(`string | undefined`), read from `COUNCIL_BASE_URL`/`COUNCIL_API_KEY` with
no fail-fast requirement — Phase 1's required-var fail-fast behavior stays
limited to `DATABASE_URL`/`PORT`.

### `server/src/app.ts` (extended)

Two new routes, added after `/version` and before the 404 handler:

- `POST /ai/quick` — validates the request body has `model`/`system`/`prompt`
  strings (400 if not), calls `createAiClient(...).quickAsk(...)` if
  configured (503 `AI_NOT_CONFIGURED` if not), returns the client's result
  or maps its `AiClientError` to the matching HTTP status.
- `POST /ai/session` — same shape, body `{goal}`, calls `runSession`.

## Error handling

| Condition | HTTP status | code |
|---|---|---|
| `COUNCIL_BASE_URL`/`COUNCIL_API_KEY` unset | 503 | `AI_NOT_CONFIGURED` |
| Conclave returns 403 | 502 | `AI_UPSTREAM_ERROR` |
| Conclave returns 409 | 409 | `AI_BUSY` |
| Conclave returns 400 | 400 | `AI_BAD_REQUEST` |
| Network failure / timeout | 502 | `AI_UNREACHABLE` |
| Malformed request body | 400 | `AI_BAD_REQUEST` |

All error bodies use the existing `{error:{code,message}}` shape — no
change to that contract. No secrets (the API key) ever appear in a log line
or error body.

## Testing

- **Unit (`AiClient`):** mock `global.fetch` — success for both endpoints,
  403, 409, 400, and a rejected/timed-out fetch, asserting the right
  `AiClientError` code in each case.
- **Route tests:** mock the `AiClient` the route depends on (dependency
  injection via `AppDeps`, same pattern as `pool`) — assert request
  validation, the success pass-through shape, and each error-code mapping.
- **No automated real-conclave call.** A manual, one-off verification
  against the live conclave (using a real roster name, e.g. `Claude`) is
  part of the implementation task's own verification step, not a committed
  test — both endpoints spend real provider quota per the conclave's own
  documentation.

## Acceptance criteria (Definition of Done for Phase 2)

- [ ] `AiClient` correctly wraps both endpoints with typed results and
      typed errors.
- [ ] `POST /ai/quick` and `POST /ai/session` work end-to-end against the
      real conclave (manually verified once during implementation).
- [ ] Server still boots and `/health`/`/ready` still work with
      `COUNCIL_BASE_URL`/`COUNCIL_API_KEY` unset.
- [ ] All new code covered by tests with a mocked `fetch`/`AiClient` — no
      test spends real provider quota.
- [ ] `.env.example` documents `COUNCIL_BASE_URL`/`COUNCIL_API_KEY` as
      optional.
- [ ] `make test`, `make lint` pass.
- [ ] No secrets committed; API key never appears in logs.
