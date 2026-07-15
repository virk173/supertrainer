# PHASE 9 — Launch: Export, Wearables, Admin, Referrals & Hardening

**Ships:** the one-click data export trust promise, Expo mobile shell with HealthKit/Health Connect, platform admin + business metrics, trainer referral engine, marketing site, load/security hardening, and the anchor-coach launch runbook.
**Depends on:** everything (P0–P8).
**Feeds:** the business.

---

## ① Learn first (~60 min)

| Topic | Why | Where |
|---|---|---|
| Expo EAS build + submit pipeline | v1.5 mobile shell ships from here; also white-label v2 groundwork | docs.expo.dev/eas |
| HealthKit + Health Connect permission models | Background-read rules differ wildly iOS vs Android; sync design depends on them | react-native-health / react-native-health-connect READMEs |
| PIPEDA + US state privacy basics (deletion/export rights) | You're storing health-adjacent data for Canadians/Americans; export+delete must be real | 30-min primer, then lawyer |
| Vercel/Supabase production hardening checklists | Launch week is the wrong time to discover connection limits | both platforms' production docs |

## ② Claude setup for this phase

- Skills: `security-review` (full-app pass), `vercel:deploy` + `vercel:vercel-firewall` (hardening), `feature-dev`, `deep-research` (competitive pricing final check before launch), `mcp-builder` only if building the admin as internal MCP tools (optional).
- **Uninterruptable config:** the load-test + hardening loop runs as ralph-loop with promise "k6 suite passes SLOs at 100 orgs × 50 clients synthetic load". Add chrome-devtools-mcp plugin for perf traces if Lighthouse regressions appear.
- Worktree `phase-9`.

## ③ GitHub repos for this phase

