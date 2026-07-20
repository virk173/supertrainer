# Phase 2 deferred backstops — design

- **Date:** 2026-07-18
- **Branch:** `phase-2-backstops`
- **Status:** implemented (2026-07-18) — typecheck 4/4, lint clean, pgTAP 118, Playwright 57/57 non-AI green (3 live-AI tests credit-blocked only)
- **Source:** the deferred items recorded in `docs/plan/PROGRESS.md` line 95 after the Phase 2 multi-agent review.

## Context

Phase 2 shipped with three hardening items explicitly deferred:

1. **Per-org DoS sublimit + email-normalization** on the Stage A teaser rate limiter.
2. **Stall-condition wiring** — `isNudgeDue()` exists and is tested but nothing calls it.
3. **`plan_requests` partial-unique DB backstop** — `completeIntake` dedupes with a count-check that is not race-safe.

All three are safety/abuse backstops on already-shipped surfaces. This spec covers building all three now, delivery-agnostic where a later phase is a hard dependency.

## Scope decisions (approved)

- **Stall wiring:** build it **delivery-agnostic** now (detection + in-thread nudge + event + cron trigger). Push/email *delivery* of the nudge stays deferred (needs Phase 6 + VAPID keys).
- **DoS sublimit identity:** store a **keyed hash of the client IP**, never the raw address.
- **Phone idea (from discussion):** phone *verification* (SMS/OTP) and phone-uniqueness-at-conversion are **captured as a later-phase item, not built now** — an unverified phone is as forgeable as an email, adds signup friction, needs SMS infra + its own rate limits, and a hard per-phone unique would lock out family-shared numbers.

## Item 1 — Stage A rate-limiter hardening

**Problem.** `apps/web/app/c/[slug]/start/actions.ts` caps 3/email/week and 50/day/org, but (a) the weekly check matches the raw email string, so `u.s.e.r+1@gmail.com` / `+tags` / mixed case each read as a new person, and (b) the 50/day/org cap is a DoS weapon — one actor can fill it and block every real prospect. The client IP is computed for Turnstile but never stored, so a per-source sublimit has nothing to key on.

**Migration** (`supabase/migrations/<ts>_leads_ratelimit_hardening.sql`):
- Add `email_normalized text` to `leads`. Backfill existing rows **best-effort with `lower(btrim(email))`** — the table is effectively empty pre-launch, and going-forward correctness comes from the code path; we deliberately do **not** re-implement the Gmail dot/`+tag` algorithm in SQL (it would drift from the TS `normalizeEmail`). Add index `leads_org_id_email_normalized_created_at_idx (org_id, email_normalized, created_at)`; drop the now-unused `leads_org_id_email_created_at_idx`. (`email` stays the raw contact field for the magic link; `email_normalized` is a count-only key.)
- Add `ip_hash text` to `leads`. Add partial index `leads_org_id_ip_hash_created_at_idx (org_id, ip_hash, created_at) WHERE ip_hash IS NOT NULL`.
- RLS unchanged (staff still read their org; both columns are abuse-prevention metadata, and `ip_hash` is a non-reversible keyed digest, so no column restriction is required).

**Code** — new `apps/web/lib/onboarding/rate-limit.ts`, three pure helpers (mirrors the `turnstile.ts` / `nudge.ts` extract-the-decision pattern so they unit-test with no browser and no DB):
- `normalizeEmail(email): string` — lowercase + trim; strip everything from `+` in the local part (all providers); for `gmail.com`/`googlemail.com` also strip dots in the local part and canonicalize the domain to `gmail.com`.
- `hashIp(ip: string | null, secret: string | undefined): string | null` — `HMAC-SHA256(ip)` hex via Node `crypto`; returns `null` when `ip` or `secret` is absent (no-op convention).
- `rateLimitDecision({ emailCount, orgCount, ipCount }, limits): { ok: boolean; reason?: 'email' | 'ip' | 'org' }` — pure precedence over the three counts.

`submitLead` changes:
- Compute `emailNormalized = normalizeEmail(email)` and `ipHash = hashIp(ip, process.env.LEAD_IP_HASH_SECRET)`.
- Weekly check now filters `.eq("email_normalized", emailNormalized)`.
- **New per-IP/day sublimit** (`PER_IP_DAILY_LIMIT = 5`): only when `ipHash` is non-null, count same-`ip_hash` leads for the org in the last day; over the limit → friendly rejection. **Caveat:** shared IPs (gym wifi, corporate NAT, mobile CGNAT) can put several genuine prospects behind one `ip_hash`; 5 caps one source at ≤10% of the org's 50/day while keeping the false-positive risk low for a single coach's link. It is a clearly-named tunable so a coach running an in-person promo can be raised.
- Keep the 50/day/org cap (cost ceiling), now backstopped by the sublimit.
- Persist `email_normalized` and `ip_hash` on insert.

**Constants:** `WEEKLY_EMAIL_LIMIT = 3` (unchanged), `DAILY_ORG_LIMIT = 50` (unchanged), `PER_IP_DAILY_LIMIT = 5` (new).

**Env:** `LEAD_IP_HASH_SECRET` — documented in `.env.example`. Unset ⇒ `ip_hash` null ⇒ per-IP sublimit skipped (Turnstile + org cap still apply). Never `NEXT_PUBLIC_*`.

## Item 2 — stall-condition wiring (delivery-agnostic)

**Problem.** `apps/web/lib/interview/nudge.ts` exports the tested pure `isNudgeDue(lastPromptAt, nudgesSent, now)`, but no caller ever nudges a stalled interview. `interview_state` already carries `last_prompt_at`, `nudges_sent`, `status`.

