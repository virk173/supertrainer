# PHASE 2 — Client Onboarding, Teaser Funnel & Consent

**Ships:** the lead-conversion teaser (Stage A), signup + consent gate, PWA install + notification walkthrough, and the conversational Stage B interview. Target: teaser → consented + installed + first log in < 24 h (pre-plan generic logging mode — see P3.4); finalized plans live by day 3–4.
**Depends on:** Phase 0 (auth/RLS/shells), Phase 1 (brand, tiers, invites, style profiles for teaser voice).
**Feeds:** Phase 3 (intake data starts the ledger), Phase 4/5 (intake feeds plan agents), Phase 6 (thread + notification permission), Phase 8 (tier selection is the payment moment).

---

## ① Learn first (~40 min)

| Topic | Why | Where |
|---|---|---|
| PWA installability + web push on iOS | iOS web push ONLY works from an installed PWA (16.4+); your adherence engine depends on this walkthrough | web.dev/articles/install-criteria + push docs |
| Cloudflare Turnstile (or hCaptcha) | Teaser endpoint is a paid-AI-per-request public endpoint — bot protection is not optional | developers.cloudflare.com/turnstile |
| Click-wrap consent enforceability basics | You're storing consent evidence (hash, timestamp, IP); know what makes it defensible; confirm with a lawyer | 30-min read; then lawyer |
| Upstash/Vercel rate limiting patterns | Per-link teaser quotas | context7: @upstash/ratelimit or Postgres-based |

## ② Claude setup for this phase

- Skills: `frontend-design` (teaser page is a marketing surface — it must look expensive), `feature-dev`, `webapp-testing`/playwright plugin (funnel E2E), `security-review` before merging (public endpoints!).
- **Uninterruptable config:** PreToolUse deny-hook blocking `supabase db reset` on any branch containing real data; allow-list `Bash(npx playwright *)`. Ralph-loop the Stage-B interview agent tuning with promise "interview eval fixtures all produce complete intake JSON".
- Worktree branch `phase-2`.

## ③ GitHub repos for this phase

