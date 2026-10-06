# SCREENS.md

Build backlog for AI Accelerator, produced by `product-atlas inventory` from `EXPERIENCE.md`.
**Revised 2026-10-01**: the user supplied a 9-screen reference image and explicitly chose to
replace both scope (add public site/SSO/multi-tenant switcher) and visual direction (multi-accent,
gradients, KPI tiles, donut chart) — see `EXPERIENCE.md`'s 2026-10-01 Resolutions. This revision
supersedes the 2026-09-30 inventory below it was built from. APP-00 and APP-01 were built under
the old direction and are marked `status: restyle` pending rework once the new direction is approved.

## A. Surfaces summary

| Surface | In scope | Deferred |
|---|---|---|
| site | 2 | 1 (full multi-page marketing site content beyond the single landing page — out of this pass) |
| app | 15 | 0 |
| admin | 1 | 0 |

## B. Journey coverage

| Journey step | Screens |
|---|---|
| 0. Entry (landing → sign-in → dashboard → portfolio → new analysis) | SITE-01, SITE-02, APP-DASH, APP-01 |
| 1. Enter Company | APP-03 |
| 2. Generate Intelligence | APP-03 |
| 3. Review AI Opportunity Report | APP-04R, APP-HYP |
| 4. Explore Opportunity | APP-04 |
| 5. Understand Evidence | APP-05, APP-EVID |
| 6. Identify Evidence Gaps | APP-05, APP-EVID |
| 7. Connect Relevant Data Source | APP-06 |
| 8. Re-analyse | APP-06 |
| 9. Create 14-Day PoV | APP-07, APP-POV |
| 10. Measure Results | APP-08, APP-POV |
| 11. Make Decision | APP-09, APP-HYP |
| 12. Learn/Scale/Kill | APP-08, APP-NOAI |
| Admin: system health | ADM-01 |
| Reports/exports (new, from reference image) | APP-REPORTS |

## C. Screens

```yaml
id: SITE-01
name: Public Landing Page
surface: site
route: /
file: client/src/pages/site/Landing.tsx
journey_steps: [0]
user_question: "What does AI Accelerator do, and should I book a demo or sign in?"
primary_action: "Book a Demo, or sign in"
data:
  - endpoint: "none (static marketing content)"
    readiness: ready
states: [success]
entry_from: []
exits_to: [SITE-02]
components: [Button]
density: editorial
status: new
scope: in
reason: "New surface, added 2026-10-01 per the user's explicit scope-expansion decision overriding PRODUCT.md's 'no public marketing site' constraint. Built 2026-10-05: pages/site/Landing.tsx + site.css. Journey (Discover/Reason/Prove/Decide/Learn) is real ordered-list text, not an image, so it is the accessible equivalent. 'Book a demo' is a visibly disabled 'coming soon' button — no booking backend exists. Unauthenticated users see this at /; authenticated users are redirected to /app."
brief: ""
a11y_notes: "Hero illustration must have alt text describing the DISCOVER/REASON/PROVE/DECIDE/LEARN journey, not just decorative alt=''."
review: pass (2026-10-06) — rebuilt to the 9-screen mockup (direction revision 2026-10-06): hero with a drawn mountain path, real on-page anchor nav (Why, How it works, Features), five feature tiles; Book a demo stays visibly unavailable, no Watch overview. slop-scan clean, typecheck/lint clean, client 148/148 and server 333/333 tests pass. Visual pass against the running stack still to do.
```

