---
phase_status:
  status: done
  discover: done
  map: done
  inventory: done
  system: done
  direction: done
bmad_mode: inline
impeccable_present: true
locked_briefs: []
direction_approved: 2026-10-01
screens_total: 19
screens_done: 5
last_run: 2026-10-01
---
## Inventory notes

**Frontend**: React 18.3 + react-router-dom 6.26 + Vite 5 + TypeScript 5.5, Vitest + Testing Library for tests, ESLint 9. No UI library dependency.

**Backend**: Express 4.19 + Prisma 5.19 + Postgres (`pg`), JWT auth (`jsonwebtoken`) with bcrypt-hashed single admin credential, `tsx` for dev.

**Existing routes/pages** (`client/src/App.tsx`): auth is a gate, not a route — `App` renders a bare `LoginForm` when unauthenticated, otherwise a `BrowserRouter` with:
- `/` → `Portfolio`
- `/opportunities/new` → `NewOpportunity`
- `/opportunities/:id` → `OpportunityDetail`
A `BackendStatus` footer polls `/api/health` and shows a logout button on every authenticated screen.

**Existing API endpoints**:
- `POST /login` (`authRoutes.ts`)
- `GET /health`, `GET /ready`, `GET /version` (`app.ts`)
- `POST /ai/quick`, `POST /ai/session` (`app.ts`) — generic AI backend passthrough, not opportunity-specific
- `GET /opportunities`, `POST /opportunities`, `GET /opportunities/:id`, `PATCH /opportunities/:id`, `PATCH /opportunities/:id/status` (lifecycle transitions, validated against a state machine)
- `POST /opportunities/:id/evidence` (typed FACT/INFERENCE/ASSUMPTION/AI_HYPOTHESIS)
- `POST /opportunities/:id/decisions`
- `POST /opportunities/:id/report` — **generates an AI opportunity report** via `aiClient.quickAsk`, 503s cleanly if no AI backend configured
- `POST /opportunities/:id/experiments`, `PATCH /opportunities/:id/experiments/:experimentId`
- `POST /opportunities/:id/experiments/:experimentId/learnings`

This is richer than the plan's initial read: the backend already covers report generation (journey step 3), experiment tracking (step 9, PoV), and learnings capture (step 11, Learn/Scale/Kill) — not just the bare CRUD tracker assumed earlier. No connector/data-source or evidence-gap-identification endpoints exist yet (steps 6-8 of the 12-step journey), and no company-analysis/"Generate Intelligence" endpoint distinct from the generic `/ai/quick`/`/ai/session` passthrough (step 2).

**Existing styling**: none. Zero `.css`/`.scss` files, zero `className` usage anywhere under `client/src`. Confirmed greenfield — `build` will create, not restyle.

