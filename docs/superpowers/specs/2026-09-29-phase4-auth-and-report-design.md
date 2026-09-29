# AI Accelerator — Phase 4: Real Login + AI-Generated Opportunity Report

## Context

Phase 3 shipped a shared-secret `X-API-Key` gate and a bare-bones UI. The user now wants two things by end of day: (1) a real local username/password login replacing the shared key, and (2) a way to generate an AI report for an Opportunity ("company") — the first time Phase 2's `AiClient` is actually called from domain logic.

Per explicit user decision:
- **Single local account, not multi-user.** No `User` table, no signup flow. Credentials live in env vars, same posture as Phase 3's `ACCELERATOR_API_KEY`.
- **"A company" is an Opportunity.** No new entity — "report for a company" means "report for one Opportunity."
- **AI-synthesized report**, not a plain data dump — this is the actual DISCOVER→REASON payoff the platform exists for.
- **Clean cutover.** `ACCELERATOR_API_KEY`/`requireAccelApiKey` are fully removed, not kept alongside the new auth — nothing depends on the old key yet.

## Goals

- `POST /auth/login` (public route): verifies username + bcrypt-compared password, returns a signed JWT.
- `requireAuth` middleware replaces `requireAccelApiKey` everywhere it was mounted (all non-health, non-login routes).
- `POST /opportunities/:id/report`: gathers the opportunity + its evidence + decisions, prompts the conclave via the existing `AiClient`, returns the synthesized text.
- Client: a real username/password login form (replacing the API-key prompt) storing a JWT instead of a shared key; a "Generate Report" button on the Opportunity Detail page.
- `docker compose up -d --build` still works end to end; login and report generation both verified live against the real stack (report generation spends real conclave quota — verify once).

## Non-goals

- No multi-user support, no user table, no signup/password-reset flow.
- No persistence of generated reports (displayed on screen only — a fast-follow if wanted).
- No AI wiring anywhere else in domain logic (Evidence/Decision creation stays manual).
- No refresh-token rotation or logout-everywhere — a simple JWT with a fixed expiry is enough for a single local account.

## Auth design

### Config (`server/src/config.ts`)

Remove `acceleratorApiKey`. Add three new required fields (same `requireEnv` fail-fast pattern as `DATABASE_URL`/`PORT`):

```ts
export interface AppConfig {
  databaseUrl: string;
  port: number;
  nodeEnv: string;
  councilBaseUrl?: string;
  councilApiKey?: string;
  adminUsername: string;
  adminPasswordHash: string;
  authTokenSecret: string;
}
```

### `server/src/auth.ts` (rewritten)

```ts
export function signToken(secret: string, username: string): string;   // jsonwebtoken, 7d expiry
export function verifyToken(secret: string, token: string): boolean;   // true if valid & unexpired
export function requireAuth(secret: string): RequestHandler;           // checks "Authorization: Bearer <token>"
```

`requireAuth` returns `401 { error: { code: "UNAUTHORIZED", message } }` on a missing/invalid/expired token — same error shape as before.

### `server/src/domain/authRoutes.ts` (new)

```ts
export function createAuthRouter(config: { adminUsername: string; adminPasswordHash: string; authTokenSecret: string }): Router;
```