```yaml
id: SITE-02
name: Sign In
surface: site
route: /sign-in
file: client/src/pages/site/SignIn.tsx
journey_steps: [0]
user_question: "How do I get into my AI Accelerator workspace?"
primary_action: "Sign in with email/password or SSO"
data:
  - endpoint: "POST /login (existing, but SSO via Microsoft/Google is net-new — no OAuth integration exists anywhere in this codebase yet)"
    readiness: partial
states: [empty, loading, error, success]
entry_from: [SITE-01]
exits_to: [APP-DASH]
components: [TextField, Button, InlineAlert]
density: editorial
status: new
scope: in
reason: "Replaces the existing bare LoginForm in App.tsx. SSO buttons render but are placeholder-contract (disabled or 'coming soon') until an OAuth provider is actually integrated — a real backend capability this skill doesn't build. Built 2026-10-05: pages/site/SignIn.tsx replaces the inline LoginForm in App.tsx; built on TextField/Button/InlineAlert, same login() call. Microsoft/Google SSO buttons render disabled 'coming soon' (no OAuth integration exists). Unauthenticated routes: / and /sign-in; everything else redirects to /sign-in. App.test.tsx now starts at /sign-in with the 'Sign in' button label — same intent."
brief: ""
a11y_notes: ""
review: pass (2026-10-06) — split layout: brand panel (Welcome back, three value points, no testimonial) beside the form; SSO buttons disabled; Ask your administrator instead of a reset link. slop-scan clean, typecheck/lint clean, client 148/148 and server 333/333 tests pass. Visual pass against the running stack still to do.
```

```yaml
id: APP-00
name: App Shell
surface: app
route: "(wraps all authenticated /app routes)"
file: client/src/components/app/AppShell.tsx
journey_steps: [0]
user_question: "Where am I, which client company am I looking at, and how do I reach the other sections?"
primary_action: "Navigate via the sidebar, or switch company context"
data:
  - endpoint: GET /health (existing, used by status indicator)
    readiness: ready
  - endpoint: "company-context switcher data source (new — no multi-company/tenant model exists in the schema yet; single Opportunity table has no company field)"
    readiness: missing
states: [loading, success, error]
entry_from: []
exits_to: [APP-DASH]
components: [AppShell, SidebarNav, CompanySwitcher, StatusIndicator]
density: dense
status: restyle
scope: in
reason: "Built 2026-09-30 as a top-nav shell under the now-superseded direction. Restyled 2026-10-01 to a left-sidebar layout (SidebarNav, icon set, active-rail indicator) with a CompanySwitcher in the topbar, per the reference image and the approved mockup. NavBar.tsx deleted. Not-yet-built destinations (Evidence Explorer, Hypothesis Engine, PoV Pipeline, No-AI, Reports) render as visibly disabled 'Soon' items rather than links to routes that would 404."
brief: ""
a11y_notes: "Skip-to-content link; status indicator must not be color-only (pair with text label). Both present and unchanged in the restyle."
review: pass (2026-10-01) — slop-scan clean, typecheck/lint/tests (31/31) pass. Visual pass 2026-10-06 (screenshots at 1440 and 390 wide against real data): phone top bar + Menu drawer (<= 800px), shared page-header rhythm.
```

```yaml
id: APP-DASH
name: Dashboard
surface: app
route: /app
file: client/src/pages/app/Dashboard.tsx
journey_steps: [0]
user_question: "At a glance, how is this client engagement going?"
primary_action: "Drill into Opportunity Portfolio, Evidence, or the PoV pipeline"
data:
  - endpoint: GET /opportunities (existing, aggregated client-side into KPI counts)
    readiness: ready
  - endpoint: "AI readiness score / category breakdown (new — no readiness-scoring concept exists in the schema; the reference image's 72% donut and category bars have no backend source)"
    readiness: missing
states: [loading, empty, error, success]
entry_from: [SITE-02, APP-00]
exits_to: [APP-01, APP-EVID, APP-POV]
components: [KpiTile, DonutChart, DataTable, Button]
density: dense
status: new
scope: in
reason: "New home screen for /app, replacing Portfolio as the landing view. Readiness scoring is a genuine data-model gap, not just a missing endpoint — flagged, not fabricated. Built 2026-10-01: Opportunities and Evidence Sources KPIs are real (derived from GET /opportunities); Active PoVs and Estimated Annual Value show 'Not yet available' rather than invented numbers (no experiments-count field on the list endpoint; potentialValue is free text, not a currency amount to sum). DonutChart renders its explicit no-data state since no readiness-scoring backend exists at all."
brief: ""
a11y_notes: "Donut chart needs a text equivalent (the percentage and category breakdown as a table or list), not color-only. DonutChart component always renders an accessible <table> alongside the SVG ring when there is a score; the no-data state is plain text."
review: pass (2026-10-06) — 4 KPIs (PoV and value cards say why when empty), AI readiness ring + five dimension bars with model/date/rationale or a Run assessment empty state, value buckets, PoV counts, recent decisions. slop-scan clean, typecheck/lint clean, client 148/148 and server 333/333 tests pass. Visual pass against the running stack still to do.
```

