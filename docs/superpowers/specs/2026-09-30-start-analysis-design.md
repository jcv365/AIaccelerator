# AI Accelerator — Start Analysis: Backend Integration & Live Progress Design

## Context

`PRODUCT.md` (this repo) records the approved scope: an internal team member types a company name, the system researches it via the conclave's newly-added web-search capability, and creates one `Opportunity` record per identified AI use case (with `Evidence` entries), reviewable through the existing Portfolio/OpportunityDetail UI. A two-screen visual mockup (intake + results) was designed, reviewed, and explicitly approved by the user (Linear/Stripe/Vercel-register dark dashboard — see `PRODUCT.md`'s Brand Commitments and `implement.md`).

This spec covers the piece that was blocked until now: the actual backend integration with the conclave's finished web-search tool, and how its free-text output becomes real `Opportunity`/`Evidence` rows with honest live progress in the UI. Full investigation detail (exact conclave field names, file:line references) lives in `implement.md` §4 — this spec is the actionable design built on those facts, not a re-derivation of them.

## Goals

- `POST /opportunities/analyze`: trigger a conclave analysis session for a named company, using the conclave's new `web_research: true` capability.
- `GET /opportunities/analyze/status`: real, honest live progress — proxies the conclave's `GET /api/sessions/live` (round number, growing expert contributions) while the analysis is in flight, then reports the final outcome once it completes.
- Parse the conclave's free-text synthesis (it has no structured-JSON API — confirmed) into `Opportunity` + `Evidence` records, with one automatic retry on malformed output before failing cleanly.
- Client: a real `StartAnalysis` page matching the approved mockup, showing genuine progress (not a fake staged animation), and a real results view sourced from the actual created records.

## Non-goals

- No persistent job queue or background worker infrastructure — a simple in-memory single-flight guard is sufficient, because the conclave itself only supports one session globally at a time (confirmed: `/api/external/session` returns 409 if a session is already running). This mirrors that same constraint rather than building something more elaborate than the dependency allows anyway.
- No streaming (SSE/WebSocket) for progress — plain polling of a lightweight status endpoint is enough given the conclave's own progress data (round number, contributions) doesn't update faster than a few-second cadence anyway.
- No new Prisma schema fields. The "confidence" concept from the mockup (Strong evidence / Needs evidence / Unsuitable) is derived entirely from existing fields — see "Confidence mapping" below. No schema migration in this feature.
- No change to the conclave repo itself — it's already done; this spec only covers the AIaccelerator side.

## Architecture

### `AiClient` changes (`server/src/ai/client.ts`)

- `runSession(goal: string, options?: { webResearch?: boolean }): Promise<SessionResult>` — existing method gains an optional second parameter. When `webResearch` is true, the POST body becomes `{ goal, web_research: true }` instead of today's `{ goal }`. `web_research` is the exact field name the conclave's `ExternalSessionBody` expects (confirmed).
- New method `getLiveSessionStatus(): Promise<LiveSessionStatus | null>` — `GET ${baseUrl}/api/sessions/live`. This route is unauthenticated on the conclave side (confirmed — no `X-API-Key` dependency, unlike `/api/external/*`), so no API key header is sent for this specific call. Returns `null` when the conclave reports `running: false`/no engine in flight. When running, returns a thin shape: `{ running: true, roundNum: number, contributionCount: number, latestSpeaker: string | null }` — derived from the conclave's richer payload (`round_num`, `contributions` array), but `AiClient` exposes only what the UI actually needs, matching its existing minimal-surface pattern (it already doesn't expose the full conclave response shape for `quickAsk`/`runSession` either).
- Both changes stay backward compatible: existing callers of `runSession(goal)` (none currently pass `webResearch`) are unaffected.

### New server module: `server/src/domain/analysis.ts`

Holds an in-memory single-flight guard — no database table, no queue:

```typescript
interface AnalysisState {
  companyName: string;
  startedAt: Date;
}
interface AnalysisOutcome {
  status: "complete" | "failed";
  opportunityIds?: string[];
  message?: string;
}
```

Module-level `let current: AnalysisState | null = null;` and `let lastOutcome: AnalysisOutcome | null = null;`.

