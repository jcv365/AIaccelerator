# AI Accelerator — Start Analysis Feature: Implementation Status & Cross-Model Handoff

**Purpose of this file:** a complete, self-contained status snapshot so any model (Claude or otherwise), in any chat session working on this repo, can pick up this work without the original conversation history. Written 2026-09-30. Update this file, don't replace it, as work progresses — keep the "Decisions Log" append-only so nothing gets silently re-litigated. Lives in this repo (not a global location) because this work is scoped per-application, and this repo IS the application.

## 0. STATUS UPDATE (2026-10-01) — read this before anything below

Everything below this point was written before a separate skill, **`product-atlas`**
(`~/.claude/skills/product-atlas/`), was built and run end-to-end against this repo as its own
full product-design pipeline (business discovery → IA/journeys → screen inventory → design
system → gated build). That pipeline has since **superseded most of sections 3 and 8 below** —
treat them as historical record, not current truth. Current truth lives in this repo's own:

- **`PRODUCT.md`** — still present but itself flagged stale (see `EXPERIENCE.md`'s Resolutions).
- **`EXPERIENCE.md`, `SCREENS.md`, `DESIGN.md`** — the live product-atlas artifacts. `EXPERIENCE.md`'s
  two dated "Resolutions" sections (2026-09-30, then 2026-10-01) are the actual decisions-log
  equivalent for everything product/scope/visual-direction related from this point forward.
- **`.product-atlas/state.md`** — phase status + build log (which screens are built/reviewed).

What specifically changed vs. this file's Decisions Log (section 8):

- **Scope**: section 8 says "NOT public/self-serve... no SSO, no multi-tenant company switcher."
  **Overridden 2026-10-01** — the user supplied the reference mockup image described in section 1
  as "not the spec for what to build right now" and explicitly reversed that: full scope expansion
  to a public site + SSO + multi-tenant company switcher is now in scope. See `EXPERIENCE.md`'s
  2026-10-01 Resolutions.
- **Visual direction**: section 8's "round 2, CURRENT, APPROVED" (Linear/Stripe/Vercel,
  single indigo accent `#5E6AD2`, dark near-black `#0B0B0D`) is **no longer current**. Replaced
  2026-10-01 by a multi-accent direction (blue/cyan/purple/orange/green on a dark navy
  `#0b1120` ground) — see `DESIGN.md`'s base tokens. The mockup the user supplied really is now
  the direction, not just a polish-level reference.
- **Night-Flight gauge brief**: section 8 describes round-1 (Night-Flight) as **rejected** in
  favor of round-2 (Linear/Stripe/Vercel). Separately, product-atlas's own `system`/`direction`
  phases (2026-09-30) found the *same* locked brief at `.impeccable/surfaces/client-src-pages-startanalysis-tsx.md`
  still present and initially kept it as a scoped approved exception alongside the then-current
  restrained direction. On the 2026-10-01 pivot the user was asked explicitly and chose to
  **harmonize** the six-gauge grammar into the new multi-accent palette rather than keep it
  contrasting — see `DESIGN.md`'s "Approved exceptions" section (the glow/font exceptions are
  revoked, not re-approved). Net effect: StartAnalysis is now **APP-03** in `SCREENS.md`, still
  unbuilt as of this update.