```yaml
id: APP-01
name: Opportunity Portfolio
surface: app
route: /app/portfolio
file: client/src/pages/Portfolio.tsx
journey_steps: [0]
user_question: "What opportunities exist, and what state is each one in?"
primary_action: "Open an opportunity, or start a new analysis"
data:
  - endpoint: GET /opportunities
    readiness: ready
states: [loading, empty, error, success]
entry_from: [APP-DASH]
exits_to: [APP-03, APP-02, APP-04]
components: [DataTable, StatusBadge, Button]
density: dense
status: restyle
scope: in
reason: "Built 2026-09-30 under the superseded direction (dark/restrained). Route moved 2026-10-01 from / to /app/portfolio (site now owns /, with a redirect at / and /app until SITE-01/APP-DASH are built). Visuals are built on components/ui/ (DataTable, Button) which are 100% token-driven with zero hardcoded colors, so updating tokens.css to the new multi-accent palette already restyled this screen automatically — verified via slop-scan + visual token audit, not yet eyeballed in a running browser. Deeper per-screen polish (e.g. the reference image's business-value/priority columns) isn't done — those fields don't exist on the current Opportunity data shown here; not fabricated."
brief: ""
a11y_notes: "Table must be a real <table> with header cells, not a div grid — screen reader row/column context."
review: pass (2026-10-06) — single filterable table (search, category, priority, status), # / value / evidence score / priority / status columns, 10 per page; AI values labelled as estimates. slop-scan clean, typecheck/lint clean, client 148/148 and server 333/333 tests pass. Visual pass against the running stack still to do.
```

```yaml
id: APP-02
name: New Opportunity (manual entry)
surface: app
route: /app/opportunities/new
file: client/src/pages/NewOpportunity.tsx
journey_steps: [0]
user_question: "How do I create an opportunity without AI-assisted intelligence?"
primary_action: "Save a manually-entered opportunity"
data:
  - endpoint: POST /opportunities
    readiness: ready
states: [empty, loading, error, success]
entry_from: [APP-01]
exits_to: [APP-04]
components: [TextField, Button, InlineAlert]
density: dense
status: exists-unstyled
scope: in
reason: "Route moved under /app (2026-10-01); restyled using the shared ui/ components (TextField, new TextAreaField, Button, InlineAlert) instead of raw <input>/<textarea> — picks up the new multi-accent tokens automatically. Added loading/error states (try/catch around the fetch, Button disabled + 'Creating…' label while in flight) that the original implementation didn't have."
brief: ""
a11y_notes: ""
review: pass (2026-10-01) — slop-scan clean, typecheck/lint clean, tests pass (2 new, 37/37 total).
```