- [expo/expo](https://github.com/expo/expo) — mobile shell + expo-notifications (MIT)
- [kingstinct/react-native-healthkit](https://github.com/kingstinct/react-native-healthkit) — TS-first HealthKit (MIT)
- [matinzd/react-native-health-connect](https://github.com/matinzd/react-native-health-connect) — Health Connect (MIT)
- [the-momentum/open-wearables](https://github.com/the-momentum/open-wearables) — self-hosted Terra alternative if Garmin/Oura/Whoop demand appears (MIT — evaluate, don't pre-build)
- [grafana/k6](https://github.com/grafana/k6) — load testing (AGPL tool — fine, it's a tool not a dependency)
- [documenso/documenso](https://github.com/documenso/documenso) — if consent needs upgrade to full e-sign at launch per lawyer

## ④ Pipeline map

```
9.1 data export/delete (trust promise §11) ─▶ marketing claim becomes real
9.2 Expo shell + wearables ─▶ wearable_daily (created P3.3, manual-fed until now) fills automatically ─▶ monthly adjustments get real activity data
9.3 platform admin + metrics ─▶ AI budget meters (MASTER-PLAN §4.3), org health, support tools
9.4 referral engine ─▶ growth loop
9.5 marketing site + docs ─▶ teaser links get a home; SEO for "trainerize alternative"
9.6 hardening: load, security, backups, runbooks ─▶ launch gate
9.7 anchor-coach launch runbook ─▶ GTM execution (spec §14)
```

## ⑤ Sub-phases — copy-paste prompts

### 9.1 — One-click data export + deletion rights

```
Read docs/plan/ORIGINAL-SPEC.md §11 rule 2 (the trust promise) and CLAUDE.md.

Build data portability:
- Trainer export (/trainer/settings/data): one click → background job (pgmq) assembles per-org archive: clients.csv, plans (PDFs + JSON), full ledger CSVs (meals/weights/workouts/scores), message history per client (JSON + readable HTML), photos (originals), consents (PDFs), invoices → zip to Storage → signed URL (24h) → email + in-app when ready; progress UI; monthly auto-export option (to their email)
- Per-client export: same shape, single client (client can request via portal too — their PIPEDA right)
- Deletion: client account deletion request → 30-day soft-delete grace (trainer notified) → hard delete job (rows + Storage objects; audit_log keeps anonymized tombstone); org deletion → full org purge with 30-day grace + final export forced first
- Format documentation page (public): "your data is always yours" — schema docs for the export so switching AWAY is provably possible (the trust flex)
- Tests: export completeness (fixture org → assert every table represented), deletion leaves zero orphans (FK sweep + storage listing)

Commit: "feat(data): one-click export + deletion rights".
```

### 9.2 — Expo shell + wearable sync (v1.5)

```
Build the mobile shell in apps/mobile (Expo, TypeScript):
- Expo Router app: auth (Supabase session share via deep link or re-login), then a WebView wrapper of the portal PWA for most surfaces BUT native screens for: push registration (expo-notifications → push_subscriptions with platform=ios_native|android_native — P6 sender gains FCM/APNs path via Expo push service), health sync, camera (meal photos direct to P3 pipeline)
- HealthKit (kingstinct/react-native-healthkit): steps, sleep, active energy, workouts — daily background delivery where allowed + on-app-open sync; migration first: extend wearable_daily (created P3.3 with steps/sleep_min only) with active_kcal int nullable + workouts jsonb nullable; source=healthkit rows supersede manual entries for the same tz_date
- Health Connect (matinzd/react-native-health-connect): same metrics, Android
- Permission UX: value-framed ask ("your coach adjusts your plan using real activity"), granular toggles, sync status visible, disconnect = data stops (existing rows retained, disclosed)
- P4 adjustment context now reads real wearable_daily; the "avg steps fell 32%" reasoning fixture goes live
- EAS: build profiles (dev/preview/prod), submit config; store listings checklist (screenshots via Expo tooling)

Test: synthetic HealthKit data on simulator flows through to a monthly adjustment draft. Commit: "feat(mobile): expo shell + wearable sync".
```

### 9.3 — Platform admin + business metrics

```
Build /admin (platform-owner only — separate role, hardware-key-gated auth [WebAuthn], NOT in trainer nav):
- Org health table: orgs, client counts, MRR contribution, AI spend (Langfuse cost rollups per org — the §4.3 budget meter), zero-edit rate, delivery health (push success), last-active; sortable, drill-in per org
- AI budget alerts: org crossing soft threshold → flag + optional throttle policy (batch-only mode for non-urgent AI) — protect margins without breaking product
- Support tools: impersonate-view (READ-ONLY org view, heavily audited, banner visible), resend invites, replay failed webhooks (P8 events), regenerate exports
- Platform metrics dashboard: MRR/ARR, org growth, activation funnel (P1 checklist completion rates), client-onboarding funnel (P2 events), feature usage, churn cohorts, unit economics per org (revenue − AI cost − infra estimate)
- Feature flags table + simple SDK (flag(org_id, key)) — gradual rollouts from here on
- Incident tooling: status banner CMS (portal+dashboard), maintenance mode switch

Commit: "feat(admin): platform admin + business metrics".
```

### 9.4 — Referral engine

```
Build growth loops (MASTER-PLAN feature 8):
- Migration first: add 'referral' to the clients.source enum (P0 defined teaser|invite|import)
- Trainer→trainer: unique referral link (/r/{code}) → referred trainer signs up → both get credit (1 month free at referrer's current platform tier; referred gets extended trial) applied via platform Stripe coupons; referral status page (invited/activated/credited); anti-abuse: credit only after referred org reaches activated (P1 definition) + first paid client
- Client→friend (trainer-controlled, default off): trainer enables → clients get "bring a friend" card (P6) → friend gets teaser link pre-attributed → converts as normal lead; trainer sees source=referral in roster
- Attribution: events-table based, survives signup flow; leaderboard-free (no gamification cringe — quiet credits)

Tests: credit timing rules, abuse guards (self-referral, circular). Commit: "feat(growth): referral engine".
```

### 9.5 — Marketing site + public docs

```
Load frontend-design skill (marketing register — Aceternity/Magic UI acceptable HERE, in-app never).

Build the public site (apps/web marketing routes or apps/marketing):
- Landing: the wedge message ("An AI that coaches like YOU — not instead of you"), trainer-outcome hero (roster capacity math), feature tour anchored on the three pillars (style-learning, drafted replies, adherence forensics), all-inclusive pricing table (client-count tiers, "everything included" vs incumbent add-on-stack comparison table — factual, dated), data-export trust promise section linking 9.1 schema docs, demo video placeholder, waitlist/signup CTA
- /pricing, /switch (the Trainerize/Everfit switcher page: import wizard screenshots, export honesty, migration concierge offer), /security (data handling, AI transparency policy — the §12 rules published), /legal/* (ToS, privacy — lawyer-reviewed placeholders clearly marked)
- SEO: comparison pages ("X alternative"), coaching-workflow content stubs; OG images; sitemap
- Custom domains (closes spec §11 "or own domain"): trainer settings gains "connect your domain" — Vercel Domains API (add domain to project, show DNS instructions, verify, route to org like the subdomain middleware from P1.2); document limits
- Performance: static where possible, Lighthouse ≥95

Commit: "feat(marketing): public site".
```

### 9.6 — Hardening + launch gate

```
The final gate before real users. Run each as its own session/loop:

1. Load: k6 scripts — synthetic 100 orgs × 50 clients: morning digest fan-out, reminder burst (5k notifications in 15min window), realtime message storm, queue approvals; SLOs: p95 API <400ms, realtime delivery <2s, zero dropped webhooks; fix what breaks (likely: connection pooling — pgBouncer config, batch windows)
2. Security: /security-review full-app; anthropics/claude-code-security-review as CI action; manual pass on: RLS (attempt cross-org access via API with real JWTs — scripted), Storage bucket policies, webhook signatures, rate limits on ALL public endpoints (teaser, join, webhooks), secrets audit (nothing in client bundles — scan), dependency audit
3. Backups/DR: Supabase PITR verified by actual restore drill to staging; Storage replication check; runbook: "DB restore", "Stripe webhook outage replay", "push provider down" (documented, tested once)
4. Legal: lawyer review checklist assembled (consent doc, ToS, privacy, AI disclosure) — BLOCKING for real-client launch
5. Observability SLOs: Sentry alert rules (error spike, webhook failures), PostHog launch dashboards, Langfuse cost alerts, uptime monitor on portal+dashboard+teaser
6. Beta gate checklist doc: every phase's DoD re-verified on production against demo org + one real friendly-trainer org

Commit: "chore(launch): hardening gate". Update PROGRESS.md: Phase 9 complete.
```

### 9.7 — Anchor-coach launch runbook (not code — execution doc)

```
Write LAUNCH-RUNBOOK.md in docs/plan/ (read docs/plan/ORIGINAL-SPEC.md §3 note + §14 GTM first):
- Anchor coach acquisition: target profile (100+ clients, influencer, currently on incumbent), pitch deck outline (their AI twin demo on THEIR real plans — use P1 ingestion live in the meeting), deal structure options (rev-share %, exclusivity window, case-study rights) with negotiation bounds
- White-glove onboarding plan: you personally run their P1 import + style ingestion; success criteria = their zero-edit rate >60% by week 4
- Beta cohort: 5 switcher coaches from waitlist (P9.5), weekly feedback loop, pricing validation script
- Launch sequence: anchor case study → switcher campaign (/switch page + import concierge) → public
- Re-score the spec's validation scorecard (§3) with real data after 30 days — decision gate for doubling down
```

## ⑥ Definition of done → launch

- [ ] Export promise real and documented publicly; deletion rights work end-to-end
- [ ] Mobile shell in TestFlight/internal track; wearable data flowing into monthly adjustments
- [ ] Admin can support, meter AI spend, flag-gate features; platform metrics live
- [ ] Load/security/backup gates passed; lawyer checklist assembled
- [ ] Marketing site live; referral loops tested
- [ ] LAUNCH-RUNBOOK.md ready; anchor-coach demo flow rehearsed on demo org