**New module** `apps/web/lib/interview/stall.ts` (server-only):
- `runInterviewNudges(now = Date.now()): Promise<{ nudged: number }>`:
  1. Select `interview_state` rows with `status = 'in_progress'`, bounded (`limit 200`), ordered by `last_prompt_at` ascending. Read `client_id, org_id, answers, started_at, last_prompt_at, nudges_sent`.
  2. Filter in code, nudging a row **only when both hold**: (a) `isNudgeDue(last_prompt_at, nudges_sent, now)` **and** (b) a section is actually **open for the client** — `nextSection(answers, dayNumber(started_at)) !== null`. Guard (b) is essential: the interview is day-paced (sections unlock across days 1–3), so a client who finished today's sections is *correctly* idle while waiting for the next day to unlock (`waitingForNextDay`). Nudging then would poke someone the **system** is gating, not someone who is stalling. Only nudge when the ball is in the client's court. (`dayNumber` is lifted out of `engine.ts` into a shared `stage-b` helper so both use one definition.)
  3. For each due row, do a **lease update** — `update interview_state set nudges_sent = nudges_sent + 1, last_prompt_at = now where client_id = ? and status = 'in_progress' and last_prompt_at = <value read>`. If it affects 0 rows, another tick already claimed it → skip. This is the race guard against overlapping ticks and is done **before** posting so a double-fire can't double-nudge.
  4. On a claimed row, insert an in-thread `assistant` `kind='interview'` nudge message, fire `interview_nudge_sent`, and call `notifyClient(...)`.
- `notifyClient(...)` — the **Phase 6 seam**. Today: no-op that logs. Phase 6 attaches Web Push / email digest here. Documented as such inline.

**Cron route** `apps/web/app/api/cron/interview-nudges/route.ts`:
- `GET` (Vercel cron uses GET) guarded by `CRON_SECRET`: require `Authorization: Bearer <CRON_SECRET>`; 401 on missing/mismatch; if `CRON_SECRET` is unset, 503 (refuse to run unauthenticated). On success call `runInterviewNudges()` and return `{ nudged }`.
- Add to `vercel.json` `crons` (hourly). Add `/api/cron/*` to the middleware public-path allowlist (service-role + secret-guarded; no user session).

**Env:** `CRON_SECRET` — documented in `.env.example`.

**Safety.** Lease update makes it idempotent under concurrency and re-entrant across ticks; `MAX_NUDGES = 2` (existing) caps total nudges; `paused_health` / `complete` interviews are excluded by the `status = 'in_progress'` filter.

## Item 3 — `plan_requests` uniqueness backstop

**Problem.** `completeIntake` (`apps/web/lib/interview/engine.ts`) guards duplicate onboarding plan requests with a `count === 0` check, then inserts a `diet` + `split` pair. Two concurrent finalizes can both read count 0 → 4 rows.

**Migration** (`supabase/migrations/<ts>_plan_requests_onboarding_unique.sql`):
- Defensive dedupe first: delete duplicate `trigger='onboarding'` rows per `(client_id, kind)`, keeping the earliest `created_at`.
- `create unique index plan_requests_onboarding_unique on public.plan_requests (client_id, kind) where trigger = 'onboarding';` — guarantees ≤1 onboarding diet and ≤1 onboarding split per client. `monthly` / `manual` triggers are unaffected (partial predicate).

**Code** (`completeIntake`):
- Keep the count-check fast path. Wrap the insert; on a Postgres unique-violation (`code === '23505'`) treat it as "already queued by a concurrent finalize" — swallow, and **do not re-fire** `intake_complete` (the winner fired it once). Any other error still surfaces.

## Cross-cutting

- **Types:** regenerate `packages/db/src/types.ts` after both migrations (`npx supabase gen types typescript --local`), since `leads` gains two columns.
- **Testing** (no new runner — Node-level Playwright specs that import pure helpers, per the existing `turnstile.spec.ts` pattern, plus DB/HTTP e2e):
  - Unit: `normalizeEmail` (gmail dots/+tags/case, googlemail, non-gmail +tag, idempotence), `hashIp` (stable, differs by IP, null when secret/ip absent), `rateLimitDecision` (precedence + limits).
  - pgTAP: the partial unique index rejects a 2nd `(client, diet, onboarding)` (`throws_ok`, expecting the unique-violation) and **allows** a `(client, diet, monthly)`.
  - e2e: email-normalization path (submit `WEEKLY_EMAIL_LIMIT` = 3 same-normalizing Gmail variants — dots/`+tags` — all succeed, then the next variant is blocked, proving they share one quota); cron route (seeded 25h-stalled `in_progress` interview **with an open section** → `nudged: 1` + a new nudge message + `nudges_sent` bumped; a between-days `waitingForNextDay` interview idle >24h → **not** nudged; immediate re-run → not due; 401 without the secret).
- **Verification gates (must stay green):** `npm run typecheck` (4/4), `npm run lint`, `npx supabase test db` (pgTAP), `npm run test` (Playwright). Update `docs/plan/PROGRESS.md` when done.

## Explicitly still deferred (captured, not built here)

- **Nudge delivery** (Web Push / email digest) + push-storage e2e — Phase 6 + VAPID keys. The `notifyClient()` seam is where it lands.
- **Phone verification (SMS/OTP)** as a strong signup gate, and **phone-uniqueness-at-conversion** — a later phase; low value until the phone is verified, and needs SMS infra with its own abuse controls.
- The few sub-millisecond duplicate-query micro-opts noted in the Phase 2 review.