```yaml
id: APP-03
name: Start Analysis
surface: app
route: /app/analyze
file: client/src/pages/StartAnalysis.tsx
journey_steps: [1, 2]
user_question: "What is this company, and what AI opportunities does it have?"
primary_action: "Enter a company name and generate an AI opportunity report"
data:
  - endpoint: "POST /analyze (new — company name in, generated Opportunity+Evidence out, backed by a new web-search integration per the 2026-09-30 evidence-sourcing decision)"
    readiness: missing
states: [empty, loading, streaming, error, success]
entry_from: [APP-00, APP-DASH, APP-01]
exits_to: [APP-04]
components: [TextField, Button, ProgressIndicator, InlineAlert]
density: dense
status: new
scope: in
reason: "Resolved 2026-10-01: harmonized into the new multi-accent palette, not kept contrasting. The six-gauge grammar from the locked brief is preserved as a distinctive component, rendered with standard tokens (accent-blue/cyan/purple/orange rings on --color-surface, Inter) instead of the matte-black/glow cockpit look. DESIGN.md's glow/font exceptions are revoked. Built 2026-10-01: POST /analyze has no backend (data.readiness: missing), so built against a clearly-named `startAnalysisPlaceholder.ts` stand-in contract (documented in-code) instead of a real fetch. Evidence Strength/Source Coverage/AI Confidence stream in from the placeholder; Risk/Feasibility/Value stay permanently NO DATA since no decision-scoring backend exists (APP-HYP) to feed them — not fabricated. Success state explicitly says no real Opportunity was created."
brief: ".impeccable/surfaces/client-src-pages-startanalysis-tsx.md (superseded aesthetic — grammar preserved, rendering harmonized per 2026-10-01 decision)"
a11y_notes: "Long-running generation needs an accessible live-region progress announcement, not just a visual spinner. Implemented via a role=status aria-live=polite region announcing each gauge as it streams in and a final 'Analysis complete' message."
review: pass (2026-10-01) — slop-scan clean, typecheck/lint clean, tests pass (3 new, 40/40 total).
```

```yaml
id: APP-04
name: Opportunity Workspace — Overview
surface: app
route: /app/opportunities/:id
file: client/src/components/app/opportunity/OverviewTab.tsx
journey_steps: [4]
user_question: "What is this opportunity, and what state is it in?"
primary_action: "Advance the opportunity's lifecycle status, or drill into Reasoning/Evidence/Connectors/Experiments/Decision"
data:
  - endpoint: GET /opportunities/:id
    readiness: ready
  - endpoint: PATCH /opportunities/:id/status
    readiness: ready
  - endpoint: PATCH /opportunities/:id (title/description/businessProblem/potentialValue/complexity/dependencies/aiSuitability/risks/owner)
    readiness: ready
states: [loading, error, success, permission-denied]
entry_from: [APP-01, APP-03]
exits_to: [APP-04R, APP-05, APP-06, APP-07, APP-09]
components: [Tabs, LifecycleStepper, StatusBadge]
density: dense
status: new
scope: in
reason: "Route moves under /app. Still a tabbed per-opportunity workspace even under the new IA — the reference image doesn't show an opportunity-detail screen, so this keeps the prior design. Built 2026-10-01: split the old monolithic OpportunityDetail.tsx into 6 tab components (components/app/opportunity/*) + a new standalone ExperimentDetail.tsx page (APP-08) for per-experiment editing/learnings, which used to live inline as a 6th 'Learnings' tab. Every alert() call (7 of them) replaced with InlineAlert/thrown errors — a real anti-generic fix, not just a restyle."
brief: ""
a11y_notes: "Tabs must be a proper ARIA tablist, not styled buttons with no role. Reused the shared ui/Tabs+TabPanel component (real role=tablist/tab/tabpanel wiring) instead of hand-rolled buttons."
review: pass (2026-10-01) — slop-scan clean, typecheck/lint clean, tests pass (44/44 total across both files).
```

```yaml
id: APP-04R
name: Opportunity Workspace — Reasoning
surface: app
route: /app/opportunities/:id
file: client/src/components/app/opportunity/ReasoningTab.tsx
journey_steps: [3]
user_question: "What's this opportunity's hypothesis, and what does its AI-generated report say?"
primary_action: "Save the hypothesis, or generate/regenerate the AI opportunity report"
data:
  - endpoint: PATCH /opportunities/:id (hypothesis field)
    readiness: ready
  - endpoint: POST /opportunities/:id/report
    readiness: partial
states: [empty, loading, error, success]
entry_from: [APP-04]
exits_to: [APP-05]
components: [Tabs, TextField, Button, ProgressIndicator, InlineAlert]
density: dense
status: new
scope: in
reason: "Built 2026-10-01 as part of the OpportunityDetail tab split (components/app/opportunity/ReasoningTab.tsx)."
brief: ""
a11y_notes: ""
review: pass (2026-10-01) — slop-scan clean, typecheck/lint clean, tests pass.
```