**Doc/config presence**:
- `_bmad/` — absent. `bmad_mode: inline` for `discover`/`map`.
- `PRODUCT.md` — present at repo root (6423 bytes).
- `DESIGN.md`, `EXPERIENCE.md`, `SCREENS.md` — absent.
- `.impeccable/` — present, with one locked brief: `.impeccable/surfaces/client-src-pages-startanalysis-tsx.md` (the "Night-Flight Instrument Six-Pack" direction for a `StartAnalysis.tsx` page that doesn't exist yet in the router — will need an `/analyze`-style route added in `map`, and a scoped approved-exception in `system`).

**Next command**: `discover` (first run — no EXPERIENCE.md yet).

## Build log
- **foundation** (2026-09-30): built. `client/src/styles/{tokens,global}.css`, `client/src/components/ui/{Button,TextField,InlineAlert,StatusBadge,DataTable,LifecycleStepper,ProgressIndicator,Tabs,index}`, `main.tsx`/`index.html` wired (Inter/IBM Plex Mono fonts, `data-surface="app"`). slop-scan clean, typecheck/lint/existing test suite (31 tests) all pass.
- While reading `OpportunityDetail.tsx`/`schema.prisma` for the next screens, found SCREENS.md had two factual errors from `inventory`: (1) the existing component already has a distinct "Reasoning" tab (hypothesis + report) that inventory had folded into "Overview" — split out as new screen **APP-04R**, journey step 3 reassigned to it; (2) `Experiment` already has `status`/`resultSummary`/`success`/`startedAt`/`completedAt` — inventory had wrongly flagged this as a schema gap for APP-07/APP-08; corrected to `ready`, screens_total 11→12.
- **APP-00** (2026-09-30): built and reviewed pass. **APP-01** (2026-09-30): built and reviewed pass (review caught an unreachable loading/error-state bug, fixed before passing).
- **2026-10-01 — major pivot**: user supplied a 9-screen reference image and explicitly chose to (a) expand scope to a public site + SSO + multi-tenant company switcher, overriding PRODUCT.md, and (b) replace the approved dark/restrained direction with the reference image's multi-accent/gradient/KPI-tile/donut-chart style — see `EXPERIENCE.md`'s 2026-10-01 Resolutions. Re-ran `inventory` (SCREENS.md fully revised, 12→19 screens); `system`/`direction` reopened, `direction_approved` reset to null. APP-00/APP-01 marked `status: restyle` — built under the now-superseded direction, rework pending new-direction approval. Nothing else already built is affected (no other screens existed yet).
- **2026-10-01 — direction approved + mockup expanded + polish pass**: user approved the revised direction and the Night-Flight harmonization; `direction.html` expanded from 3 to all 19 screens at the user's request, then given a craft pass (neutral elevation shadows, SVG donut ring replacing a conic-gradient hack, icon-based sidebar nav, real typographic hierarchy) — slop-scan caught and fixed two gradients and three oversized-radius leaks introduced mid-polish.
- **APP-00 build+review** (2026-10-01): `tokens.css` updated to match DESIGN.md's multi-accent palette (was still the superseded single-accent tokens). `AppShell.tsx` reworked to the left-sidebar layout: new `SidebarNav.tsx` (icon set, active-rail indicator, disabled "Soon" items for the 5 not-yet-built destinations so nothing links to a 404) and `CompanySwitcher.tsx` (operates on a local placeholder list — no company data model exists, per SCREENS.md §D). `StatusIndicator` relocated into the sidebar footer. Old `NavBar.tsx` deleted. `App.tsx` routes moved under `/app/...` with `/` and `/app` redirecting to `/app/portfolio` until SITE-01/APP-DASH are built. Fixed `App.test.tsx`'s 3 failures (expected the old default route) via the redirect, not by changing the test's intent. slop-scan clean, typecheck/lint clean, 31/31 tests pass. **review: pass.**
- **APP-01 build+review** (2026-10-01): route moved from `/` to `/app/portfolio`; internal `<Link>`/`navigate()` targets updated to the `/app` prefix. Visual restyle is inherited automatically from the tokens.css update (DataTable/Button/StatusBadge are 100% token-driven, zero hardcoded colors) — verified via slop-scan and a static token audit, not a full live-browser visual pass (dev server started and loads without build errors, but the authenticated view needs a stored token / running backend to exercise fully). Deeper reference-image-style columns (business value, priority) are **not** added — those fields don't exist on the real Opportunity data; not fabricated. **review: pass** for the migration; a dedicated visual-polish pass is still open and tracked in SCREENS.md's reason field.
- **APP-DASH build+review** (2026-10-01): new `client/src/pages/app/Dashboard.tsx` + `Dashboard.css`, plus two new shared `components/ui/` basics — `KpiTile` and `DonutChart` (exported via `index.ts`, styled in `ui.css`). `/app` now renders Dashboard directly instead of redirecting to Portfolio. Two of the four KPIs are real (Opportunities count, summed Evidence Sources from `GET /opportunities`'s `_count.evidence`); the other two (Active PoVs, Estimated Annual Value) show "Not yet available" rather than fabricated numbers — no experiments-count field exists on the list endpoint, and `potentialValue` is free text, not a summable currency amount. `DonutChart` renders an explicit no-data message since no AI-readiness-scoring backend exists at all (SCREENS.md §D). Updated `App.test.tsx`'s 3 assertions from `"+ New"` (Portfolio-specific) to the `"Dashboard"` heading, since that's the new default authenticated view; added 4 new tests in `Dashboard.test.tsx` covering loading/empty/error/success. slop-scan clean, typecheck/lint clean, 35/35 tests pass. **review: pass.**
- **APP-02 build+review** (2026-10-01): new `components/ui/TextAreaField.tsx` (textarea counterpart to TextField, same `.text-field` styling). `NewOpportunity.tsx` rebuilt on `TextField`/`TextAreaField`/`Button`/`InlineAlert` instead of raw `<input>`/`<textarea>`/`<button>`; added a try/catch with inline error states for both a non-ok response and a network failure, plus a loading/disabled submit state — none of which the original had. New `NewOpportunity.css`. Added 2 tests for the new error states. slop-scan clean, typecheck/lint clean, 37/37 tests pass. **review: pass.**
- **APP-03 build+review** (2026-10-01): new `StartAnalysis.tsx`, `StartAnalysis.css`, and `startAnalysisPlaceholder.ts` (the named stand-in contract for the non-existent `POST /analyze`). Harmonized six-gauge grid: Evidence Strength/Source Coverage/AI Confidence stream in from the placeholder (0.71/0.58/0.66, fixed), Risk/Feasibility/Value stay permanently NO DATA (no scoring backend exists to feed them — not faked). `role=status aria-live=polite` announces each gauge and the final result. Success message explicitly states no real Opportunity was created, since there's no backend to create one. Route `/app/analyze` added to `App.tsx`. 3 new tests (empty state, full stream, blank-submit error). slop-scan clean, typecheck/lint clean, 40/40 tests pass. **review: pass.**
- `screens_done: 5` (APP-00, APP-01, APP-DASH, APP-02, APP-03). 14 screens remain: SITE-01, SITE-02, APP-04, APP-04R, APP-05, APP-06, APP-EVID, APP-HYP, APP-07, APP-08, APP-POV, APP-NOAI, APP-REPORTS, ADM-01.
