# PHASE 8 — Payments & Subscriptions (Stripe Connect)

**Ships:** trainer payouts via Stripe Connect Express, tier subscriptions with checkout at the teaser-unlock moment, proration on tier changes, the dunning ladder ("the system paused your plan" — trainer never chases money), pause/vacation states, platform fees, taxes, and Cal.com scheduling for video-call tiers.
**Depends on:** P1 (tiers), P2 (teaser conversion point), P6 (payment nudges channel), P7 (flags/MRR surfaces).
**Feeds:** P9 (platform revenue analytics), P7 (real billing data lights up stubs).

**Why last-but-one:** beta trainers ran real clients free through P0–P7 validation; money rails land on a proven product (resolves spec §13 vs §9 contradiction — G20).

---

## ① Learn first (~60 min — do not skip; money bugs are trust bugs)

| Topic | Why | Where |
|---|---|---|
| Stripe Connect account types + destination charges | Platform architecture decision: Express accounts + destination charges w/ application_fee is our shape | docs.stripe.com/connect (via Stripe MCP once installed) |
| Stripe Billing webhooks lifecycle (invoice.paid, payment_failed, subscription.updated) | The dunning ladder is webhook-driven state machine | docs.stripe.com/billing |
| Stripe Tax on Connect | Who owes tax (trainer, mostly) and what the platform must facilitate | docs.stripe.com/tax |
| Idempotency + webhook replay safety | Double-processing a payment event = corrupted billing state | 20-min read |

## ② Claude setup for this phase

```
/plugin install stripe@claude-plugins-official          # Stripe MCP: API tools + docs search
```
- Skills: `feature-dev`, `superpowers:test-driven-development` (webhook state machine), `security-review` on EVERYTHING here before merge.
- **Uninterruptable config:** PreToolUse deny-hook: block any Bash containing `stripe` CLI with live-mode keys (test mode only in dev); allow-list `Bash(stripe listen *)`, `Bash(stripe trigger *)` for webhook testing. Ralph-loop the webhook state machine with promise "all 25 lifecycle fixtures pass incl. replay/out-of-order delivery".
- Worktree `phase-8`.

## ③ GitHub repos for this phase