```yaml
id: APP-05
name: Opportunity Workspace — Evidence
surface: app
route: /app/opportunities/:id
file: client/src/components/app/opportunity/EvidenceTab.tsx
journey_steps: [5, 6]
user_question: "What evidence backs this specific opportunity, how confident is it, and where are the gaps?"
primary_action: "Add evidence, or flag a gap that needs sourcing"
data:
  - endpoint: GET /opportunities/:id (evidence array, existing)
    readiness: ready
  - endpoint: POST /opportunities/:id/evidence
    readiness: ready
  - endpoint: "evidence-gap detection (new — no backend logic exists yet)"
    readiness: missing
states: [loading, empty, error, success]
entry_from: [APP-04]
exits_to: [APP-06]
components: [DataTable, EvidenceTag, InlineAlert]
density: dense
status: new
scope: in
reason: "Per-opportunity evidence, distinct from the new cross-opportunity APP-EVID Evidence Explorer. Built 2026-10-01 as part of the OpportunityDetail tab split (components/app/opportunity/EvidenceTab.tsx)."
brief: ""
a11y_notes: "Evidence type (FACT/INFERENCE/ASSUMPTION/AI_HYPOTHESIS) must be conveyed by text/icon+text, not color alone. Implemented as a bracketed text tag ([FACT] claim text), never color-only."
review: pass (2026-10-01) — slop-scan clean, typecheck/lint clean, tests pass.
```

```yaml
id: APP-06
name: Opportunity Workspace — Connectors
surface: app
route: /app/opportunities/:id
file: client/src/components/app/opportunity/ConnectorsTab.tsx
journey_steps: [7, 8]
user_question: "What data sources can I connect to close an evidence gap, and how do I re-analyse once connected?"
primary_action: "Connect a data source, then trigger re-analysis"
data:
  - endpoint: "data-source connector list/connect (new — no backend exists)"
    readiness: missing
  - endpoint: "re-analysis trigger (new — no backend exists)"
    readiness: missing
states: [empty, loading, error, success, permission-denied]
entry_from: [APP-05]
exits_to: [APP-05]
components: [DataTable, Button, InlineAlert]
density: dense
status: new
scope: in
reason: "Both endpoints are net-new backend work with no existing contract — build against a clearly-labeled placeholder-contract. Built 2026-10-01 (components/app/opportunity/ConnectorsTab.tsx): static placeholder source list, Connect/Re-analyse buttons both disabled, an InlineAlert explicitly states no backend exists — not a faked working flow."
brief: ""
a11y_notes: ""
review: pass (2026-10-01) — slop-scan clean, typecheck/lint clean, tests pass.
```

```yaml
id: APP-EVID
name: Evidence Explorer
surface: app
route: /app/evidence
file: client/src/pages/app/EvidenceExplorer.tsx
journey_steps: [5, 6]
user_question: "Across all opportunities, what evidence exists, and how credible/recent is it?"
primary_action: "Search/filter evidence, add new evidence, or open its source opportunity"
data:
  - endpoint: "cross-opportunity evidence search (new — GET /opportunities/:id/evidence exists only nested per-opportunity; no cross-opportunity evidence list/search endpoint exists)"
    readiness: ready
  - endpoint: "evidence quality scoring (source credibility/date recency/applicability/data depth, per the reference image — new, no backend concept)"
    readiness: missing
states: [empty, loading, error, success]
entry_from: [APP-DASH, APP-00]
exits_to: [APP-04]
components: [DataTable, EvidenceTag, TextField, Button]
density: dense
status: new
scope: in
reason: "New cross-opportunity view from the reference image. Requires a new search/list endpoint; quality-scoring fields shown in the reference image (credibility/recency/applicability/depth) have no backend source at all — placeholder-contract, flagged plainly. Built 2026-10-05: pages/app/EvidenceExplorer.tsx against the new GET /evidence (server/src/domain/crossLists.ts, returns each row with its opportunity {id,title}). Client-side search + type filter. Quality-scoring columns are NOT shown — one InlineAlert says no backend concept exists; nothing is fabricated."
brief: ""
a11y_notes: ""
review: pass (2026-10-06) — source cards plus detail pane (key findings, source, quality per criterion, recency from capture date), Score evidence quality, Add evidence. Company filter dropped: the top-bar company switcher already scopes the list. slop-scan clean, typecheck/lint clean, client 148/148 and server 333/333 tests pass. Visual pass against the running stack still to do.
```

