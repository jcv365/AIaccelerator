# Implementation Status

## Phase 1 — Foundation (complete)

- [x] Docker Compose skeleton: postgres + server (Express/TS) + client (React/Vite)
- [x] Health checks: `/health`, `/ready`, `/version`
- [x] Env-driven config, validated at startup
- [x] No accelerator logic yet

## Not yet implemented

- Phase 2: AI provider abstraction (routes through Council-of-ai-experts)
- Phase 3: Core domain model (Opportunity, Evidence, Decision, Experiment, Learning)
- Phase 4: Frontend operational views (portfolio, evidence, reasoning, decisions, experiments, results, learning)
- Phase 5: Observability, security hardening, prompt-injection tests, e2e smoke test

## Risks

- Council-of-ai-experts is currently a Python CLI, not an HTTP service — Phase 2 needs a thin API wrapper or reimplementation of its provider-routing logic.
