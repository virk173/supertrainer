# Ralph Loop Progress Tracker

Task: Optimize AI Coaching Platform spec → master plan + ordered phase files with copy-paste Claude Code prompts.

## Status by iteration

### Iteration 1 (2026-07-15)
- [x] Read original spec, copied to ORIGINAL-SPEC.md
- [x] 3 research agents completed → research/ (github-repos.md, claude-plugins-skills.md, dashboard-ui.md)
- [x] 00-MASTER-PLAN.md written: 20 gaps found & fixed (G1–G20), 11 new features, architecture, sync map
- [x] All 10 phase files written (PHASE-0 … PHASE-9), each with ①learn ②Claude setup ③repos ④pipeline map ⑤prompts ⑥DoD
- [x] README.md index + deferred-decisions list
- [x] **Adversarial fresh-eyes review #1 completed** (independent agent, all 15 files): 3 CRITICAL, 8 MAJOR, 14 MINOR findings
- [x] **All 25 findings fixed**, notably:
  - C1: demo seeder staged (P1 seeds core only; P3/P4/P5/P6 each implement their seed stage)
  - C2: foods table + 150-food verified starter seed created in P2.2 (P3.1 extends); preview kcal computed in code
  - C3: plan_requests full schema (incl. kind diet|split) owned by P2.5; P4/P5 consume
  - M1: new sub-phase 8.6 beta cutover (manual-paid clients → real subscriptions, founder grace for beta trainers)
  - M2: new sub-phase 7.6b monthly progress report + share card
  - M3: splits table defined in P5.2; draft_edits gains entity_type plan|split|reply (P4.3)
  - M4: exemplar embeddings owned by P4.3 nightly job; P6.4 verifies + backfills
  - M5: wearable_daily + manual steps/sleep quick-log created in P3.3
  - M6: custom domains land in P9.5 (Vercel Domains API)
  - M7: all prompt doc references standardized to docs/plan/ (P0.1 copies the plan folder into the repo)
  - M8: pre-plan generic logging mode defined (P3.4) — <24h first-log promise now mechanically true
  - m1–m14: all applied (gate numbering, referral enum, escalation.ts absorption, socials on portal/email/PDF, reminder history mirroring, Stage B captures meal times + weigh-in days, plans_active/splits_active stub schemas, payments checklist step, manual-approve status transition, PROGRESS.md refresh)

## File map
- `ORIGINAL-SPEC.md` — untouched source spec
- `00-MASTER-PLAN.md` — optimized plan: gap analysis → fixes → architecture → phase overview
- `PHASE-0…9` — ordered build phases (PHASE-7 includes 7.6b; PHASE-8 includes 8.6)
- `research/` — July 2026 tooling research (repos, plugins/skills, dashboard UI)

## Verification checklist
- [x] Every phase has learn-first, Claude setup, repos, pipeline map, prompts, DoD + handoff
- [x] Every sub-phase prompt self-contained (docs/plan/ paths resolve after Prompt 0.1)
- [x] Trainer pipeline signup→payout: no gaps (payments checklist step added in 8.1)
- [x] Client pipeline teaser→active→paying: no gaps (pre-plan mode + 8.6 cutover close the loop)
- [x] Cross-phase sync: every table/function created before (or where) first consumed; stubs explicit
- [x] Dashboard phase has dedicated skills/plugins arsenal + design harness
- [x] Research findings incorporated (plugin gaps in P0; dashboard recipe in P7)
- [x] Fresh-eyes re-verification (review #2, independent agent): **all 18 fix-verifications PASS**, zero regressions; 5 residual wording nits (S1–S5) found and fixed same iteration (messages-stub attribution in P3.2, FK wording P3.3→P5.3, wearable_daily schema extension in P9.2, routing-accuracy threshold aligned P6②/6.3, report-note drafts reference in 7.6b)

## FINAL STATE: verified complete (iteration 1)
Two independent fresh-eyes reviews confirm: phases ordered, pipelines in sync (every table/function created before first use, stubs explicit), both onboarding funnels gap-free end-to-end (trainer signup→payout incl. payments checklist step; client teaser→first-log<24h→paying incl. 8.6 beta cutover), all prompts self-contained with resolvable docs/plan/ paths, research incorporated (repos per phase, plugin gaps, dashboard arsenal + design harness).

---

# Build progress (repo: supertrainer)

Sub-phase status for the actual build. Update after each sub-phase's Definition of Done passes.

## Phase 0 — Foundations
- [x] 0.1 Architecture lock-in + repo scaffold (2026-07-15, commit 5464db3) — monorepo boots, typecheck green, placeholder page verified in browser
- [ ] 0.2 Supabase project, core schema, RLS (requires Docker)
- [ ] 0.3 Auth flows + org bootstrap
- [ ] 0.4 Design system baseline + app shells
- [ ] 0.5 CI/CD + observability