- [formbricks/formbricks](https://github.com/formbricks/formbricks) — funnel/survey UX patterns (reference only, AGPL)
- [heyform/heyform](https://github.com/heyform/heyform) — conversational form pacing reference (AGPL)
- [documenso/documenso](https://github.com/documenso/documenso) — e-sign if lawyer requires full signature UX (AGPL, self-host); else click-wrap
- [web-push-libs/web-push](https://github.com/web-push-libs/web-push) — VAPID web push (used in P6, permission captured here)
- [colinhacks/zod](https://github.com/colinhacks/zod) — every intake payload validated

## ④ Pipeline map (no-gap client funnel)

```
ENTRY A: teaser link (bio/socials)          ENTRY B: direct invite /join/{token} (P1)
   │                                            │
2.1 Stage A form (8-10 q, <2min, allergies req) │
   ├─▶ 2.2 blurred preview (allergen-blocked,   │
   │        rate-limited, watermarked)          │
   └─▶ tier cards (P1 component) → signup ──────┤
                                                ▼
                         2.3 Consent gate (BLOCKING — nothing proceeds unsigned)
                                                ▼
                         2.4 PWA install + notification walkthrough (platform-detected)
                                                ▼
                         2.5 Stage B conversational interview (days 1-3, trainer voice)
                                                ▼
              health flags → trainer review ─▶ plan drafts queue (P4/P5) ─▶ approval ─▶ portal live
                                                ▼
                         Day-1 logging prompts begin (P3 takes over)
Every step → events table; stalls (consent unsigned 24h, install skipped, interview incomplete 72h)
→ review-queue nudges (P7) + gentle client reminders (P6).
```

## ⑤ Sub-phases — copy-paste prompts

### 2.1 — Stage A teaser intake

```
Read CLAUDE.md, then docs/plan/PHASE-2-client-onboarding.md section ④ funnel map, then docs/plan/ORIGINAL-SPEC.md §10 Stage A.

Build the public teaser funnel at /c/{slug}/start (org-branded via getOrgTheme):
- Table: leads (id, org_id, email, phone nullable, answers jsonb, allergens text[] NOT NULL, status enum started|preview_shown|converted|expired, turnstile_verified bool, created_at) with RLS (org read-only; inserts via server action only)
- One-question-per-screen mobile-first flow (progress dots, back support, <2 min): name, email, age, sex, height, weight, primary goal (chips), activity level/job type, training days per week, experience level, dietary preference (veg/non-veg/vegan), allergies (typeahead multi-select from allergen taxonomy + free text; "none" must be explicitly selected — never default)
- Cloudflare Turnstile on load; server-side verify before any AI call
- Rate limits: 3 teaser generations per email per week; 50/day per org link; sliding-window in Postgres
- Persist lead on final submit; fire event 'lead_created'

Tests: allergen explicit-none requirement, rate limits, Turnstile failure path. Commit: "feat(teaser): stage A intake".
```

### 2.2 — Blurred preview generator

```
Build the teaser preview (the conversion mechanic — ORIGINAL-SPEC §10):
- FIRST, create the foods table with its FULL schema (this is the v0 of the verified nutrition DB — P3.1 extends it with full imports; schema): foods (id, source enum usda|off|ifct|org_custom|seed, source_ref, name, name_normalized, cuisine_tags text[], allergen_tags text[], serving_units jsonb, kcal/protein/carbs/fat/fiber per 100g, verified bool) + a starter seed preview-foods-seed.json (~150 common foods across cuisines incl. Indian staples, macros from published USDA/IFCT values, allergen_tags filled — cite source per row)
- Server action generatePreview(lead_id): calls a single cheap composite agent (modelRouter 'draft') that produces: top 2 diet-plan lines (day 1 breakfast + lunch as combinations of seeded food ids + grams) and top 4 exercises of day 1 (names + set/rep) in the TRAINER'S style (inject confirmed style profile from P1) — Zod-validated; kcal shown in the preview are computed IN CODE from the foods table (CLAUDE.md rule 4 — never model-emitted numbers)
- HARD RULE (test this first, code-review it twice): the allergen filter runs BEFORE generation — the food candidate pool passed to the model has allergen-matching foods removed via the deterministic taxonomy filter (packages/ai/allergens.ts — build it now: allergen taxonomy JSON mapping allergens → food exclusion tags, applied against foods.allergen_tags; unit tests with tricky cases: "tree nuts" excludes almond flour, ghee is dairy, whey is dairy)
- Preview UI: rendered plan card with remainder BLURRED (CSS blur on real-looking placeholder rows, not truncation), label "Draft preview — your coach will review and finalize", trainer brand header, tier cards (P1 component) as unlock CTA
- Store preview content on the lead; re-visits show cached preview (no regeneration)
- Conversion: tier click → signup flow → creates client (status=onboarding, source=teaser) linked to lead; payment deferred to P8 (until then: "your coach will confirm your spot" + trainer manual-approve action, which sets clients.status=active and records approved_manually=true — P8.6 migrates these to real subscriptions)

Tests: allergen never appears in preview (property-test across taxonomy), cache behavior, conversion creates correct rows. Run /security-review on the public endpoints. Commit: "feat(teaser): blurred preview with deterministic allergen block".
```

### 2.3 — Consent gate

```
Build the consent step (BLOCKING gate before any coaching content):
- Table: consents (id, org_id, client_id, doc_version, doc_sha256, signed_name, signed_at, ip, user_agent) append-only, RLS org+own-client read
- Consent doc: markdown template (versioned in repo /legal/consent-v1.md) with placeholders (trainer name/business); render to a scrollable view; require scroll-to-bottom + typed full name + checkbox; store sha256 of exact rendered text
- PDF copy generated (react-pdf, branded) → stored to client files + emailed via Resend
- Client cannot proceed to any portal/plan/chat route until consent exists — middleware guard on (app)/portal/* checking consent, redirecting to /consent
- "Lawyer TODO" comment block at top of template listing what needs professional review (jurisdiction, liability language, health disclosures)

Tests: guard blocks all portal routes pre-consent; hash stability; PDF renders. Commit: "feat(consent): blocking consent gate with evidence trail".
```

### 2.4 — PWA install + notification permission walkthrough

```
Build the install/permission flow (the adherence engine's delivery dependency — MASTER-PLAN §4.1):
- Make apps/web an installable PWA: manifest (org-branded icons generated from trainer logo with letter fallback), service worker (next-pwa or manual per current docs — verify via context7), offline shell for portal routes
- /welcome/notifications step after consent, platform-detected:
  - iOS Safari: illustrated Share → Add to Home Screen walkthrough with "installed?" detection (display-mode: standalone check on return visit); web push permission requested ONLY after standalone launch
  - Android/Chrome: beforeinstallprompt capture → custom install button → then Notification.requestPermission()
  - Desktop: straight to permission prompt
- Framing copy: "This is how {trainer name} reaches you" with preview of a sample coach notification
- Store push_subscriptions (id, client_id, endpoint, keys jsonb, platform, created_at, revoked_at); multiple devices per client allowed
- Fallback ladder recorded on client: notification_channel enum push|email_only — email_only clients get the P6 email digest; flow is skippable but marks channel accordingly and shows what they'll miss
- Event per outcome: push_enabled | push_skipped | pwa_installed

Playwright: permission-flow states mocked; manifest validity; standalone detection logic unit-tested. Commit: "feat(pwa): install + notification walkthrough with fallback ladder".
```

### 2.5 — Stage B conversational interview

```
Read docs/plan/ORIGINAL-SPEC.md §10 Stage B field list first. Load claude-api skill.

Build the conversational onboarding interview (runs in the client's thread UI — create the STUB messages table now: messages (id, org_id, client_id, sender enum client|coach|system|assistant, kind text, body text, payload jsonb, created_at) with RLS; P6.1 extends it with realtime, receipts, and the full kind enum — interview turns persist here so history carries into the real thread):
- interview_state (client_id, section enum logistics|goals|nutrition|training|lifestyle|health, answers jsonb, status, last_prompt_at)
- Interview agent (packages/ai, modelRouter 'draft', trainer voice profile injected): asks ONE question per message, conversational not form-like; parses free-text answers into typed intake fields (Zod per section); confirms parsed understanding ("Got it — 3 rotis is your usual lunch base?"); adaptive follow-ups (mentions shift work → asks schedule pattern)
- Pacing: sections spread across days 1-3 (logistics+goals day 1, nutrition+training day 2, lifestyle+health day 3); resumable anytime; 24h-idle gentle nudge (max 2)
- HEALTH FLAGS (hard rule): any mention of medical conditions, medications, pregnancy/nursing, injuries, eating-disorder signals → section pauses, flag written to clients.health_flags, review-queue item for trainer, interview says the coach will follow up personally. Fail-closed keyword+classifier gate (packages/ai/escalation.ts — build v1 now, P6 hardens it)
- Interview MUST capture (P3 depends on these): usual meal times + meals-per-day (nutrition section — drives reminder defaults), preferred weigh-in days (logistics — default Mon/Wed/Sat offered), timezone → profiles.timezone, preferred language
- Completion: intake jsonb assembled → event 'intake_complete' → auto-queue draft generation: CREATE the plan_requests table here (full schema — P4/P5 consume it): plan_requests (id, org_id, client_id, kind enum diet|split, trigger enum onboarding|monthly|manual, status enum queued|running|drafted|failed, created_at) and insert one 'diet' + one 'split' row (status=queued; they sit queued until P4/P5 pipelines exist)

Eval fixtures: 6 scripted personas (including one health-flag case, one hostile/joker case, one Hinglish speaker) — interview must produce complete valid intake JSON or correct flag. Commit: "feat(intake): conversational stage B interview".
Update PROGRESS.md: Phase 2 complete.
```

## ⑥ Definition of done → handoff

- [ ] Teaser → preview → signup → consent → install → interview complete, E2E Playwright green on mobile viewport
- [ ] Allergen property-tests: no allergen-matching food can appear in any preview (run across full taxonomy)
- [ ] Consent gate provably blocks all portal routes; evidence trail complete (hash+IP+UA+PDF)
- [ ] Push subscription stored for at least Chrome + iOS-standalone paths; email_only fallback recorded otherwise
- [ ] Stage B produces complete typed intake; health flags route to trainer 100% on fixture set; timezone captured
- [ ] Every funnel step emits events; stall conditions defined (consent 24h, interview 72h)
- **Handoff to Phase 3:** intake complete + timezone known + notification channel known = the ledger can start prompting. plan_requests queued for Phase 4/5.