```yaml
id: APP-HYP
name: Hypothesis Engine & Decision Centre
surface: app
route: /app/hypothesis
file: client/src/pages/app/HypothesisEngine.tsx
journey_steps: [3, 11]
user_question: "What's the hypothesis for the opportunity I'm focused on, and what should I decide?"
primary_action: "Edit the hypothesis, generate a decision recommendation, or record the decision"
data:
  - endpoint: PATCH /opportunities/:id (hypothesis)
    readiness: ready
  - endpoint: POST /opportunities/:id/decisions
    readiness: ready
  - endpoint: "AI decision-recommendation (confidence/effort/risk scoring shown in the reference image — new, no backend concept; POST /opportunities/:id/report is a narrative report, not a structured recommendation)"
    readiness: missing
states: [empty, loading, error, success]
entry_from: [APP-DASH]
exits_to: [APP-POV]
components: [TextField, Button, StatusBadge, InlineAlert]
density: dense
status: new
scope: in
reason: "New cross-cutting view combining Reasoning+Decision into a dedicated page, per the reference image, operating on whichever opportunity is currently focused via the company/opportunity switcher. Built 2026-10-05: pages/app/HypothesisEngine.tsx. Opportunity selector bound to ?opportunity=; hypothesis saves via PATCH /opportunities/:id; decisions via POST /opportunities/:id/decisions with a history table. Structured confidence/effort/risk recommendations are not built — an InlineAlert states the backend concept does not exist."
brief: ""
a11y_notes: ""
review: pass (2026-10-06) — tabs Hypothesis/Evidence/Assumptions/Risks/Decision, Why we believe this and What could disprove this from the latest AI assessment, recommendation card with Run assessment and Create 14-day PoV. slop-scan clean, typecheck/lint clean, client 148/148 and server 333/333 tests pass. Visual pass against the running stack still to do.
```

```yaml
id: APP-07
name: Opportunity Workspace — Experiments (PoV)
surface: app
route: /app/opportunities/:id
file: client/src/components/app/opportunity/ExperimentsTab.tsx
journey_steps: [9]
user_question: "What proof-of-value experiments are running or planned for this opportunity?"
primary_action: "Create a new 14-day PoV experiment"
data:
  - endpoint: POST /opportunities/:id/experiments
    readiness: ready
states: [loading, empty, error, success]
entry_from: [APP-04]
exits_to: [APP-08]
components: [DataTable, Button, StatusBadge]
density: dense
status: new
scope: in
reason: "Experiment schema already has status/resultSummary/success/startedAt/completedAt (corrected 2026-09-30) — no schema gap. Built 2026-10-01 (components/app/opportunity/ExperimentsTab.tsx) as a list-only view — status/result/success editing moved to the new APP-08 ExperimentDetail page instead of inline editing in the list, so each row links out rather than expanding."
brief: ""
a11y_notes: ""
review: pass (2026-10-01) — slop-scan clean, typecheck/lint clean, tests pass.
```