`POST /` (mounted at `/auth`): body `{ username, password }`. `bcryptjs.compareSync` (pure-JS, no native bindings — avoids repeating Phase 3's OpenSSL/Alpine pain) against `adminPasswordHash`; username compared with a constant-time check via the same `timingSafeEqual` pattern Phase 3 already established. On match, `signToken(...)`, respond `{ token }`. On mismatch, `401 UNAUTHORIZED` (do not reveal whether username or password was wrong).

### `server/src/app.ts` wiring

Route order: `/health`, `/ready`, `/version` → `POST /auth/login` (mounted before the auth gate) → `requireAuth(deps.authTokenSecret)` → `/ai/quick`, `/ai/session`, `/opportunities/*` → 404 handler → `errorHandler`.

`AppDeps` drops `acceleratorApiKey: string`, gains `adminUsername: string`, `adminPasswordHash: string`, `authTokenSecret: string` (all required — every `createApp(...)` call site across the test suite needs updating, same as Phase 3's Task 4).

### Password hash generation

A tiny script, `server/scripts/hash-password.mjs`, so the user can generate `ADMIN_PASSWORD_HASH` without installing anything extra:

```js
import bcrypt from "bcryptjs";
const password = process.argv[2];
if (!password) { console.error("Usage: node scripts/hash-password.mjs <password>"); process.exit(1); }
console.log(bcrypt.hashSync(password, 10));
```

Documented in `.env.example` and the README.

## AI report design

### `server/src/domain/opportunities.ts`

`createOpportunitiesRouter(prisma: PrismaClient, aiClient?: AiClient): Router` — signature gains a second, optional parameter.

New route, added after the existing 6 routes:

```
POST /:id/report
```

- 404 `NOT_FOUND` if the opportunity doesn't exist.
- 503 `AI_NOT_CONFIGURED` if `aiClient` is undefined (same pattern as `/ai/quick`).
- Otherwise: build a system prompt instructing the model to report only from the given information, distinguishing facts from inferences, inventing nothing; build a user prompt from the opportunity's title/description/businessProblem/status plus its evidence (`[TYPE] claim`) and decisions (`decision — rationale`); call `aiClient.quickAsk("Claude", system, prompt)`; on success, `200 { report: result.response }`; on an `AiClientError`, map via the existing `aiErrorStatus` table.

### Shared error mapping

`aiErrorStatus` currently lives as a private helper inside `app.ts`. Move it to `server/src/ai/errors.ts` (which already holds `AiClientError`/`AiErrorCode`) and export it, so both `app.ts`'s `/ai/*` routes and the new report route use the same mapping without duplication.

### `client/src/pages/OpportunityDetail.tsx`

Add a "Generate Report" button, a loading state, and a display area (plain `<pre>` or paragraph, no styling) for the returned text. `POST`s to `/opportunities/:id/report` via `apiFetch`; on `!res.ok`, `alert()` the error (same pattern as the existing mutation handlers).

## Client auth design

`client/src/api.ts` is rewritten:

```ts
export function getToken(): string | null;
export function setToken(token: string): void;
export function clearToken(): void;
export async function login(username: string, password: string): Promise<boolean>; // POSTs /auth/login, setToken on success
export async function apiFetch(path: string, init?: RequestInit): Promise<Response>; // Authorization: Bearer <token>, clearToken() on 401
```

`client/src/App.tsx`: replaces `ApiKeyPrompt` with a `LoginForm` (username + password fields, calls `login(...)`, shows an error message on failure rather than the prompt's bare re-render). Same polling-based re-prompt-on-401 mechanism Phase 3 built, adapted to the token.

## Error handling

No change to the `{error:{code,message}}` contract. New/changed codes: `UNAUTHORIZED` (401, now also covers login failures and expired/invalid tokens — same code as before, different trigger). `AI_NOT_CONFIGURED`/`AI_UPSTREAM_ERROR`/`AI_BUSY`/`AI_BAD_REQUEST`/`AI_UNREACHABLE` reused unchanged for the report route via the shared `aiErrorStatus`.

## Testing

- `server/src/auth.ts`: unit tests for `signToken`/`verifyToken` (valid token round-trips, tampered/expired tokens rejected) and `requireAuth` middleware (missing/invalid/valid Bearer header).
- `server/src/domain/authRoutes.ts`: route tests — correct credentials → 200 + token; wrong username → 401; wrong password → 401 (mocked bcrypt comparison isn't needed — use real `bcryptjs.hashSync` in the test setup for a real hash, keeps the test honest).
- `server/src/config.ts`: required-var tests for `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`/`AUTH_TOKEN_SECRET`, removal of the old `ACCELERATOR_API_KEY` tests.
- `server/test/authWiring.test.ts`: rewritten — `/auth/login` is public; `/opportunities`, `/ai/quick` require a valid Bearer token; an invalid/expired token is rejected.
- `server/test/domain/opportunities.test.ts`: new `POST /:id/report` cases — 404, 503 when no `aiClient`, success (mocked `aiClient.quickAsk` returning a canned response, assert the route's response shape and that the prompt sent included the opportunity's evidence/decisions), and an `AiClientError` mapping case.
- Client: `client/src/api.test.ts` rewritten for token storage + `login()`; `App.test.tsx` for the login form (renders when no token, calls `login`, reveals the app on success, shows an error on failure); `OpportunityDetail.test.tsx` gains a "Generate Report" case (mocked fetch, button click → displays returned report text).
- **No automated test calls the real conclave** — same rule as Phase 2. The one live report-generation call happens manually during the implementation task's own verification step, exactly like Phase 2's Task 5.

## Acceptance criteria (Definition of Done for Phase 4)

- [ ] `POST /auth/login` works with real bcrypt-hashed credentials; wrong credentials rejected.
- [ ] Every previously-`ACCELERATOR_API_KEY`-gated route now requires a valid Bearer token instead; `ACCELERATOR_API_KEY` is fully removed from config/env/compose.
- [ ] `POST /opportunities/:id/report` returns a real AI-generated report for a real opportunity (manually verified once against the live conclave).
- [ ] Client shows a real login form on first load, stores the token, and the "Generate Report" button displays a real report.
- [ ] `docker compose up -d --build` works end to end from a clean rebuild with the new env vars.
- [ ] `make test`/`make lint` (or raw equivalents) pass.
- [ ] No secrets (passwords, hashes, tokens, conclave key) committed anywhere.
- [ ] `docs/IMPLEMENTATION_STATUS.md` updated.