- `POST /opportunities/analyze` — body `{ companyName: string }`. If `current !== null`, respond `409 { error: { code: "ANALYSIS_BUSY", message: "An analysis is already running" } }`. Otherwise: validate `companyName` is a non-empty string (`400 VALIDATION_ERROR` if not), set `current = { companyName, startedAt: new Date() }`, respond immediately `202 { status: "started" }`, and — without awaiting it as part of the HTTP response — kick off the analysis pipeline (goal construction → `runSession` → parse → retry-once-on-failure → create records), whose completion sets `lastOutcome` and clears `current`. Any error at any stage of that background pipeline (network failure, conclave error, parse failure after retry) results in `lastOutcome = { status: "failed", message: "..." }`, never an unhandled rejection.
- `GET /opportunities/analyze/status` — if `current !== null`: call `aiClient.getLiveSessionStatus()`; if it returns data, respond `200 { status: "running", roundNum, contributionCount, latestSpeaker, companyName: current.companyName }`; if it returns `null` (e.g. the conclave hasn't started the round yet, or a transient gap), respond `200 { status: "running", companyName: current.companyName }` with no round data — the client should treat missing round data as "still starting" rather than an error. If `current === null` and `lastOutcome !== null`: respond `200 { ...lastOutcome }` and leave `lastOutcome` in place (not one-shot — a page refresh right after completion should still see the result; it's naturally overwritten by the next analysis). If both are `null` (no analysis ever run, or a long time since the last one): respond `200 { status: "idle" }`.

### Goal/prompt construction

The conclave's session API takes one `goal` string (no separate system-prompt parameter for sessions, unlike `quickAsk`). The goal text itself must carry the full instruction set:

```
Research the company "{companyName}" using web search. Then:

DISCOVER: company profile, industry, business model, products/services, technology signals, competitor landscape — using only information you can find and cite.

REASON: identify 2-5 distinct, concrete AI opportunities for this company. For each, separate established facts (with a source) from inferences or assumptions.

DECIDE: for each opportunity, assess evidence strength, feasibility, and whether it's actually suited to an AI solution (some opportunities may not be — mark those explicitly).

End your final synthesis with EXACTLY ONE fenced JSON code block (```json ... ```) matching this schema, and nothing else after it:

{
  "opportunities": [
    {
      "title": "string, short opportunity name",
      "businessProblem": "string, the problem this solves",
      "hypothesis": "string, the proposed AI approach",
      "suitability": "SUITABLE" | "UNSUITABLE",
      "evidence": [
        { "claim": "string", "type": "FACT" | "INFERENCE" | "ASSUMPTION", "source": "string, a URL or description of where this came from" }
      ]
    }
  ]
}
```

### Parsing: `server/src/domain/analysisParser.ts`