- [stripe/stripe-demo-connect-kavholm-marketplace](https://github.com/stripe/stripe-demo-connect-kavholm-marketplace) — official Connect Express marketplace shape (archived but canonical pattern; verify current API via Stripe MCP)
- [stripe-samples/subscription-use-cases](https://github.com/stripe-samples/subscription-use-cases) — official subscription billing samples (MIT)
- [KolbySisk/next-supabase-stripe-starter](https://github.com/KolbySisk/next-supabase-stripe-starter) — Next.js+Supabase+Stripe wiring reference (MIT)
- [calcom/cal.com](https://github.com/calcom/cal.com) — scheduling embed for video-call tiers (AGPL — use their hosted/embed, don't fork)

## ④ Pipeline map

```
P1 tiers ──8.1 sync──▶ Stripe Products/Prices (per connected account)
P2 teaser unlock / P1 invite accept ──▶ 8.2 checkout (destination charge + application fee)
      ▼
subscriptions table ⟷ 8.3 webhook state machine (idempotent, replay-safe)
      ├─ active → portal full access
      ├─ past_due → 8.4 dunning ladder: retry smart → client nudge (P6, "system" voice)
      │     → grace 7d → AI-layer pause + portal restricted banner → trainer flag (P7) — trainer
      │     never personally chases (spec §9)
      ├─ paused (vacation) → expectations off (P3), reminders off, billing paused
      └─ canceled → churn flow: exit survey card, data retained per retention policy (P9 export)
tier change ──▶ proration preview → confirm → Stripe update → features flip at boundary
platform fee: base SaaS sub (platform-level Stripe) + 2.5% application fee on client payments
8.5 Cal.com embed for tiers with video calls; payouts dashboard panel (P7 analytics wiring)
8.6 beta cutover: approved_manually clients → real subscriptions; beta trainers → platform sub (founder grace)
```

## ⑤ Sub-phases — copy-paste prompts

### 8.1 — Connect onboarding + tier sync

```
Use the Stripe MCP to verify EVERY API shape against current docs before writing code (Connect APIs move). Read CLAUDE.md and docs/plan/PHASE-8-payments.md §④.

Build Connect foundation:
- orgs get stripe_account_id; /trainer/settings/payments: Connect Express onboarding (account link flow, return/refresh URLs), status panel (requirements due, charges/payouts enabled), re-onboarding for incomplete accounts
- Deferred-allowed (P1 decision): trainers can operate free-mode until first paid client; attempting to enable paid tiers without completed Connect → guided blocker
- Tier sync worker: tiers (P1) ⟷ Stripe Products+Prices on the connected account; price changes create new Price (never mutate), old subscriptions keep legacy price until tier-change; sync is idempotent + drift-detecting (nightly reconcile job logs mismatches)
- Currency: from org settings, locked once first product created (document why in UI)
- Platform base fee: platform-level Stripe subscription for the trainer (client-count tiers per business rule §11 — seats: ≤20/≤50/≤100/unlimited), 14-day trial, card required at trial end. is_demo clients excluded from counts (P1)
- Trainer activation checklist (P1.1): migration adds 'payments' to the org_onboarding_state step enum + a checklist card (Connect status-aware) so the master funnel step 7 (MASTER-PLAN §5.1) is visible in the UI

Test-mode E2E: onboard test account, sync tiers, verify Products in Stripe test dashboard. Commit: "feat(payments): connect onboarding + tier sync".
```

### 8.2 — Client checkout + subscription creation

```
Build the client payment moment (this replaces P2's "trainer marks paid manually" stopgap — remove it behind a flag):
- Teaser unlock + invite-accept paths converge on /pay/[tier_id]: branded checkout — Stripe Checkout Session (destination charge to trainer's account, application_fee_percent 2.5, automatic_tax enabled, customer created on connected account)
- Success → webhook (NOT redirect) creates subscriptions row (id, org_id, client_id, tier_id, stripe_subscription_id, status, current_period_end, pause_state) → client status active → P2 flow continues (consent etc. if not done)
- Upgrades/downgrades: /portal/membership → tier cards (P1 component) → proration preview (Stripe preview invoice rendered clearly: "you'll be charged $X today, next renewal $Y") → confirm → immediate feature flip on upgrade, at-period-end on downgrade (standard expectation)
- Payment methods: card update flow (Billing portal session, branded return)
- Receipts: Stripe emails ON (trainer-branded via Connect settings) + in-app payment history (/portal/membership)

Test-mode E2E with Stripe test clocks: subscribe → renew → upgrade mid-cycle → verify proration math rendered = Stripe's math. Commit: "feat(payments): checkout + subscription lifecycle".
```

### 8.3 — Webhook state machine (TDD)

```
TDD — fixtures FIRST (superpowers:test-driven-development). This is the money-correctness core.

Build /api/webhooks/stripe:
- Signature verification; webhook_events table (stripe_event_id UNIQUE — idempotency by insert-or-skip, processed_at, payload) — replay-safe by construction
- State machine (pure function transition(currentState, event) → newState + effects[], exhaustively tested): handles checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated/deleted/paused/resumed, account.updated (Connect status), charge.dispute.created (flag to trainer + platform admin)
- Out-of-order safety: events carry created timestamps; stale events (older than current state's last_event_at) are logged + skipped
- Effects executed transactionally with state write: subscription row updates, client status flips, P6 notifications queued, P7 flag rows, audit_log entries
- 25-fixture suite: happy renewals, fail→recover, fail→dunning→cancel, replay attacks, out-of-order pairs, dispute, Connect deauthorization
- Local dev: stripe listen forwarding documented in README

Commit: "feat(payments): idempotent webhook state machine".
```

### 8.4 — Dunning ladder + pause states

```
Build the "system chases, never the trainer" flow (spec §9):
- Dunning config (org-level, sane defaults): Stripe Smart Retries ON (4 attempts/7 days) + our ladder on payment_failed: day 0 — client in-app card + push ("payment didn't go through — update card", system voice, one-tap to update flow); day 3 — second nudge + email; day 7 — AI-layer + plan access paused: portal shows respectful restricted state (history visible, plans locked, "update payment to resume"), reminders stop (P3 expectations off), trainer gets flag (P7 queue) with one-click "extend grace 7d" override
- Recovery: payment succeeds → everything reactivates instantly + welcome-back card; ledger marks the gap as not-expected (never "missed" — fairness rule, test it)
- Vacation/pause (client-requested via trainer approval, or trainer-initiated): Stripe subscription pause (or trial-extension technique if pause unsupported on plan — verify via Stripe MCP) + P3 expectations off + resume date; max duration org-set
- Cancellation: client requests → trainer notified (retention moment: AI drafts a save-offer option privately) → confirm → end-of-period access → exit survey card (P6) → churn event (P9 analytics)

Fixtures: full dunning timeline with test clocks, gap-fairness in ledger, pause/resume expectation flips. Commit: "feat(payments): dunning ladder + pause states".
```

### 8.5 — Video-call tiers + payout visibility

```
Close the tier-feature loop:
- Cal.com integration for tiers with video_calls_per_month > 0: trainer connects their Cal.com (or platform-provisioned managed user — evaluate current Cal.com platform API via context7; simplest reliable path wins), monthly call credits tracked (call_credits table decremented on booking webhook), client booking embed in /portal/membership + thread card ("book your monthly call"), credit-exhausted state clear
- Payout visibility (P7 analytics wiring): MRR real (active subscriptions × prices), revenue by tier, next payout date + amount (Stripe balance API), fees breakdown (Stripe fee + platform fee shown honestly), payout history table
- Failed-payment + renewal flags in P7 queue/inbox now live data
- Financial statements: monthly CSV export per org (revenue, fees, payouts) — accountant-friendly

E2E: book call → credit decrements; MRR matches Stripe dashboard test data. Commit: "feat(payments): call scheduling + payout visibility".
```

### 8.6 — Beta cutover: migrate pre-payments clients & trainers

```
Every client onboarded during P2–P7 is active via the manual-approve stopgap (approved_manually=true, no subscriptions row) and every beta trainer has been running free. Migrate them without breaking anyone:

- Client cutover: per org, a guided cutover screen — list of approved_manually actives with their assigned tier → trainer confirms tier per client → each client gets a "set up your membership" thread card (P6, system voice) + portal banner → card-capture checkout (8.2 flow, subscription start date = next natural renewal or immediate, trainer chooses) → on success: approved_manually=false, subscriptions row live
- Grace policy: clients keep FULL access during a trainer-set capture window (default 21 days); after window, uncaptured clients enter the 8.4 dunning restricted state (never hard-cut mid-month); ledger gap-fairness rule applies (uncaptured window ≠ missed days)
- Trainer platform-sub enrollment: existing orgs get the base-fee subscription with a founder grace (60-day trial + founder pricing flag honored for life — the beta-loyalty gesture, feature-flagged from P9.3 when it ships, env-flag until then); new orgs post-launch get standard 14-day trial
- Stopgap retirement: manual-approve action now feature-flagged OFF for orgs with Connect enabled; kill entirely once all orgs migrated (tracked in admin)
- Migration dashboard: per-org cutover progress (captured/pending/expired) visible to trainer + platform admin

Fixtures: cutover states, grace expiry → dunning handoff, founder-flag billing. Commit: "feat(payments): beta cutover migration".
Update PROGRESS.md: Phase 8 complete.
```

## ⑥ Definition of done → handoff

- [ ] Full money loop in test mode: teaser → checkout → renewal → upgrade → fail → dunning → pause → recover → cancel, all green with test clocks
- [ ] Webhook machine replay/out-of-order proven; every money mutation audited (audit_log)
- [ ] Trainer never chases: all dunning comms system-voiced, verified in fixtures; grace-extension works
- [ ] Platform fees collected (application fee + base sub); is_demo excluded everywhere; /security-review clean on all payment routes
- [ ] P7 stubs all live: MRR, flags, renewals calendar
- [ ] Beta cutover complete: zero approved_manually actives remain (or all within grace window); manual-approve stopgap retired for Connect-enabled orgs
- **Handoff to Phase 9:** money flows; now harden, instrument the platform business, ship wearables + export + admin, and launch.
