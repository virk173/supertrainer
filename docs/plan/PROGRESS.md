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
- [x] 0.2 Supabase project, core schema, RLS (2026-07-15) — 3 migrations apply cleanly, 26 pgTAP RLS tests green (cross-org, cross-client, audit_log isolation, privilege-escalation guards), org_id/user_role JWT claims via custom access token hook, types generated
- [x] 0.3 Auth flows + org bootstrap (2026-07-15) — email OTP + Google OAuth (code path; creds pending), org bootstrap with claim refresh, invites table + RLS tests (33 total green), role-guard middleware, 2 Playwright smoke tests green
- [x] 0.4 Design system baseline + app shells (2026-07-15) — semantic tokens (surface scale, status colors, metric utility) light+dark, TrainerShell (collapsible sidebar + topbar) and PortalShell (bottom tabs) wired as layouts, EmptyState/Skeleton/ErrorBoundary primitives, /styleguide QA route; 3 Playwright checks green (screenshots light+dark & mobile+desktop, zero horizontal overflow, axe-core WCAG AA clean incl. real /portal route), all 5 e2e green
- [x] 0.5 CI/CD + observability (2026-07-15) — GitHub Actions CI (typecheck/lint + local-Supabase RLS/pgTAP + Playwright smoke) and deploy (Vercel prod, `supabase db push` behind a `production` environment approval gate); Sentry (client/server/edge instrumentation + source maps via withSentryConfig, Turbopack post-build hook); PostHog (`track()` in packages/ui + App Router pageview capture + server `trackServer()` dual-writing the events table); Langfuse tracing wrapping getClaudeClient() (model/latency/tokens/cost/task via AsyncLocalStorage). All integrations no-op without keys. Verified: typecheck+lint clean, RLS 39/39, CI env-mapping command, app boots with instrumentation (console clean, guarded /api/debug/sentry → 501). **Interactive setup (repo/secrets/dashboards/branch-protection/PR verification) is documented in docs/ci-cd-observability.md — not runnable in a non-interactive session.**

## Phase 1 — Trainer Onboarding (branch: `phase-1`, in progress)
- [x] 1.1 Activation checklist engine (2026-07-15, commit e0d3026) — org_onboarding_state table + RLS (staff-only) + grants + 8 pgTAP (47 total green); /onboarding Accordion checklist (progress bar, per-step skip/reopen/deep-link, celebratory completion), events(onboarding_step_completed) via trackServer, dismissible resume banner in TrainerShell; dynamic /onboarding/[step] stub superseded by real routes as sub-phases land. Fixed a latent hydration bug (PostHogPageview useSearchParams → client-bailout Suspense offset React useId, breaking Radix aria ids) by reading window.location in-effect. Verified in browser + 8/8 e2e.
- [x] 1.2 Brand setup + live preview (2026-07-15, commit 6bd4f04) — public-read 'brand' storage bucket (2MB, image types) + org-scoped write policies; /onboarding/brand form (logo upload→Storage, primary color w/ WCAG-AA warning, reserved-word slug + DB-unique, socials), live portal+PDF preview; orgs.brand/slug persisted + step marked done; getOrgTheme(org_id)/BySlug (service-role, public fields) + pure orgThemeVars/brandSocialLinks in packages/ui; /c/[slug] branded landing (P2 teaser stub) + middleware subdomain→/c/{slug} rewrite; PortalShell footer socials. Verified in browser (brand form live preview + /c/{slug}) + 12/12 e2e.
- [x] 1.3 Style-learning ingestion (2026-07-15, commits e2debc3/7b7c1ba + Stage B) — the moat. Schema (uploads/style_profiles/style_exemplars + pgvector) + staff-only RLS + 11 pgTAP (58 total green); private org-scoped 'ingestion' bucket (pdf/docx/image/text). diet/training/voice extraction agents (packages/ai/src/style) via modelRouter('ingest')→Opus 4.8, Zod schemas per §4.2, cached system prompts. Eval harness (`npm run eval:style`) scores **100% field accuracy** on 5 fixtures (gate 90%). Extraction worker (pdf-parse v2 / mammoth / Claude vision, server-external) → upload zone → real drafts → plain-English editable confirmation UX → confirm marks step done. getStyleProfile(org_id,domain) with prompt-cache-friendly serialization (DoD helper). Verified: eval 100%, live e2e (upload→real Opus extraction→confirm) + CI-safe confirmation e2e, browser (upload zone + confirmation UI). 14/14 e2e green. ANTHROPIC_API_KEY now in apps/web/.env.local (also needs CI/Vercel secrets for prod ingestion + eval workflow).
- [x] 1.4 Tier builder (2026-07-15) — tiers table (name/price/currency/cadence/position/features jsonb/stripe_product_id) + staff-only RLS + 7 pgTAP (65 total green); /onboarding/tiers builder pre-filled from the spec §8 template ladder (Basic/Silver/Gold/Platinum), rename/reprice/edit features (checkin frequency, video calls, priority, custom lines), add/remove (max 6, min 1), move up/down reorder; constant AI floor shown as "included in every tier"; reusable branded TierCard in packages/ui (client-facing preview, reused P2 teaser + P8 checkout); saveTiers replaces the set preserving stripe_product_id, marks step done. Verified in browser + 2 e2e (reorder persists across reload; min-1-tier + price validation). 16/16 e2e green.
- [x] 1.5 Client import wizard (2026-07-16) — import_batches table + clients.import_batch_id + staff-only RLS + 6 pgTAP (71 total green); /onboarding/import wizard: CSV (papaparse) / XLSX (sheetjs) parse client-side, live 5-row preview, per-field mapping dropdowns with AI-proposed mapping (mapColumns agent, modelRouter('parse')→Haiku, user confirms — never auto-applies), validation (missing email+phone, invalid email, duplicate email; allergies-unmapped warning), import → lead clients (source=import, intake jsonb, allergies→health_flags) under an undoable batch, post-import checkbox list → Draft invites (unsent invites rows), Undo within 24h. mapColumns/IMPORT_FIELDS kept out of the client bundle (fields.ts self-contained). Verified: 2 e2e (messy CSV: extra cols/unicode/missing+invalid+dup emails → validate → import → draft invites → undo, with real Haiku mapping; allergies-unmapped warning). 18/18 e2e green.
- [x] 1.6 Demo client foundation (2026-07-16) — clients.is_demo + partial index; is_demo added to the client-restricted-columns guard + 3 pgTAP (74 total green). Idempotent staged seeder packages/db/seed/demo-client.ts: seedDemoClient(orgId) finds-or-creates a badged "Alex Demo" (status=active, source=invite, realistic intake + Peanuts allergy), runs stages seedCore now + seedLedger/seedPlans/seedSplit/seedThread registered as no-ops (Phases 3/4/5/6 fill them). Shared excludeDemoClients() query helper in packages/db (every analytics/export/billing count inherits it). /onboarding/demo: create/reset demo, badged DEMO card with intake highlights, "Send yourself the teaser" (org /c/{slug} link + QR + copy). Verified in browser + 2 e2e (create idempotent + badged + step done + teaser; is_demo excluded from aggregates). 20/20 e2e green.
- [ ] 1.7 Invites + activation completion — not started (copy-link buildable; email send needs Resend key)