```yaml
id: APP-08
name: Experiment Detail — Results & Learnings
surface: app
route: /app/opportunities/:id/experiments/:experimentId
file: client/src/pages/ExperimentDetail.tsx
journey_steps: [10, 12]
user_question: "How is this PoV performing, and what did we learn from it?"
primary_action: "Record a result/learning, or mark the experiment's outcome"
data:
  - endpoint: PATCH /opportunities/:id/experiments/:experimentId (status/resultSummary/success/startedAt/completedAt)
    readiness: ready
  - endpoint: POST /opportunities/:id/experiments/:experimentId/learnings
    readiness: ready
states: [loading, empty, error, success]
entry_from: [APP-07, APP-POV]
exits_to: [APP-09]
components: [LifecycleStepper, TextField, Button, InlineAlert]
density: dense
status: new
scope: in
reason: "Built 2026-10-01: new standalone page (not a tab — see APP-04's reason) holding the status/resultSummary/success editing and the Learnings list+form that used to be inline on the old OpportunityDetail's Experiments/Learnings tabs. Fetches the parent Opportunity via existing GET /opportunities/:id (no standalone experiment-fetch endpoint exists) and finds the matching experiment by id."
brief: ""
a11y_notes: ""
review: pass (2026-10-01) — slop-scan clean, typecheck/lint clean, tests pass (6 tests).
```

```yaml
id: APP-POV
name: 14-Day PoV Pipeline
surface: app
route: /app/pov
file: client/src/pages/app/PovPipeline.tsx
journey_steps: [9, 10]
user_question: "Across all opportunities, which PoVs are in progress, pending, completed, or stopped?"
primary_action: "Open a specific PoV's results, or start a new one"
data:
  - endpoint: "cross-opportunity experiment list (new — GET /opportunities/:id/experiments exists only nested; no cross-opportunity list endpoint)"
    readiness: ready
states: [empty, loading, error, success]
entry_from: [APP-DASH, APP-HYP]
exits_to: [APP-08]
components: [DataTable, StatusBadge, Button]
density: dense
status: new
scope: in
reason: "New cross-opportunity pipeline board from the reference image's 'All / In Progress / Pending / Completed / Stopped' tab row. Needs a new list endpoint; the per-experiment data itself (status, dates) already exists. Built 2026-10-05: pages/app/PovPipeline.tsx against the new GET /experiments (includes opportunity and learning count). Tabs map the reference image onto the real ExperimentStatus enum: All / In progress (RUNNING) / Planned / Completed (COMPLETE) / Stopped (ABANDONED). Rows link to APP-08."
brief: ""
a11y_notes: ""
review: pass (2026-10-06) — status tabs with counts, cards with days left / end date from start + planned days, team avatars, schedule progress bar. slop-scan clean, typecheck/lint clean, client 148/148 and server 333/333 tests pass. Visual pass against the running stack still to do.
```

```yaml
id: APP-NOAI
name: No-AI Opportunities
surface: app
route: /app/no-ai
file: client/src/pages/app/NoAiOpportunities.tsx
journey_steps: [12]
user_question: "Which opportunities were decided as not-AI-suited, and why?"
primary_action: "Review the reason, or revisit the decision"
data:
  - endpoint: "GET /opportunities filtered client-side to status=NO_AI (existing enum value, no new endpoint needed)"
    readiness: ready
states: [empty, loading, error, success]
entry_from: [APP-DASH]
exits_to: [APP-04]
components: [DataTable, StatusBadge]
density: dense
status: new
scope: in
reason: "Maps cleanly onto the existing NO_AI terminal status — no schema gap, just a filtered view that didn't exist before. Built 2026-10-05: pages/app/NoAiOpportunities.tsx — GET /opportunities filtered client-side to status NO_AI; shows aiSuitability (else businessProblem) as the reasoning. Rows link to APP-04."
brief: ""
a11y_notes: ""
review: pass (2026-10-06) — table of opportunity, reason (latest decision rationale), decision badge and date. slop-scan clean, typecheck/lint clean, client 148/148 and server 333/333 tests pass. Visual pass against the running stack still to do.
```

