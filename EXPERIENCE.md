# EXPERIENCE.md

## §0. Product Workflow Brief

### Actors
- Internal delivery team member: runs the AI Accelerator methodology on behalf of a client engagement; enters a company name, reviews/edits AI-generated opportunity intelligence, and drives it through the Opportunity lifecycle to a decision and (where applicable) an experiment/learning. Single admin-style JWT login, not a public self-serve user.

### Business model / value proposition
AI Accelerator is an internal consulting tool, not a multi-tenant SaaS product. It automates the front end of an existing manual DISCOVER → REASON → DECIDE → (PROVE) → LEARN methodology: instead of a team member typing a new Opportunity and its Evidence in one row at a time, they type a company name and the system uses AI to research and populate an initial, evidence-labeled opportunity report. The team member's manual work shifts from blank-page entry to review and refinement. This is explicitly "Phase 1: Intelligence without customer access" of a larger two-phase vision — Phase 2 (customer-data connectors, PoV pipelines) is a separate, not-yet-scoped engagement.

### Core lifecycle / state machine
Read from `server/prisma/schema.prisma` (not invented): an `Opportunity` moves through the `OpportunityStatus` enum:
`DISCOVERED → QUALIFIED → HYPOTHESIS → EXPERIMENT → PROVING → PROVEN | REJECTED | DEFERRED | NO_AI`
(`PROVEN`, `REJECTED`, `DEFERRED`, `NO_AI` are terminal; transitions are validated server-side, not freely settable.) Each `Opportunity` carries `Evidence` (typed `FACT | INFERENCE | ASSUMPTION | AI_HYPOTHESIS`), `Decision` records, and `Experiment` records that each accumulate `Learning` entries.

### Workflow (as given by the user, verbatim)
1. Enter Company
2. Generate Intelligence
3. Review AI Opportunity Report
4. Explore Opportunity
5. Understand Evidence
6. Identify Evidence Gaps
7. Connect Relevant Data Source
8. Re-analyse
9. Create 14-Day PoV
10. Measure Results
11. Make Decision
12. Learn/Scale/Kill

### Scope conflict table
| Step | User's brief says | Existing doc says (source) | Status |
|---|---|---|---|
| 7. Connect Relevant Data Source | In scope — part of the core 12-step journey | Out of scope for this engagement: "the Phase 2 'earned access' data-connector system" — PRODUCT.md §Capabilities and Constraints | unresolved |
| 8. Re-analyse | In scope | Out of scope: "automated re-analysis after customer evidence is connected" — PRODUCT.md §Capabilities and Constraints | unresolved |
| 9. Create 14-Day PoV | In scope | Out of scope: "the 14-day PoV pipeline" — PRODUCT.md §Capabilities and Constraints | unresolved |
| 6. Identify Evidence Gaps | In scope, described as a distinct step | Not explicitly excluded, but no gap-detection endpoint/logic exists anywhere in the backend — would need new design, not just new UI over an existing capability | unresolved |
| 10. Measure Results | In scope | Not explicitly excluded, but has no backend concept beyond the generic `Experiment`/`Learning` records — "measuring" isn't a modeled capability yet | unresolved |
| Visual direction | User's original brief: avoid generic "AI dashboard" aesthetics (gradients/glassmorphism/cards), match a Linear/Stripe/Ramp/Notion/Palantir/Datadog-grade bar without copying them | PRODUCT.md §Brand Commitments (pinned 2026-09-30) already **names** Linear, Stripe Dashboard, and Vercel as the explicit craft bar — dark theme, Inter, one restrained accent, 1px borders over shadows — and explicitly **rejects** the "Night-Flight" cockpit/instrument-panel direction currently sitting as a locked brief at `.impeccable/surfaces/client-src-pages-startanalysis-tsx.md` as not matching the user's intent | **not a conflict — PRODUCT.md already resolves this in the same direction as the user's brief.** The Night-Flight locked brief is stale and should not be treated as an approved exception in `system`; flagging for explicit confirmation before `system` discards it. |

### Open decisions
- **Evidence-sourcing mechanism for "Generate Intelligence" (step 2)** — PRODUCT.md itself flags this as unresolved: the existing `AiClient` (Council-of-ai-experts `/api/external/quick`/`/session`) is text-in/text-out with no web browsing. Three options named in PRODUCT.md: (a) rely on model-trained knowledge with an explicit "not live-verified" disclosure per claim, (b) add a real web-search integration (net-new, not built anywhere in this codebase), (c) require the team member to paste in source material as seed evidence. This changes both backend architecture and the honesty of the "evidence-backed" claim — not resolved here, needs the user's decision before `map`/`inventory` can commit step 2 and 3 to a specific screen design.
- **Steps 6-10 disposition** — given the scope conflicts above, does the user want these steps (a) designed now as UI over stand-in/placeholder data contracts so the full 12-step journey is visually complete even though the backend doesn't support it yet, or (b) explicitly marked `deferred` in SCREENS.md and excluded from this build's scope? PRODUCT.md's own "Out of scope" list argues for (b) on steps 7-9 specifically.
- **Night-Flight locked brief disposition** — confirm: should `.impeccable/surfaces/client-src-pages-startanalysis-tsx.md` be treated as superseded by PRODUCT.md's later Brand Commitments update and excluded entirely from `system`/`build` (recommended, since PRODUCT.md post-dates and explicitly rejects it), or does the user want it preserved as a one-off scoped exception regardless?