- **Build progress**: sections 3/5 ("Status: DONE" / "NOT STARTED") predate any of this. Current
  build progress is tracked screen-by-screen in `SCREENS.md`'s `review:` fields and summarized in
  `.product-atlas/state.md`'s Build log. As of 2026-10-01: **APP-00 (App Shell), APP-01
  (Opportunity Portfolio), and APP-DASH (Dashboard) are built and reviewed** under the new
  direction. APP-03 (Start Analysis / this file's original subject) is **not yet built** — it's
  next in the backlog after APP-02.
- **The conclave web-search integration** (section 4, "RESOLVED") and the backend gap analysis
  (section 5) are still accurate as written — product-atlas doesn't touch backend work, so
  nothing superseded that part.

Going forward, update `SCREENS.md`/`state.md`/`EXPERIENCE.md` as the primary record for anything
product-atlas governs (screens, direction, scope). Keep using this file's Decisions Log only for
handoff notes that don't fit product-atlas's own artifacts (e.g. the conclave-side backend work).

**Repos involved:**
- `AIaccelerator` — this repo, the product being built. Remote: `github.com/jcv365/AIaccelerator`.
- `Council-of-ai-experts` (aka "the conclave") — a separate, existing AI orchestration project this feature depends on. Local: `C:\Users\DotCloud-Docker\OneDrive - DotCloud Consulting\Code\Council-of-ai-experts`. Deployed live at `192.168.1.195:8010`. This server already has a thin client (`server/src/ai/client.js`) that calls its `/api/external/quick` and `/api/external/session` endpoints (`X-API-Key` header) — this is the *existing* integration; this feature needs a *new* capability added to the conclave itself (see "Blocked" below).

---

## Claude handoff / continuity note (updated 2026-10-04)

This handoff is for the next agent/Claude session to continue from here without re-tracing the same debugging loops.

### What was implemented
- `AIaccelerator` auth was repaired and verified: the login flow works again with valid JWT issuance and validation, including the corrected app environment / bcrypt settings that had been causing login failures.
- The `AIaccelerator` analysis client was hardened to handle transient upstream failures. The retry/backoff logic in `AIaccelerator/server/src/ai/client.ts` now handles Conclave `409 busy` states and network-level failures instead of failing immediately. This logic is covered by `AIaccelerator/server/test/ai/client.test.ts`.
- The Conclave integration contract was preserved and aligned with the actual live API: the session payload includes the real required fields (`goal`, `web_research`, `config_path`) and the `runSession` flow is written to tolerate transient upstream contention without changing the contract itself.
- `FreeLLMAPI` was updated to enforce per-key rate limits. The quota logic in `freellmapi/server/src/services/ratelimit.ts` now treats minute caps as a per-key property rather than a single global bucket, and `freellmapi/server/src/routes/keys.ts` defaults NVIDIA keys to a 40 RPM cap unless an explicit override is set.
- The database migration for this quota behavior was applied and validated: `freellmapi/server/src/db/migrations/20260912_000001_key_minute_request_cap.ts` adds the `minute_request_cap` column, and the live `api_keys` table was checked to confirm the column exists.
- The Start Analysis feature work already merged earlier in the repo was preserved, and the app-level route/client integration was left in a more resilient state for continued live verification once Conclave is healthy again.
- Verification evidence:
  - `AIaccelerator/server`: `npm test -- --run test/ai/client.test.ts` → 13/13 passing
  - `freellmapi/server`: `npm test -- --run src/__tests__/services/provider-minute-cap.test.ts` → 7/7 passing
  - DB check: `PRAGMA table_info(api_keys)` confirmed the `minute_request_cap` column is present

### Current blocker
The main remaining dependency issue is not app auth — it is live upstream availability. Conclave can still be single-session busy or otherwise temporarily unavailable, which causes the analysis route to fail even when the app logic is correct. The retry layer reduces the risk but does not eliminate the need for the upstream service to be healthy.

### What to do next
1. Re-run the real end-to-end analysis against the live stack once Conclave is no longer busy.
2. Confirm the `/opportunities/analyze` route succeeds and persists an `Opportunity` + `Evidence` record.
3. Validate the Start Analysis UI flow and success/failure states.
4. If the Conclave remains busy, clear/reset the stale active session and re-test.
5. Update this file again when the live end-to-end verification passes.

### Live E2E attempt — 2026-10-04 (BLOCKED, root cause found)
- Stack healthy (server/client/postgres/conclave containers all up). `POST /opportunities/analyze` (test JWT minted inside the server container) returned `AI_UPSTREAM_ERROR: Conclave returned status 500` **immediately** — not the busy/409 case.
- Root cause (from `docker logs council-of-ai-experts`): `load_config("/app/experts.yaml")` raises `ValueError ... code_roots[0] ('All Projects') path must be absolute, got 'C:\Users\DotCloud-Docker\...\Code'`. The Council's `experts.yaml` (gitignored, bind-mounted) lines 20-22 hold a Windows host path; inside the Linux container it is invalid. Every `/api/external/session` call fails until this is fixed.
- Fix (NOT yet applied — the edit to the shared Council config was denied by the permission classifier, left for the user): in `Council-of-ai-experts/experts.yaml` change `code_roots[0].path` to `/code/all-projects` (the container mount of the Code folder, per `docker inspect`). Back up the file first; if the in-place edit isn't picked up, `docker restart council-of-ai-experts`. Then re-run step 1 below.
- ~~Nothing in AIaccelerator code needs to change for this.~~ (superseded below)

### Live E2E attempt #2 — 2026-10-04 evening (config fixed; now blocked on session duration)
- **DONE:** user approved the `experts.yaml` edit. `code_roots[0].path` is now `/code/all-projects` (backup: `Council-of-ai-experts/experts.yaml.bak-20261004`); the bind-mounted edit was picked up without a restart. The 500 is gone; `/api/external/session` now actually runs a deliberation. `docker restart council-of-ai-experts` was used once to clear a hung slot.
- **DONE (stopgap):** `AiClient.runSession` timeout 5 min -> 20 min (`server/src/ai/client.ts`), nginx `/api/` `proxy_read_timeout` 95s -> 1200s (`client/nginx.conf`). Server + client containers rebuilt; `client.test.ts` 13/13.
- **STILL BLOCKED:** a full web-research Conclave round does not finish in 20+ min. Live observation: session `bbbaf8933f38` ("Maersk") ran 37+ min at round 0; freellmapi shows `nemotron-3-ultra-550b` calls repeatedly aborting at its 180s limit (also one NVIDIA 500), ~16k-token prompts. Not an AIaccelerator bug.
- **Gotcha:** while a session runs, `/api/external/session` returns 409 and any client timeout leaves the slot held. Probe with `GET /api/sessions/live` (read-only, `X-API-Key`) — do NOT probe by POSTing a dummy session, it starts a real one when the slot is free.
- **Recommended next steps (needs a design decision):** (a) make `/opportunities/analyze` asynchronous (202 + job id, client polls) — a synchronous request cannot reasonably span 20-40 min; (b) speed up the Conclave side for this use: a lighter `config_path` (fewer experts, drop Nemotron Ultra or lower its prompt size) or use `/api/external/quick` with web research; (c) then re-run live E2E and check `Opportunity`+`Evidence` persistence and the Start Analysis UI.

### Important note for future agents
Do not re-litigate the auth issue; that is already fixed. Treat NVIDIA rate limiting in `freellmapi` as a per-key quota problem, not a single shared bucket problem. Each NVIDIA key should be bounded to its own account-level limit (40 RPM) unless a different override is explicitly set.

---

## 1. The long-term vision (NOT all being built now)

The user's full product vision is a two-phase B2B tool:

- **Phase A — "Intelligence without customer access":** a user enters a company name; the system researches it publicly (DISCOVER: company profile, industry, tech signals, competitor landscape) and produces an evidence-backed AI-opportunity report (REASON → DECIDE), entirely from public information, no access to the target company's systems needed.
- **Phase B — "Evidence-enriched validation" (earned access):** once a hypothesis exists, the system requests only the *minimum* customer data needed to validate that specific hypothesis (never a blanket "connect everything" integration ask) — re-analyzes with real customer evidence, runs a 14-day PoV, measures outcomes, feeds into Scale/Pivot/Kill decisions.

The user pasted a rich visual mockup (public marketing site, SSO sign-in, multi-tenant dashboard with 9 nav items: Dashboard, Opportunity Portfolio, Evidence Explorer, Hypothesis Engine, 14-Day PoV Pipeline, No-AI Opportunities, Competitive Intelligence, Reports & Export, Settings) as a *reference for the eventual full product*, explicitly **not** as the spec for what to build right now — its information architecture (public site, SSO, multi-tenant) does not apply to the current scope, but its **visual craft/polish level is now a pinned standing requirement** (see PRODUCT.md).

## 2. What's actually in scope right now (the Phase-1 slice)

Scoped down via explicit brainstorming with the user to the smallest real slice:

- **NOT public/self-serve.** Internal tool only. The existing single-admin JWT login (built in Phase 4 of this project) is reused as-is. No sign-up, no SSO, no multi-tenant company switcher.
- **One feature: "Start Analysis."** A logged-in internal team member (a consultant/delivery person) types a company name. The system researches it and creates **one `Opportunity` record per identified AI use case** (not a single opportunity, not a separate disconnected "report" — real `Opportunity` + `Evidence` rows in the existing Prisma schema), reviewable/editable afterward through the *existing* Portfolio/OpportunityDetail UI built in earlier phases.
- **Full detail:** see `PRODUCT.md` in this repo (committed) — it is the authoritative scope record. Read it in full before doing anything else.

## 3. Status: DONE

- **Phases 1–5** (the whole existing app this feature builds on): Docker Compose stack, AI provider integration (conclave client), Opportunity/Evidence/Decision/Experiment/Learning Prisma schema + 9-state lifecycle, real JWT login, AI-generated report route, Portfolio board, tabbed OpportunityDetail UI. All merged to `main`, all live-verified. See `docs/IMPLEMENTATION_STATUS.md` for the full phase-by-phase record. **This is the foundation Start Analysis builds on — do not rebuild any of it.**
- **`PRODUCT.md`** written via the Impeccable skill's `init` flow and committed to this repo's root. Records: users (internal team, not public), product purpose, positioning, capabilities/constraints, product principles, and (once the pending edit below lands) brand commitments. **Read this file in full before any further design or build work.**
- **Surface brief** for the Start Analysis route: `.impeccable/surfaces/client-src-pages-startanalysis-tsx.md` — records the design-direction history (see below).
- **Visual direction — decided, twice (first attempt rejected):**
  1. First pass: ran Impeccable's `new-work` → `concept-seed` dice-roll process properly (grounded 7-candidate list, direction roll, bolder re-roll) and landed on a "Night-Flight Instrument Six-Pack" cockpit-gauge metaphor. **The user explicitly rejected this** — it didn't match their intent; they wanted the polish level of their own reference screenshot, not an unconventional bold world.
  2. Second pass: took Impeccable's "standing exit" path instead — a category-standard, high-craft B2B SaaS dashboard, craft bar pinned to **Linear, Stripe Dashboard, Vercel** (dark theme, Inter typeface, single restrained indigo accent `#5E6AD2`, hairline borders not heavy shadows/glows). This is now the **pinned standing direction** — do not re-roll or re-litigate it.
- **Two-screen mockup built and published** as a Claude Artifact (Impeccable "Design" canvas type): **https://claude.ai/artifact/BtmQVRzLf8YYX7Q2RchgrG**
  - Screen 1 "Main.dc.html" — Intake: sidebar shell (logo mark, Portfolio/Start Analysis nav, user footer), centered "Start Analysis" heading, plain company-name input, "Analyse company" primary button.
  - Screen 2 "Results.dc.html" — Results: same shell, company header with a "Complete" status pill, a 4-tile KPI row (Opportunities found / Strong evidence / Needs more evidence / Unsuitable), and 3 sample opportunity cards each with a status pill (Strong evidence / green, Needs evidence / amber, Unsuitable / red) and clickable source links.
  - Both screens are **static mockups with synthetic sample data** ("Meridian Logistics" is a fictional example) — not wired to any real backend.
  - Design hook (Impeccable's automated quality check) caught and fixed: a colored glow shadow on status dots in both files (a known "AI-generated UI" tell) — removed, not just suppressed.
  - Design hook also flagged `overused-font: Inter` in both files — this is a **sanctioned exception** (the user explicitly pinned Inter via the Linear/Stripe/Vercel craft-bar decision), not a real problem. **Persisting this ignore via `hook-admin.mjs ignore-value overused-font Inter` was attempted but blocked by a transient platform "auto-mode classifier" outage — retry this command when picking the work back up** (exact command is in the Decisions Log below).

## 4. Status: RESOLVED (was blocked — now confirmed by direct read of Council-of-ai-experts)

- **Council-of-ai-experts web-search tool — DONE, confirmed 2026-09-30.** A new tool module `council/web_tools.py` was added, mirroring `code_tools.py`/`recon_tools.py`'s shape exactly (`web_search(query)`, `TOOLS` dict, `run_tool`, `tool_descriptions()`). Backed by **Tavily** (`https://api.tavily.com/search`, plain REST via `requests`, no SDK), env var `TAVILY_API_KEY` (in `.env.example:38`), `MAX_RESULTS = 5`, fails closed (`{"error": ...}`, never raises) if the key is unset. Unit-tested (`tests/test_web_tools.py`, 10 tests, all via monkeypatched `requests.post` — **no live Tavily call has been verified yet**, only mocked).
  - **Opt-in mechanism:** new field `web_research: Optional[bool] = None` on `ExternalSessionBody` (`council/webapp.py:801-807`). The `/api/external/session` handler applies it as a per-request override onto `engine.config.web_research` (same pattern as the existing `skip_critique` override), which is itself a new `web_research: bool = False` field on `CouncilConfig` (`council/config.py:136`). Wired into generation in `engine.py`'s `_generate()` (~line 893-920): when not code-grounded and `config.web_research` is true, API-key experts get `web_tools.run_tool`/`web_tools.tool_descriptions()` passed into `generate_with_tools`, same call shape as the existing `code_root`/`recon_target` branches.
  - **Response shape is UNCHANGED.** `/api/external/session` still returns exactly `{"ok": true, "session_id": ..., "synthesis": <text>}` (or the error shape). **Search results are not returned as structured data** — they only ever show up inside expert turns and the final free-text `synthesis`. This is the key design constraint for the backend integration below: getting structured, multiple opportunities out of this requires prompting the conclave (via the `goal` text) to return a specific parseable format (e.g. a JSON block) inside that synthesis string, then parsing it server-side with a defined fallback for malformed output.
  - **Gap already identified:** this repo's own `server/src/ai/client.ts` (`runSession`, lines 70-88) does **not yet** pass `web_research` — its POST body is still just `{ goal }`. `AiClient.runSession`'s signature needs a new parameter threaded through to `{ goal, web_research: true }`.

- **PRODUCT.md "Brand Commitments" section** — done, committed (see Decisions Log).

## 5. Status: NOT STARTED

- **Backend for Start Analysis:** no server routes exist yet for triggering an analysis, calling the conclave, or creating the resulting Opportunity/Evidence records. Cannot be properly designed until the conclave's search-tool API shape is confirmed (see Blocked, above).
- **Client build:** no real React components exist yet — only the static Artifact mockup. The real `client/src/pages/StartAnalysis.tsx` (and however the Results view ends up structured — possibly folded into the existing Portfolio/OpportunityDetail views rather than a separate page, TBD at build time) needs to be built to match the approved mockup, once the backend contract is known.
- **A formal implementation plan** (via the `superpowers:writing-plans` skill, matching the TDD task-by-task format used for every other phase of this project — see `docs/superpowers/plans/*.md` for the established pattern) has **not been written yet** for this feature, because the backend design depends on the still-unknown conclave API shape. Once that's known, write the plan the same way every prior phase was planned, then execute via `superpowers:subagent-driven-development` in an isolated git worktree, same as every prior phase.
- **Phase 6** (Observability, security hardening, prompt-injection tests, e2e smoke test) — the next item on the roadmap *before* this Start Analysis detour started. Still fully unstarted. Also now inherits deferred items from this feature (see `docs/IMPLEMENTATION_STATUS.md`'s "Not yet implemented" list for the running list: no rate limiting on login, no experiment/learning edit/delete, no explicit null-clearing, status-enum triplication, etc.)

## 6. Exact next steps, in order

1. Retry the two transient-classifier-blocked writes (PRODUCT.md Brand Commitments edit; `hook-admin.mjs ignore-value overused-font Inter` — exact content/command in Decisions Log).
2. Confirm with the user: is the Council-of-ai-experts search-tool work finished? Get the exact request/response shape (what field opts into search on `/api/external/session`, what the search-augmented response looks like).
3. Brainstorm + spec + plan the backend integration (new route(s) in `server/src/domain/opportunities.ts` or a new file, calling the conclave, parsing results into `Opportunity`+`Evidence` creates) — follow the same brainstorming → spec → plan → subagent-driven-development cycle used for every prior phase of this project.
4. Build the real client pages matching the approved mockup (link above) once the backend contract exists.
5. Final whole-branch review, merge, then resume Phase 6.

## 7. Key file/link index

| What | Where |
|---|---|
| Mockup (2 screens, live) | https://claude.ai/artifact/BtmQVRzLf8YYX7Q2RchgrG |
| Scope record | `PRODUCT.md` (this repo's root) |
| Design-direction history | `.impeccable/surfaces/client-src-pages-startanalysis-tsx.md` |
| Mockup source files (scratch, not committed) | `C:\Users\DotCloud-Docker\OneDrive - DotCloud Consulting\Code\freellmapi\.artifact-scratch\project\` |
| Overall phase history | `docs/IMPLEMENTATION_STATUS.md` |
| Prior phase specs/plans (format to follow) | `docs/superpowers/specs/*.md`, `docs/superpowers/plans/*.md` |
| This handoff file | `implement.md` (this repo's root — update in place, per-application by design) |

## 8. Decisions Log (append-only — do not re-litigate settled items)

- **Scope:** internal team tool, not public self-serve. Same repo/stack as existing app, not a new build.
- **Primary user:** internal delivery consultant running analysis on behalf of a client, not the client themselves.
- **First build slice:** Phase 1 ("Intelligence") only — landing/intake + AI-generated report. No auth changes, no connectors, no PoV pipeline yet.
- **Evidence sourcing:** must be real, live web search (not just model-trained-knowledge) — this is why the conclave needs a new search tool; a model-knowledge-only fallback was explicitly rejected in favor of building real search.
- **Output shape:** one `Opportunity` record per identified AI use case (not one combined opportunity, not a disconnected report document).
- **Entry point:** a new "Start Analysis" page, reachable from the existing Portfolio, not folded into the existing "+ New Opportunity" form.
- **Search backend:** to live in the conclave (Council-of-ai-experts), not as a separate integration inside this repo. Wiring approach: new session-level flag mirroring `code_root`/`recon_target`. Provider: user has a preference, not yet captured in this file — ask.
- **Visual direction, round 1 (REJECTED):** "Night-Flight Instrument Six-Pack" — cockpit gauge metaphor, locked via Impeccable concept-seed (key `f2a4399a`, bolder-register re-roll, winning challenger `signals-instruments-night-flight-six-pack`). User feedback: "this looks bad and nothing like my screenshot" — too unconventional, wrong craft register.
- **Visual direction, round 2 (CURRENT, APPROVED 2026-09-30):** category-standard dark SaaS dashboard, craft bar = Linear + Stripe Dashboard + Vercel. Dark near-black ground (`#0B0B0D`), card surface `#131316`, hairline borders `#232326`, Inter typeface, single accent `#5E6AD2` (indigo), status colors green `#4CB782`/amber `#E5A028`/red `#EB5757` used only as small pills, never glowing. **No colored glow/box-shadow effects anywhere** (flagged and fixed by the design hook once already — don't reintroduce). **User explicitly approved this mockup** ("Approve mockup") — the mockup-approval gate for this UI is satisfied. The real build may proceed once the conclave search-tool dependency is also resolved (see Blocked, above); no further design-approval round is needed for these two screens unless requirements change.
- **File placement:** this handoff file was originally written to a single global location (`~/.claude/implement.md`) but the user corrected that it needs to be per-application, since each chat/session is scoped to one application — moved into this repo's root instead, and the global copy removed. If you're setting this pattern up for another project, create its own `implement.md` in that project's own repo root, not a shared global file.
- **Retry-when-unblocked #1 — PRODUCT.md edit** (apply to the `## Evidence on Hand` section and add a new `## Brand Commitments` section right after it):

  ```markdown
  ## Evidence on Hand

  None yet for this specific feature. The referenced mockup image (public marketing site + dashboard screens, SSO sign-in, multi-page nav) is the user's own reference for the eventual full two-phase product, not an approved design for this Phase-1-only build — it's explicitly called out as not matching what should actually be built now (internal tool, not public SaaS). Its IA doesn't apply (no public site, no SSO, no multi-tenant switcher), but its visual craft/polish level is the pinned bar — see Brand Commitments.

  ## Brand Commitments

  **Standing visual direction (pinned 2026-09-30):** category-standard, high-craft B2B SaaS dashboard aesthetic — the "canon," not an unconventional/bold world. An earlier attempt at a distinctive visual world (a cockpit-instrument-panel metaphor, produced via Impeccable's concept-seed dice roll) was explicitly rejected as not matching the user's intent; the user wants the polish level of their own reference screenshot, restructured around the actual product IA (internal tool, Portfolio + Opportunity/Evidence, no public marketing site or SSO), not the screenshot's specific navigation/pages. Craft bar named by the user: **Linear, Stripe Dashboard, Vercel** — dark theme, clean geometric sans (Inter), restrained single accent color, subtle 1px borders over heavy shadows, dense-but-legible data density. This is a durable preference for all future UI work on this feature, not a one-off choice for a single screen.
  ```

- **Retry-when-unblocked #2 — hook-admin ignore command** (run from anywhere, absolute paths):

  ```bash
  node "C:\Users\DotCloud-Docker\.claude\plugins\cache\impeccable\impeccable\4.1.3\skills\impeccable\scripts\hook-admin.mjs" ignore-value overused-font Inter --reason "user confirmed: pinned Linear/Stripe/Vercel craft bar (PRODUCT.md Brand Commitments, 2026-09-30) explicitly uses Inter"
  ```

- **2026-10-01 — scope and visual direction both overridden by a separate `product-atlas` skill run.** See section 0 at the top of this file for the full reconciliation. Short version: this file's "round 2 APPROVED" single-accent Linear/Stripe/Vercel direction and "internal tool, no SSO/multi-tenant" scope are both superseded, not current. Do not build against sections 1/3/8 above without reading section 0 first.

- **2026-10-01 — StartAnalysis component and test suite completed (pre-product-atlas work).** The `client/src/pages/StartAnalysis.tsx` component and its test file `client/src/pages/StartAnalysis.test.tsx` were built and all 5 tests pass:
  1. "shows NO DATA for all six gauges before any analysis runs" — initial state verified
  2. "renders the component with heading" — basic render verified
  3. "streams the three evidence gauges and shows a success message with opportunity count" — success flow with mocked API response verified
  4. "shows an inline error when the company name is blank on submit" — empty validation verified
  5. "shows an inline error when the API call fails" — error handling verified
  
  Key fixes applied:
  - Fixed vitest configuration: added `vitest.setup.ts` with `@testing-library/jest-dom` import to resolve "ReferenceError: expect is not defined" (jest-dom must load before test imports via `setupFiles` in vitest.config.ts)
  - Fixed stale compiled `.js` files being used instead of `.tsx` source — deleted `dist/` and `node_modules/.cache/` to force vitest to use TypeScript source
  - Standardized form submission across all tests: use `fireEvent.submit(form)` with `form.noValidate = true` instead of button click (bypasses HTML5 validation which was preventing empty submit)
  - Fixed success test to use `screen.getByText(/Analysis complete — found/i)` instead of `screen.findByRole("status")` (success alert uses variant="info" which renders role="status", not role="alert")
  - Fixed API error test to use consistent form submission pattern and wait for role="alert" with "network error" text
  
  Backend API connectivity verified separately: Council-of-ai-experts `/api/external/session` endpoint responding correctly with ChatGPT model (tested via curl with X-API-Key).
  
  Note: This work predates the product-atlas scope expansion (section 0). The component will need to be rebuilt to match the new multi-accent design system in DESIGN.md and the expanded scope in EXPERIENCE.md. Current implementation uses the round-2 Linear/Stripe/Vercel direction (single indigo accent) which is now superseded.