- `parseAnalysisSynthesis(text: string): { data: ParsedAnalysis } | { error: string }` — find the **last** fenced ` ```json ` block in the text (experts may reference example JSON earlier in deliberation; the last block is the final synthesis's own output), `JSON.parse` it, and validate: `opportunities` is a non-empty array; each item has non-empty string `title`/`businessProblem`/`hypothesis`; `suitability` is exactly `"SUITABLE"` or `"UNSUITABLE"`; `evidence` is an array (may be empty) of `{claim, type, source}` where `type` is one of the existing `EvidenceType` enum values (`FACT`/`INFERENCE`/`ASSUMPTION`/`AI_HYPOTHESIS`). Any validation failure returns `{ error: "<specific reason>" }` — never throws.
- Retry: if the first `runSession` call's result fails to parse, the analysis pipeline calls `runSession` **once more** with the goal text appended: `"\n\nYour previous response did not include a valid JSON block matching the required schema. Respond with well-formed JSON only, exactly as specified above, as the last thing in your synthesis."` If the retry also fails to parse, the pipeline sets `lastOutcome = { status: "failed", message: "Analysis did not produce a valid result after retrying. Try again." }` and stops — no further retries (matches the plan's general no-infinite-retry discipline elsewhere in this project, e.g. the SDD fix-loop's 5-round cap).

### Confidence mapping (no schema change)

The mockup's three-tier confidence pill (Strong evidence / Needs evidence / Unsuitable) is derived, not stored:

- `suitability: "UNSUITABLE"` → create the `Opportunity` with `status: "REJECTED"` directly (an existing, valid `OpportunityStatus` enum value — REJECTED opportunities are terminal in the existing state machine, which is exactly the right semantics for "the AI assessed this as not a fit").
- `suitability: "SUITABLE"` → create the `Opportunity` with the schema's existing default `status: "DISCOVERED"`.
- The UI-facing "Strong evidence" vs "Needs evidence" distinction (for `SUITABLE` opportunities only) is computed client-side from the opportunity's evidence array: **any** `FACT`-type evidence present → "Strong evidence"; otherwise (only `INFERENCE`/`ASSUMPTION`/`AI_HYPOTHESIS`) → "Needs evidence". This keeps the distinction purely presentational, consistent with "Evidence before automation" (PRODUCT.md's Product Principles) — the badge is a read of real evidence composition, not an AI-asserted confidence score.

### Client

- **`client/src/pages/StartAnalysis.tsx`** (new) — matches the approved mockup's intake screen (`Main.dc.html`): company-name field, "Analyse company" button. On submit: `POST /opportunities/analyze`; on `202`, begin polling `GET /opportunities/analyze/status` every 3s. While `status === "running"`: show real progress text, e.g. `"Round {roundNum} — {contributionCount} contributions so far"` when round data is present, or `"Starting analysis…"` when it isn't yet — never a fake DISCOVER/REASON/DECIDE staged animation, since the real mechanism doesn't cleanly map to those labels and fabricating that would violate the "no fake status bars" craft rule already applied to this mockup. On `status === "complete"`: stop polling, fetch the created opportunities (`GET /opportunities`, filtered client-side to the returned `opportunityIds`) and render them using the approved Results screen's visual design (KPI tile row + opportunity cards with the derived confidence pill + evidence/source lines), each card linking through to the existing `OpportunityDetail` page for full review/editing. On `status === "failed"`: show the returned message with a way to try again. On `status === "busy"` (409 from the initial POST): show "An analysis is already running" — no polling started.
- **`client/src/pages/Portfolio.tsx`** — add a "Start Analysis" link/button (the approved mockup shows this reachable from Portfolio's sidebar nav; the existing Portfolio doesn't have a sidebar shell today, so the minimal change is a plain link near the existing "+ New" link, styled consistently with the rest of this feature's new screens — not a full sidebar retrofit of the whole app, which is out of scope here).
- **`client/src/App.tsx`** — add the `/start-analysis` route.

## Error Handling

Unchanged `{error:{code,message}}` contract throughout. New codes: `ANALYSIS_BUSY` (409, only on the `POST /opportunities/analyze` single-flight guard). `VALIDATION_ERROR` (400) reused for an empty/missing `companyName`. All conclave/parsing failures surface through the status endpoint's `{status:"failed", message}` shape, not as HTTP error codes on the status route itself (status-checking is always a "successful" GET, even when it's reporting a failed analysis).

## Testing

- `server/test/domain/analysis.test.ts`: the single-flight guard (409 when already running), validation (400 on empty company name), the full happy path with a mocked `AiClient` (mocked `runSession` returning synthetic synthesis text with a valid JSON block → confirms `Opportunity`/`Evidence` records created with correct field mapping, including the `REJECTED` status mapping for `UNSUITABLE`), the retry-once path (first mocked `runSession` call returns unparseable text, second returns valid JSON → confirms exactly 2 calls and success), and the retry-exhausted path (both calls unparseable → `lastOutcome.status === "failed"`, zero records created).
- `server/test/domain/analysisParser.test.ts`: valid JSON extraction (including when preceded by other ` ```json ` blocks in the text — confirms it takes the *last* one), missing block, malformed JSON, missing required fields, invalid `suitability`/`type` enum values.
- `server/test/ai/client.test.ts`: `runSession` with `webResearch: true` sends `{goal, web_research: true}`; without it, unchanged `{goal}`. `getLiveSessionStatus` parses a running response, an idle response, and a network-failure case (returns `null`, doesn't throw).
- Client: `StartAnalysis.test.tsx` covers the polling state machine (running → complete, running → failed, initial 409 busy) with mocked `fetch` and fake timers for the poll interval; `Portfolio.test.tsx` gains one assertion that the new Start Analysis link renders.
- **No test calls the real conclave** — same rule as every prior AI-integration phase in this project. The one live verification (a real company name, real conclave round, real records created) happens manually during the implementation's own DoD validation step, same pattern as Phase 2/4's live verification.

## Acceptance Criteria (Definition of Done)

- [ ] `AiClient.runSession` supports `webResearch`; `AiClient.getLiveSessionStatus` implemented and tested.
- [ ] `POST /opportunities/analyze` + `GET /opportunities/analyze/status` implemented with the single-flight guard, full test coverage.
- [ ] Parser implemented with the retry-once behavior, full test coverage including the last-JSON-block-wins case.
- [ ] Confidence mapping (`UNSUITABLE` → `REJECTED` status; client-derived Strong/Needs-evidence badge) implemented exactly as specified — no new schema fields.
- [ ] `StartAnalysis.tsx` built matching the approved mockup, with real (not fake) progress polling.
- [ ] `npm test`/`npm run lint` pass in both `server/` and `client/`.
- [ ] One real, live end-to-end verification against the actual conclave (real company name, real web search, real records created) — documented in `docs/IMPLEMENTATION_STATUS.md`.
- [ ] `docs/IMPLEMENTATION_STATUS.md` and `implement.md` updated to reflect completion.