```yaml
id: APP-REPORTS
name: Reports & Exports
surface: app
route: /app/reports
file: client/src/pages/app/ReportsAndExports.tsx
journey_steps: [3]
user_question: "What reports can I generate or export for this engagement?"
primary_action: "Generate a report (executive summary, portfolio, evidence, PoV results, ROI, export data)"
data:
  - endpoint: POST /opportunities/:id/report (existing, narrative single-opportunity report)
    readiness: ready
  - endpoint: "portfolio-level / ROI / scheduled reports and CSV-style data export, per the reference image — new, no backend concept for any of these beyond the single-opportunity narrative report"
    readiness: missing
states: [empty, loading, error, success]
entry_from: [APP-DASH]
exits_to: []
components: [DataTable, Button, StatusBadge]
density: dense
status: new
scope: in
reason: "Only the single-opportunity narrative report has a real endpoint; every other report/export type shown in the reference image is placeholder-contract — each one's button should be visibly disabled or clearly labeled 'not yet available' rather than faking a download. Built 2026-10-05: pages/app/ReportsAndExports.tsx. The single-opportunity narrative report is real (POST /opportunities/:id/report, including its 503 AI_NOT_CONFIGURED error). The six other report/export types are disabled 'Not yet available' buttons — nothing fakes a download."
brief: ""
a11y_notes: ""
review: pass (2026-10-05) — slop-scan clean, typecheck/lint clean, tests pass (4 new tests; client 66/66, server 121/121). Visual pass 2026-10-06 (screenshots at 1440 and 390 wide against real data): ReportPanel card with Copy text.
```

```yaml
id: ADM-01
name: System Health
surface: admin
route: /admin/health
file: client/src/pages/admin/SystemHealth.tsx
journey_steps: []
user_question: "Is the backend up, and what version is running?"
primary_action: "Confirm system status; no destructive actions on this screen"
data:
  - endpoint: GET /health
    readiness: ready
  - endpoint: GET /ready
    readiness: ready
  - endpoint: GET /version
    readiness: ready
states: [loading, error, success]
entry_from: [APP-00]
exits_to: []
components: [StatusBadge, DataTable]
density: densest
status: new
scope: in
reason: " Built 2026-10-05: pages/admin/SystemHealth.tsx at /admin/health (data-surface=admin). Probes /health, /ready, /version in parallel; each row shows an OK/Failing badge plus a text detail, so status is never colour-only. Linked from the sidebar."
brief: ""
a11y_notes: ""
review: pass (2026-10-05) — slop-scan clean, typecheck/lint clean, tests pass (4 new tests; client 66/66, server 121/121). Visual pass 2026-10-06 (screenshots at 1440 and 390 wide against real data): PageHeader.
```

## D. Unresolved decisions blocking specific screens

- **APP-00/APP-DASH** (company switcher): no multi-company/tenant data model exists in the Prisma schema at all (the `Opportunity` table has no company/client field). This is a real data-model gap, not just a missing endpoint — building the switcher UI now means it operates over placeholder/local data until a schema migration adds company scoping. Flagged, not fabricated.
- **APP-DASH** (AI readiness donut + category bars): no readiness-scoring concept exists anywhere in the backend. Placeholder-contract.
- **SITE-02** (SSO buttons): no OAuth integration exists. Buttons render in a visibly-disabled/"coming soon" state, not a fake working flow.
- **APP-EVID, APP-POV** (cross-opportunity list endpoints): RESOLVED 2026-10-05 — `GET /evidence` and `GET /experiments` added (server/src/domain/crossLists.ts, read-only, not company-scoped since no company model exists). Evidence quality scoring (APP-EVID's second data row) remains a placeholder.
- **APP-REPORTS** (every report type except the single-opportunity narrative report): no backend concept for portfolio/ROI/scheduled reports or CSV export. Each such button should be disabled/labeled, not faked.
- **APP-03** (Night-Flight vs. the new reference-image palette): not resolved whether StartAnalysis's cockpit-gauge aesthetic should be harmonized into the new multi-accent system or kept as a contrasting exception — carried into `system`/`direction` for this pass.
