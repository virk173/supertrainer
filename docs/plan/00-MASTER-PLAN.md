# AI Coaching Platform — Optimized Master Plan v2.0

**Working title:** supertrainer (repo/package name; public product name still an open decision — §15 of original spec)
**Supersedes:** ORIGINAL-SPEC.md (v1.0, July 15 2026)
**Status:** Build-ready plan. Phases 0–9 in `PHASE-*.md` files, each with copy-paste Claude Code prompts.

---

## 1. What changed from v1.0 (Gap Analysis → Fixes)

The original spec is excellent product thinking with near-zero engineering decisions. Every gap below is now fixed either here or in a phase file.

| # | Gap in v1.0 | Severity | Fix (where) |
|---|---|---|---|
| G1 | **No tech stack / architecture at all** | Critical | §3 architecture decision; Phase 0 |
| G2 | **No mobile/push strategy** — the adherence engine dies if push doesn't land, but iOS web push requires an installed PWA; nothing decided | Critical | §4.1: PWA-first with guided install, Expo wrapper v1.5; Phase 6 |
| G3 | **Trainer onboarding barely specified** — the *paying customer's* first-run experience got 1 line; clients got 40 | Critical | Full trainer pipeline §5.1; Phase 1 |
| G4 | **No client migration/import** — GTM targets switchers from Trainerize/Everfit but there's no import path for their client rosters & history | High | CSV/export import wizard; Phase 1 (sub-phase 1.5) |
| G5 | **Style-learning layer has no concrete architecture** — the core moat is hand-waved | Critical | §4.2 style-profile schema + edit-diff learning loop + zero-edit metric; Phase 1 & 4 |
| G6 | **Nutrition DB undecided + Indian food gap** — spec's own example is "2 rotis, dal" but USDA doesn't cover Indian home cooking; unverified DB corrupts the ledger | High | USDA FDC + Open Food Facts + IFCT-derived Indian foods table + trainer-custom foods; Phase 3 |
| G7 | **No reminder/scheduler architecture** — timezone-correct nudges & end-of-day auto-miss marking need real infra | High | pg_cron + queue worker design; Phase 3 |
| G8 | **No AI cost model or model routing** — costs scale with clients-of-clients (spec's own risk #3) but no mitigation design | High | §4.3 model routing + prompt caching + batch; Phase 4 |
| G9 | **Escalation rule is stated, not designed** — "never answer injury/medical autonomously" needs a classifier with a false-negative story | High | Two-gate classifier (rules + LLM, fail-closed); Phase 6 |
| G10 | **No testing/QA strategy** — allergen block is called "extinction-level" with zero test plan | Critical | Property-based allergen tests, AI eval harness, E2E; every phase's DoD + Phase 8 |
| G11 | **No analytics** — trainer business analytics AND platform health metrics both missing | Medium | Trainer analytics in dashboard (Phase 7); platform metrics (Phase 9) |
| G12 | **No admin panel / support tooling** | Medium | Minimal admin in Phase 9 |
| G13 | **Compliance beyond consent unaddressed** — health-adjacent data, PIPEDA (Canada) + US state privacy, deletion rights, audit log | High | §6; RLS + audit log in Phase 0, export/delete in Phase 9 |
| G14 | **Payments under-specified** — no trials, coupons, pauses/vacation hold, taxes, refunds, multi-currency | Medium | Phase 8 covers Stripe Tax, dunning ladder, pause state |
| G15 | **Data export promise has no implementation** | Medium | Export job design; Phase 9 |
| G16 | **No observability** — LLM quality regressions would be invisible | High | Sentry + PostHog + LLM tracing (Langfuse/Braintrust); Phase 0 + 4 |
| G17 | **Draft-reply learning loop missing** — approvals/edits are the training data for voice quality but nothing captures them | High | Edit-capture pipeline §4.2; Phase 6 |
| G18 | **No demo/sandbox mode** — trainer can't try the product before risking real clients on it | Medium | Seeded demo client at trainer onboarding; Phase 1 |
| G19 | **Teaser funnel abuse surface** — rate limiting mentioned once; no bot/abuse design | Medium | Turnstile + per-link quotas; Phase 2 |
| G20 | **MVP scoping contradiction** — §13 cuts payments from v1, §9 calls payments the deepest moat. Unresolved tension | Medium | Resolved §7: payments ship in v1 as **final** phase (Stripe Connect), payment links only as pre-launch stopgap |

---

## 2. New features added in v2.0 (2026-current capabilities)

Ordered by leverage-to-effort. Each lands in a phase.

1. **Voice-note logging** (Phase 3) — client sends a voice note ("had two rotis and dal"); Whisper-class STT → same meal parser. Zero-friction beats the 10-second rule; voice is the 3-second rule. Also voice → trainer reply drafts.
2. **Grocery list + meal-prep mode** (Phase 4) — one tap turns the weekly meal plan into an aggregated grocery list and a batch-prep schedule. Huge perceived value, pure code (no AI risk).
3. **Auto-generated monthly progress report** (Phase 7) — branded PDF/share-card: weight trend, adherence score, strength PRs, photos side-by-side. The trainer forwards it; the client posts it. Built-in marketing loop for the trainer AND the platform.
4. **Wearable-informed auto-adjustment drafts** (Phase 4) — monthly plan drafts read avg steps/sleep from wearables and propose TDEE adjustments with the *reason shown to the trainer* ("avg steps fell 32% — proposing −150 kcal or +step target").
5. **Streaks, comeback mechanics & macro banking** (Phase 3) — spec had streaks; add "macro banking" (trainer-toggleable): clients can bank/spend small calorie buffers across a week, matching how flexible-dieting coaches actually work.
6. **Smart check-in cards** (Phase 6) — structured tap-to-answer cards in the thread (sleep? stress? soreness?) that write directly to the ledger; AI picks which card to send based on data gaps.
7. **Cal.com embed for tier video calls** (Phase 8) — tiers with video calls get scheduling without building a scheduler.
8. **Trainer referral engine** (Phase 9) — coaches refer coaches (rev-share credit); clients can gift a "bring a friend" trial their trainer approves.
9. **AI onboarding interview** (Phase 2) — Stage B onboarding runs as a warm conversational interview in the thread (not a form), spread over days 1–3, in the trainer's voice.
10. **Churn-risk early warning** (Phase 7) — adherence slope + logging gaps + message sentiment → "at-risk" flag in the review queue *before* the client ghosts. Retention is the trainer's revenue; this is the platform defending it.
11. **Exercise form-feedback (v2, parked)** — client uploads a set video; pose-estimation + AI cues, trainer-approved. Parked: liability + cost. Revisit post-launch.

---

## 3. Architecture decision (fixes G1)

**Principles:** solo-founder buildable, boring-where-possible, AI-native where it matters, one deploy target.

| Layer | Choice | Why |
|---|---|---|
| Web app | **Next.js 15+ (App Router, TS)** on Vercel | You have vercel plugin/skills; best Claude Code ergonomics |
| UI | **Tailwind v4 + shadcn/ui + Tremor charts** | Phase 7 dashboard quality; tweakcn theming |
| DB/Auth/Storage/Realtime | **Supabase** (Postgres 16, RLS, Realtime, Storage, Edge Functions) | One backend for auth, multi-tenancy, chat transport, photo storage; you have the supabase plugin |
| Multi-tenancy | Single DB, `org_id` (trainer) on every row + **RLS policies** | Standard, exportable, cheap |
| Jobs/schedulers | **pg_cron + pgmq** (Supabase) for reminders, auto-miss, digests; Vercel cron as backup tick | No extra vendor; timezone logic in worker |
| AI | **Claude API**: Haiku 4.5 (parsing, classification), Sonnet 5 (drafts, replies), Opus/Fable (monthly plan generation, style ingestion). Prompt caching + Batch API for nightly jobs | Model routing = cost control (G8) |
| AI plumbing | **Claude Agent SDK** for the multi-agent plan pipeline; **Zod-validated structured outputs** everywhere | Deterministic handoffs between agents |
| LLM observability | **Langfuse** (self-host or cloud) traces + evals | G16; zero-edit-rate metric lives here |
| Payments | **Stripe Connect** (Express accounts) + Stripe Billing + Stripe Tax | Spec §9 unchanged, now concrete |
| Mobile | **PWA first** (installable, web push) → **Expo wrapper v1.5** for App Store presence + native HealthKit | G2; see §4.1 |
| Push | Web Push (VAPID) + FCM via Expo later; **email digest fallback** (Resend) | Spec §8 mitigation, now concrete |
| Wearables | **Terra API or direct HealthKit/Health Connect via Expo** (v1: manual + Apple Health via PWA shortcuts is NOT viable — wearables land with Expo in v1.5; v1 ships manual steps/sleep quick-log) | Honest scoping of G2 |
| E-sign | **Documenso** (self-host) or simple click-wrap consent with hash + timestamp + IP (lawyer to confirm sufficiency) | Cheaper than DocuSign |
| PDFs | **react-pdf/renderer** server-side, branded templates | Plans, reports, consent copies |
| Errors/analytics | **Sentry + PostHog** (self-hostable) | G16 |
| Email | **Resend** (digests, receipts, PDF copies only — not a channel) | Spec §8 unchanged |
| Search | Postgres FTS (foods, clients, messages) | No extra vendor |

**Repo layout:** single monorepo (`apps/web`, `packages/db`, `packages/ai`, `packages/ui`) — Turborepo.

---

## 4. Core system designs (fixes G2, G5, G8)

### 4.1 Push & mobile reality (G2)
- v1 = installable PWA. Notification permission ask is a **framed onboarding step with platform-specific guided install** (iOS: Share→Add to Home Screen walkthrough with progress check; Android: install prompt API).
- Every nudge has a **fallback ladder**: push → (if unread 4h) in-thread badge → (if unread by 8pm local) email digest line. Ledger never depends on a single delivery channel.
- v1.5 = Expo shell (same Next.js code in WebView or Expo Router native screens for logging), unlocking reliable push + HealthKit/Health Connect + App Store presence for trainer white-label v2.

### 4.2 Style-learning layer — concrete design (G5, G17)
- **Style Profile** = versioned JSON per trainer per domain (diet / training / voice):
  - diet: meal structure, food rotation pool, carb-timing patterns, cuisine bias, supplement placement, banned/loved foods, protocol tendencies (IF, carb cycling)
  - training: exercise pool ranked, volume/rep-scheme habits, split archetypes, progression style (load/volume/rotation)
  - voice: tone markers, greeting/sign-off patterns, emoji usage, phrase bank, language mix (e.g., Hinglish), message length distribution
- **Ingestion:** trainer uploads past plans/check-ins (PDF/doc/screenshots) → extraction agent → candidate profile → **trainer reviews the profile in plain English** ("You usually run 4-day upper/lower, rotate 3 breakfast options, never program barbell rows — correct?") and confirms/edits. The confirmation step is the quality moat *and* a magical onboarding moment.
- **Learning loop:** every trainer edit to any draft is stored as `(draft, edit_diff, context)` → nightly batch job updates the style profile (few-shot exemplar bank + profile field updates). **No fine-tuning in v1** — curated exemplars + profile injected into prompts, cheaper and inspectable.
- **Metric:** zero-edit rate (% of drafts approved unedited), tracked per trainer per draft type in Langfuse. This is THE product quality number.

### 4.3 AI cost & routing (G8)
- Haiku: meal text/photo parse confirm candidates, reply-intent classification, escalation gate 2 (gate 1 is deterministic rules — see P6.3). (~90% of calls)
- Sonnet: drafted replies, check-in card selection, weekly summaries.
- Opus/Fable tier: monthly plan generation pipeline, style ingestion (rare, high-value).
- Prompt caching on the per-client context block; Batch API for nightly digests/progression drafts (50% cost).
- **Per-org AI budget meter** with soft alerts — platform margin protection, surfaced in admin (Phase 9).

### 4.4 The pipeline sync map (how phases connect — no gaps)

```
P0 Foundations ──schema/auth/RLS/design-system──▶ every phase
P1 Trainer onboarding ──style profile, tiers, brand, imported clients──▶ P2, P4, P5, P6, P7
P2 Client onboarding ──client profile, consent, intake, tier choice──▶ P3 (ledger starts), P4/P5 (plan inputs), P8 (payment capture)
P3 Adherence ledger ──daily logs, misses, scores──▶ P4 (monthly adjustments), P6 (AI context), P7 (dashboard data)
P4 Diet generator ──approved plan versions──▶ P3 (targets to log against), P6 (context), P7 (review queue items)
P5 Split designer ──approved splits, video library──▶ P3 (set logging targets), P6, P7
P6 Messaging + AI layer ──threads, drafts queue, escalations──▶ P7 (inbox/queue UI is built on P6 data)
P7 Dashboard ──review queue actions──▶ approvals flow back into P4/P5/P6
P8 Payments ──tier subscriptions, pause states──▶ P6 (payment nudges), P7 (flags), P2 (teaser unlock is the payment moment)
P9 Launch ──export, wearables, analytics, admin, referrals──▶ closes G11-G15
```
Nothing ships to a client without passing the trainer approval gate (P4/P5/P6 → P7 queue). Payments (P8) intentionally comes after the daily-driver dashboard (P7) so beta trainers run real clients free while the money rails are built — resolving G20.

---

## 5. The two onboarding pipelines (end-to-end, no gaps)

### 5.1 Trainer onboarding (Phase 1) — signup → first client invited, target < 45 min
1. Signup (email/Google) → org created → guided checklist UI
2. Brand setup: name, logo, colors, subdomain, social links (2 min, skippable)
3. **Style ingestion:** upload 3+ past plans & sample check-in convos → extraction → plain-English profile confirmation (the "wow" moment)
4. Tier builder: template ladders offered (Basic/Silver/Gold/Platinum pre-filled) → customize names/prices/contents
5. Client import wizard (for switchers): CSV/export from Trainerize/Everfit/sheets → mapping UI → bulk invite drafts
6. **Demo client** auto-seeded: fake "Alex" with 3 weeks of logs so every screen has data; trainer sends themselves a test teaser link
7. Stripe Connect onboarding (deferred allowed until first paid client — don't block activation)
8. Invite first real client (teaser link or direct invite)

### 5.2 Client onboarding (Phase 2) — teaser → consented + installed + first log < 24 h (pre-plan generic logging mode, P3.4); finalized plans by day 3–4
1. Teaser link (Stage A, 8–10 questions, <2 min, allergen-required) → blurred preview plan (allergen-blocked, rate-limited, bot-protected)
2. Tier selection → payment (P8; pre-payments-phase: trainer marks paid manually) → account created
3. Consent e-sign (blocking gate) → wearable connect offer (v1.5) → **PWA install + notification permission walkthrough** (framed as "how your coach reaches you")
4. Stage B conversational interview in the thread, spread over days 1–3, in trainer's voice (health flags route to trainer)
5. Day-1 logging starts immediately in pre-plan generic mode (≥2 meal logs/day + weigh-in days, no targets yet — P3.4); trainer approves finalized diet + split (drafts auto-queued from intake) → plans land in portal → ledger flips to plan-derived expectations

Every step emits an event; a stalled funnel step (e.g., consent unsigned 24 h) creates a review-queue nudge for the trainer. No silent drop-offs.

---

## 6. Legal & safety (unchanged from spec + additions)
All original rules stand (consent gate, deterministic allergen block, no LLM arithmetic, escalation to trainer, approval gates, no fake waivers). Added: audit log on all AI actions + approvals (who approved what when); data deletion & export rights (PIPEDA/state privacy); AI disclosure line in client ToS ("your coach uses AI assistance; a human approves conversational replies and all plans"); model output logging with PII scrubbing in traces.

---

## 7. Phase overview (files in this folder)

| Phase | File | Ships | Depends on |
|---|---|---|---|
| 0 | PHASE-0-foundations.md | Monorepo, Supabase schema+RLS, auth, design system, CI, observability, Claude Code harness | — |
| 1 | PHASE-1-trainer-onboarding.md | Trainer signup→activation, style ingestion, tier builder, import wizard, demo client | P0 |
| 2 | PHASE-2-client-onboarding.md | Teaser funnel, consent, Stage A/B intake, PWA install flow | P0, P1 |
| 3 | PHASE-3-adherence-ledger.md | All logging pipelines, auto-miss, scoring, streaks, reminders, nutrition DB | P0–P2 |
| 4 | PHASE-4-diet-generator.md | Agent pipeline, allergen block, versioned plans, grocery lists, PDFs | P0–P3 |
| 5 | PHASE-5-split-designer.md | Split agents, video library, progression drafts | P0–P4 |
| 6 | PHASE-6-messaging-ai-layer.md | Realtime threads, push ladder, drafted-reply queue, escalation gates, check-in cards | P0–P5 |
| 7 | PHASE-7-dashboard.md | The 10-year dashboard: review queue, per-client inboxes, analytics, churn radar | P0–P6 |
| 8 | PHASE-8-payments.md | Stripe Connect, tier subscriptions, dunning, pauses, Cal.com | P0–P7 |
| 9 | PHASE-9-launch.md | Data export, wearables (Expo), admin, platform analytics, referrals, hardening, GTM | all |

Each phase file = ①Learn first ②Claude setup (skills/plugins/connectors/uninterruptable config) ③GitHub repos ④Pipeline map ⑤Copy-paste prompts per sub-phase ⑥Definition of done + handoff.
