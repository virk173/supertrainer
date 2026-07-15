# AI Coaching Platform — Build Plan

A complete, phase-ordered build plan for the AI coaching platform for personal trainers, optimized from the original spec (July 2026) with gap analysis, current tooling research, and copy-paste Claude Code prompts.

## How to use this folder

1. **Read [00-MASTER-PLAN.md](00-MASTER-PLAN.md)** — the optimized spec: 20 gaps found & fixed, 11 new features, architecture decisions, and the phase sync map.
2. **Work the phases in order** (`PHASE-0` → `PHASE-9`). Each phase file has the same structure:
   - **① Learn first** — 40–90 min of things to understand before starting
   - **② Claude setup** — skills/plugins/connectors to install + the uninterruptable-build config for that phase
   - **③ GitHub repos** — vetted current repos to use or study (licenses noted)
   - **④ Pipeline map** — how the phase's pieces connect and what flows in/out of neighboring phases
   - **⑤ Sub-phase prompts** — fully self-contained prompts to paste into Claude Code, in order
   - **⑥ Definition of done** — verification checklist + explicit handoff to the next phase
3. **Paste prompts one at a time.** Each assumes the previous one's Definition of Done passed. Don't skip DoD checks — later phases build on them.
4. **Track progress** in [PROGRESS.md](PROGRESS.md) — prompts tell Claude to update it as phases complete.

## Files

| File | What |
|---|---|
| [ORIGINAL-SPEC.md](ORIGINAL-SPEC.md) | Untouched source spec (v1.0) |
| [00-MASTER-PLAN.md](00-MASTER-PLAN.md) | Optimized plan v2.0 — read first |
| [PHASE-0-foundations.md](PHASE-0-foundations.md) | Monorepo, Supabase schema+RLS, auth, design system, CI, observability, Claude harness |
| [PHASE-1-trainer-onboarding.md](PHASE-1-trainer-onboarding.md) | Trainer activation: brand, style ingestion (the moat), tiers, import, demo client, invites |
| [PHASE-2-client-onboarding.md](PHASE-2-client-onboarding.md) | Teaser funnel, consent gate, PWA install + push, Stage B interview |
| [PHASE-3-adherence-ledger.md](PHASE-3-adherence-ledger.md) | Nutrition DB, all logging surfaces, auto-miss, scoring, streaks, reminders |
| [PHASE-4-diet-generator.md](PHASE-4-diet-generator.md) | Multi-agent diet pipeline, allergen block, monthly adjustments, grocery lists, PDFs |
| [PHASE-5-split-designer.md](PHASE-5-split-designer.md) | Split pipeline, injury exclusions, video library, progression |
| [PHASE-6-messaging-ai-layer.md](PHASE-6-messaging-ai-layer.md) | Realtime threads, push ladder, drafted replies, escalation gates, check-in cards |
| [PHASE-7-dashboard.md](PHASE-7-dashboard.md) | The "10-year" dashboard: queue, per-client inbox, forensic grid, analytics, churn radar, progress reports |
| [PHASE-8-payments.md](PHASE-8-payments.md) | Stripe Connect, checkout, webhook state machine, dunning, Cal.com, beta cutover |
| [PHASE-9-launch.md](PHASE-9-launch.md) | Data export, Expo + wearables, admin, referrals, marketing site, hardening, launch runbook |
| [research/](research/) | July 2026 research: GitHub repos, Claude plugins/skills, dashboard UI resources |

## Explicitly deferred (decided, not forgotten)

- **Staff/team accounts** — schema supports role `staff` (P0), but no staff invite/permission UI in v1; ICP is solo coaches. Revisit post-launch.
- **White-label native apps (v2)** — Expo shell (P9) is the groundwork; per-trainer store apps priced as a premium tier later (spec §11).
- **Fitbit/Garmin/Oura/Whoop** — evaluate open-wearables (P9 repo list) when demand appears; Apple Health + Health Connect first.
- **Exercise form-check AI** — parked (liability + cost, MASTER-PLAN feature 11).
- **Full i18n** — language preference captured (P2) and respected in AI voice (P6); UI translation deferred.
- **Fine-tuning on trainer voice** — exemplar-bank + profile injection first (MASTER-PLAN §4.2); revisit if zero-edit rate plateaus.
