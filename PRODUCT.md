# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Internal team members (the consulting/delivery team running the AI Accelerator methodology on behalf of clients) — not external self-serve prospects. A team member enters a client company's name and reviews the resulting AI opportunity intelligence as part of a delivery engagement. Authenticated, single-tenant internal tool (existing single-admin JWT login), not a public multi-tenant SaaS sign-up flow.

## Product Purpose

Turn a company name into an evidence-backed AI opportunity report, automating the DISCOVER → REASON → DECIDE stages of the existing AI Accelerator methodology for a given client company, without requiring any access to that company's internal systems. This is "Phase 1: Intelligence without customer access" of a larger two-phase product vision (Phase 2, evidence-enriched validation via customer data connectors and PoV pipelines, is explicitly out of scope for this engagement — see Capabilities and Constraints).

## Positioning

The AI Accelerator already exists as a manual internal tracker (Opportunity/Evidence/Decision/Experiment/Learning entities, Phases 1-5 of this same codebase). This work automates the front end of that pipeline: instead of a team member manually creating an Opportunity and typing in evidence one row at a time, they type a company name and the system uses AI to research and populate an initial, evidence-labeled opportunity report — the team member's manual entry then becomes review/refinement rather than starting from a blank page. The "earned access" principle (only request the minimum customer data needed to validate a specific hypothesis, never a blanket integration request) is the guiding product principle for the later Phase 2 work, even though Phase 2 itself isn't being built now.

## Operating Context

Runs inside the existing AIaccelerator Docker Compose stack (React/Vite client behind nginx, Express/TS server, Postgres via Prisma), gated behind the existing JWT login. A team member is already logged in and navigating the existing Portfolio/OpportunityDetail UI when they start a new company analysis.

## Capabilities and Constraints

- Builds on the existing Prisma schema: `Opportunity`/`Evidence`/`Decision`/`Experiment`/`Learning`, the existing 9-state Opportunity lifecycle, and the existing `AiClient` (wraps the Council-of-ai-experts conclave's `/api/external/quick` and `/api/external/session` — text-in/text-out LLM synthesis, no built-in web browsing or search).
- **Open decision, not yet resolved:** the DISCOVER stage (company profile, industry, technology signals, competitor landscape) as described in the brief implies live public-web research. The current `AiClient` cannot browse the web — it can only synthesize from what's included in its prompt or what the underlying model already knows from training. Before this is built, a decision is needed on the evidence-sourcing mechanism: (a) rely on the model's trained knowledge with an explicit "model knowledge, not live-verified" disclosure on every claim, (b) add a real web-search capability to the pipeline (a new integration, not yet built anywhere in this codebase), or (c) require the team member to paste in source material (news articles, the company's own site content) as the seed evidence rather than fully automating discovery. This choice changes both the backend architecture and the "evidence-backed" claim's honesty, so it must be resolved explicitly during design, not defaulted silently.
- Out of scope for this engagement (explicitly deferred, part of the larger two-phase vision but not this build): public marketing website, sign-up/SSO authentication, multi-tenant company switching, the Phase 2 "earned access" data-connector system, the 14-day PoV pipeline, and automated re-analysis after customer evidence is connected.
- The output is a new (or updated) `Opportunity` record plus generated `Evidence` entries, editable/reviewable by the team member afterward through the existing OpportunityDetail UI — not a separate, disconnected report artifact.

## Evidence on Hand

None yet for this specific feature. The referenced mockup image (public marketing site + dashboard screens, SSO sign-in, multi-page nav) is the user's own reference for the eventual full two-phase product, not an approved design for this Phase-1-only build — it's explicitly called out as not matching what should actually be built now (internal tool, not public SaaS). Its IA doesn't apply (no public site, no SSO, no multi-tenant switcher), but its visual craft/polish level is the pinned bar — see Brand Commitments.

## Brand Commitments

**Standing visual direction (pinned 2026-09-30):** category-standard, high-craft B2B SaaS dashboard aesthetic — the "canon," not an unconventional/bold world. An earlier attempt at a distinctive visual world (a cockpit-instrument-panel metaphor, produced via Impeccable's concept-seed dice roll) was explicitly rejected as not matching the user's intent; the user wants the polish level of their own reference screenshot, restructured around the actual product IA (internal tool, Portfolio + Opportunity/Evidence, no public marketing site or SSO), not the screenshot's specific navigation/pages. Craft bar named by the user: **Linear, Stripe Dashboard, Vercel** — dark theme, clean geometric sans (Inter), restrained single accent color, subtle 1px borders over heavy shadows, dense-but-legible data density. This is a durable preference for all future UI work on this feature, not a one-off choice for a single screen.

## Product Principles

- Evidence before automation: never present an AI-generated claim as fact without labeling its source/confidence.
- Earn access, don't demand it: Phase 2 (not built now) will request only the minimum data needed for a specific hypothesis — this shapes the whole product's posture even in Phase 1.
- Automate the blank page, not the judgment: the AI populates a starting draft; a human still decides what's credible and what to act on.
- Build on what exists: this feature is an accelerant on top of the existing manual Opportunity/Evidence pipeline, not a parallel system.

## Accessibility & Inclusion

No product-specific requirement established beyond the existing app's baseline (currently unstyled/functional, per `docs/IMPLEMENTATION_STATUS.md`'s own deferred UI-polish item).
