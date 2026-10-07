# DESIGN.md

Cross-surface design system for AI Accelerator, produced by `product-atlas system`.

**Revised 2026-10-01.** The 2026-09-30 version of this file (dark/restrained Linear-Stripe-Vercel
direction) is **superseded**, not extended — the user supplied a 9-screen reference image and
explicitly chose to replace the visual direction outright (see `EXPERIENCE.md`'s 2026-10-01
Resolutions). This also means two of `reference/anti-generic.md`'s rules are now waived
**project-wide** by explicit user decision, not as scoped per-screen exceptions:
- the "3-4 KPI-tile hero row" ban (the Dashboard's 4-tile metric row is the approved home pattern)
- the ">8px radius" cap (this direction's card radius is 10-12px)
A donut/ring chart is also newly in use (Dashboard's AI-readiness ring) — not previously banned,
but noted here since it's a new pattern class. The remaining anti-generic rules (no gradient
text/fills, no backdrop-filter glass, no colored glow shadows, no decorative "AI magic" icons, no emoji
in headings, tables over bare card grids for list data, tabular figures) still apply — this
direction is more colorful, not "AI slop": no gradients, no glow, no glassmorphism, and list data
(Portfolio, Evidence, PoV pipeline) still renders as real tables, matching the reference image
itself, which uses tables for every list.

**Revision 2026-10-07 (light app theme).** The user judged the dark app "not close to the mockup" and asked for it to match the supplied image, which reverses the 2026-10-06 "keep dark app" decision. The authenticated app and the sign-in form card now use `[data-theme="light"]` tokens (white cards on a pale page, a deep-navy sidebar via `--sidebar-*`, soft shadows, pastel `--tint-*` for KPI cards and pills, pill radius `--radius-pill`). The public site and the sign-in brand panel stay dark. Text accents are darkened under the light theme to hold 4.5:1. New components: `BrandMark`, KPI cards with icon and tone, `DonutChart` with icon rows, `BarList` tones, pill `Tabs`, numbered `Pagination`, `PriorityBadge` High/Medium/Low as green/blue/red. The landing hero is a drawn SVG night mountain (`--art-*` tokens), not a photograph. No new approved exceptions were needed: the mockup uses solid colours, and SVG gradients are not CSS gradients.

## Base tokens

```css
:root {
  /* Palette primitives */
  --color-bg: #0b1120;
  --color-surface: #141b2e;
  --color-surface-raised: #1b2438;
  --color-border: #2a3348;
  --color-text: #e8ecf5;
  --color-text-muted: #8993ab;
  --color-on-accent: #ffffff;
  --color-focus-ring: rgba(59, 130, 246, 0.35);

  /* Accents — multi-accent by explicit 2026-10-01 override (was single-accent) */
  --color-accent-blue: #3b82f6;
  --color-accent-cyan: #22d3ee;
  --color-accent-purple: #a78bfa;
  --color-accent-orange: #fb923c;
  --color-accent-green: #34d399;
  --color-accent-red: #f87171;

  /* Semantic aliases */
  --color-accent: var(--color-accent-blue);
  --color-danger: var(--color-accent-red);
  --color-caution: var(--color-accent-orange);
  --color-success: var(--color-accent-green);

  /* Type */
  --font-family: "Inter", system-ui, sans-serif;
  --font-family-mono: "IBM Plex Mono", ui-monospace, monospace;
  --text-body-size: 13px;
  --text-heading-size: 22px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;

  /* Shape — 10px, above the normal 8px cap; approved project-wide 2026-10-01 */
  --radius: 10px;

  /* Motion */
  --motion-duration: 120ms;
}
```

Tabular figures (`font-variant-numeric: tabular-nums`) still apply to every numeric column/readout.

## Surface remaps

```css
[data-surface="site"] {
  /* Editorial — public landing page. In scope as of 2026-10-01 (was deferred). */
  --text-body-size: 16px;
  --motion-duration: 240ms;
}

[data-surface="app"] {
  /* Dense, table-first for list data; KPI tiles/donut only on the Dashboard home. */
  --text-body-size: 13px;
  --motion-duration: 120ms;
}

[data-surface="admin"] {
  --text-body-size: 13px;
  --motion-duration: 0ms;
}
```

## Components

Derived from every `components` field across the revised `SCREENS.md`.

**Shared basics** (`client/src/components/ui/`):
- `Button`, `TextField`, `InlineAlert`, `DataTable`, `StatusBadge`, `LifecycleStepper`,
  `ProgressIndicator`, `Tabs` — unchanged from the 2026-09-30 foundation build; only their token
  values change (new palette/radius), not their structure or accessibility contract.
- `PageHeader`, `Select`, `EvidenceTag`, `ReportPanel` (new 2026-10-06 visual pass) — `PageHeader` is the single
  page-title pattern (h1 + one-line description + optional actions) for every `/app/*` page; `Select` is the styled
  native select (same label/focus contract as `TextField`); `EvidenceTag` renders an evidence type as bracketed text with
  colour only as reinforcement; `ReportPanel` shows a generated report as a card with a Copy text action. `Tabs` gained an
  optional per-tab `count`, and `DataTable` now wraps its table in a scrolling card so a wide table never widens the page.
  `AppShell` collapses the sidebar into a top bar with a Menu drawer at <= 800px (approved in `docs/mockups/polish.html`).
- `KpiTile` (new) — a single metric + label + optional delta, used only in the Dashboard's 4-tile
  row. Not a general-purpose card; do not reuse it as a substitute for a real table elsewhere.
- `DonutChart` (new) — the AI-readiness ring. Must render a text/table equivalent of its data
  alongside the visual (`reference/anti-generic.md`'s general "no color-only meaning" rule) — an
  SVG ring with a number in the middle is not itself accessible.

**Surface-specific assemblies**:
- `client/src/components/app/AppShell.tsx` — reworked 2026-10-01 to a left-sidebar layout
  (`SidebarNav`) plus a top-bar `CompanySwitcher`, replacing the 2026-09-30 top-nav shell.
- `client/src/components/app/SidebarNav.tsx`, `CompanySwitcher.tsx` (new)
- `client/src/components/app/opportunity/{OverviewTab,ReasoningTab,EvidenceTab,ConnectorsTab,ExperimentsTab,DecisionTab}.tsx`
- `client/src/components/app/EvidenceTag.tsx` — conveys FACT/INFERENCE/ASSUMPTION/AI_HYPOTHESIS by
  text+icon, never color alone (unchanged rule, still applies under the new palette).
- `client/src/components/site/` — new: `Hero`, `FeatureHighlight` for the landing page.
- `client/src/components/admin/` — unchanged, reuses `DataTable`/`StatusBadge`.

## Approved exceptions

**Resolved 2026-10-01**: the user chose to harmonize StartAnalysis into the new multi-accent
palette rather than keep it contrasting. The two exceptions below (glow, font-family) are
**revoked** — StartAnalysis now follows the standard tokens like every other screen. The six-gauge
*grammar* (Evidence Strength/Source Coverage/AI Confidence/Risk/Feasibility/Value, each reading
NO DATA until populated) from the locked brief is preserved as a distinctive component — it's a
real information structure, not decoration — but rendered as flat ring/bar readouts in
`--color-accent-blue/cyan/purple/orange`, using `--font-family` (Inter), on the standard
`--color-surface` background. No glow, no matte-black panel, no IBM Plex Mono.

```yaml
# (superseded 2026-10-01 — kept here for history, no longer active)
# - surface: app
#   files: ["client/src/pages/StartAnalysis.tsx"]
#   pattern: colored-glow-shadow
#   approved: 2026-09-30
#   revoked: 2026-10-01 (user chose to harmonize rather than keep contrasting)
# - surface: app
#   files: ["client/src/pages/StartAnalysis.tsx"]
#   pattern: font-family-divergence
#   approved: 2026-09-30
#   revoked: 2026-10-01
```

No active exceptions remain. No other locked briefs exist under `.impeccable/surfaces/`.