### Resolutions (user decision, 2026-09-30 — overrides PRODUCT.md where noted)
- **Steps 6-10 scope**: **pulled into scope.** This explicitly overrides PRODUCT.md §Capabilities and Constraints' "out of scope for this engagement" list (data connectors, PoV pipeline, auto re-analysis). `map`/`inventory` will design and build screens for all 12 steps, not defer 6-9. PRODUCT.md's scope section is now stale relative to this decision and should be updated to reflect the expanded engagement (flagging for the user, not doing unilaterally).
- **Evidence-sourcing mechanism (step 2)**: **add real web search.** This is a net-new backend capability — a web-search integration for the `AiClient` pipeline, not previously built anywhere in this codebase. `inventory`/`system` will record this as a backend dependency the "Generate Intelligence" screen needs; `build` will need a clearly-flagged stand-in/placeholder-contract for this endpoint until the integration itself is built (build order is UI-first per the approved plan, backend web-search integration is out of this skill's scope to build).
- **Night-Flight locked brief**: **kept as a scoped approved exception**, despite PRODUCT.md's Brand Commitments explicitly calling the cockpit/instrument direction a rejected concept. This will be recorded in DESIGN.md's approved-exceptions register, scoped to `client/src/pages/StartAnalysis.tsx` only — every other screen still follows the Linear/Stripe Dashboard/Vercel direction PRODUCT.md pins. The contradiction between this exception and PRODUCT.md's own Brand Commitments text is intentional and by explicit user instruction; not a documentation bug to silently fix.

### Resolutions (user decision, 2026-10-01 — supersedes the 2026-09-30 resolutions and PRODUCT.md's current scope/Brand Commitments)
User supplied a 9-screen reference image (saved at `.claude/uploads/.../95adfd4f-image.png` in the session that produced it; copy it into this repo under `.impeccable/references/` if a durable in-repo copy is wanted) showing: a public marketing landing page, SSO sign-in (Microsoft/Google), a multi-tenant company switcher, a Dashboard with a 4-tile KPI row + readiness donut chart, Opportunity Portfolio, Evidence Explorer, Hypothesis Engine & Decision Centre, 14-Day PoV Pipeline, No-AI Opportunities, and Reports & Exports. Asked explicitly whether this should (a) only set the craft/polish bar over the existing scope, or (b) replace the scope and visual direction outright — and explicitly chose **(b) for both scope and visual direction**.
- **Scope**: the public site, SSO sign-in, and multi-tenant company switching — previously excluded by both PRODUCT.md and this file's own 2026-09-30 "site: deferred" IA decision — are now **in scope**, overriding PRODUCT.md's platform/users/positioning sections (single-tenant internal tool) outright. PRODUCT.md is stale on this point until the user or a future pass updates it; not editing PRODUCT.md unilaterally here since it's impeccable's artifact, but flagging the staleness plainly rather than leaving it looking current.
- **Visual direction**: PRODUCT.md's pinned Brand Commitments (dark theme, one restrained accent, no heavy shadows/gradients) and the `DESIGN.md`/mockup already approved on 2026-09-30 are **replaced**, not extended — multi-accent palette, gradient hero treatment, KPI-tile hero rows, and a donut chart are now the approved direction project-wide, not narrow scoped exceptions. This also reverses the user's own original standing instruction (in the brief that created `product-atlas`) to avoid exactly this "generic AI dashboard" aesthetic — recorded here as a deliberate, explicit override, not an oversight.
- **Open interpretation, not resolved**: the "company switcher" — is this literal multi-tenant SaaS (each client company has its own user accounts/sign-up), or the existing single internal team switching between multiple client engagements it manages (closer to PRODUCT.md's actual "internal consulting tool" model, just with a UI for picking which client you're currently looking at)? Treating it as the latter (a company-context switcher for the internal team, not a new external-user multi-tenancy model) since nothing in the request asked for external client logins specifically — but this is an assumption, flagged for correction.
- **Already-built screens**: APP-00 (App Shell) and APP-01 (Portfolio) were built under the now-superseded direction and will need reworking once the new direction is approved; not reworked yet, pending that approval.

## §1. Information Architecture (revised 2026-10-01 per the scope/direction override above)

### Surfaces
- site: **in scope** (was deferred) — a public marketing landing page (hero, "how it works" mountain-journey graphic, feature highlights, "Book a Demo" CTA) plus SSO sign-in. Editorial register per `reference/surfaces.md`.
- app: in scope — the entire 12-step journey, now restructured around the reference image's page set (Dashboard / Opportunity Portfolio / Evidence Explorer / Hypothesis Engine & Decision Centre / 14-Day PoV Pipeline / No-AI Opportunities / Reports & Exports) instead of the previous Portfolio+tabbed-OpportunityDetail shape. Moves under an `/app` route prefix so it no longer collides with the public site's `/`.
- admin: in scope, minimal — unchanged (system-health view).

### Navigation model
**Public (unauthenticated)**: top nav (Why AI Accelerator / How It Works / Use Cases / Results / Resources) + "Book a Demo" CTA, landing at `/`. Sign-in at `/sign-in` (email+password, or SSO via Microsoft/Google).
**App (authenticated)**: left sidebar nav — Dashboard, Opportunity Portfolio, Evidence Explorer, Hypothesis Engine, 14-Day PoV Pipeline, No-AI Opportunities, Competitive Intelligence, Reports & Export, Settings — plus a company-context switcher in the top bar (see the open interpretation note above: switches which client engagement the internal team is currently viewing, not a new external-user account system). Drilling into a specific opportunity still reaches the tabbed workspace (Overview/Reasoning/Evidence/Connectors/Experiments/Decision) from Opportunity Portfolio or Dashboard.

### Object → route map
| Object | Route pattern |
|---|---|
| Landing page (site) | `/` |
| Sign in (site) | `/sign-in` |
| Dashboard (app) | `/app` |
| Opportunity Portfolio (app) | `/app/portfolio` |
| Opportunity (new analysis, steps 1-2) | `/app/analyze` |
| Opportunity (detail workspace, steps 3-4,11 via tabs) | `/app/opportunities/:id` |
| Evidence Explorer (cross-opportunity, steps 5-6) | `/app/evidence` |
| Evidence (within one Opportunity) | `/app/opportunities/:id` — Evidence tab |
| Hypothesis Engine & Decision Centre (steps 3,11) | `/app/hypothesis` |
| Data source connection (step 7) | `/app/opportunities/:id` — Connectors tab |
| 14-Day PoV Pipeline (cross-opportunity, steps 9-10) | `/app/pov` |
| Experiment / PoV (within one Opportunity) | `/app/opportunities/:id/experiments/:experimentId` |
| No-AI Opportunities (filtered view, step 12's "kill" outcome) | `/app/no-ai` |
| Reports & Exports (step 3's report, plus portfolio-level exports) | `/app/reports` |
| Learning (within an Experiment) | `/app/opportunities/:id/experiments/:experimentId` — Learnings section (step 12) |
| System health (admin) | `/admin/health` |

Existing routes `/`, `/opportunities/new`, `/opportunities/:id` move to `/app`, `/app/analyze`, `/app/opportunities/:id` respectively — a router restructure, not just new pages layered on top.

## §2. User Journeys

### Journey: Priya signs in — entry point added 2026-10-01
1. Priya (or a prospective visitor) lands on the public marketing page, reads the DISCOVER→REASON→PROVE→DECIDE→LEARN overview (workflow step —, entry point)
2. She signs in via SSO (Microsoft) or email/password at `/sign-in`
3. She lands on the Dashboard, sees portfolio-wide KPIs (opportunity/evidence/PoV counts, AI readiness), and switches to the client company she's currently engaged with via the company switcher (workflow step —, entry point)

### Journey: Priya opens a new opportunity — a delivery lead starting a client engagement
1. From the Dashboard or Opportunity Portfolio, Priya starts a new analysis (workflow step —, entry point)
2. She types the client company's name and starts analysis (workflow step 1: Enter Company)
3. She triggers intelligence generation, sourced via the new web-search-backed AI pipeline per the resolved evidence-sourcing decision (workflow step 2: Generate Intelligence)
4. The system returns a draft AI Opportunity Report; Priya reads it (workflow step 3: Review AI Opportunity Report)
5. Priya opens the full Opportunity workspace to see it in context (workflow step 4: Explore Opportunity)
6. She reviews each evidence entry and its FACT/INFERENCE/ASSUMPTION/AI_HYPOTHESIS label and confidence (workflow step 5: Understand Evidence)
7. She flags which claims lack supporting evidence and need more sourcing (workflow step 6: Identify Evidence Gaps)

### Journey: Priya validates and decides — proving an opportunity with real client data
1. To close an evidence gap, Priya connects a data source the client has granted "earned access" to (workflow step 7: Connect Relevant Data Source)
2. She re-runs the analysis so the new evidence updates the opportunity report and evidence set (workflow step 8: Re-analyse)
3. She scopes a 14-day proof-of-value experiment against the now-better-evidenced hypothesis (workflow step 9: Create 14-Day PoV)
4. Partway through and at the end of the 14 days, she records what the PoV is showing (workflow step 10: Measure Results)
5. Based on the PoV's outcome, she records a formal decision (proceed / hold / reject) with rationale (workflow step 11: Make Decision)
6. She captures what was learned and sets the opportunity's terminal status — scale it (PROVEN), kill it (REJECTED), or park it (DEFERRED) (workflow step 12: Learn/Scale/Kill)
