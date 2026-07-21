# Phase 2 Deferred Backstops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three Phase 2 hardening backstops — Stage A rate-limiter (email-normalization + hashed-IP per-source sublimit), delivery-agnostic interview stall-nudge wiring, and a `plan_requests` partial-unique DB backstop.

**Architecture:** Additive migrations + pure, unit-tested helpers wired into existing server actions/engines, plus one new cron route. No table creation, no RLS-policy changes. Follows the repo's "extract the pure decision, unit-test it node-level in a Playwright spec" pattern (see `apps/web/lib/onboarding/turnstile.ts` + `apps/web/tests/e2e/turnstile.spec.ts`).

**Tech Stack:** Next.js 15 App Router (server actions + route handlers), Supabase (Postgres 16, service-role client), Playwright (e2e + node-level unit), pgTAP (DB tests), Node `crypto`.

**Spec:** `docs/superpowers/specs/2026-07-18-phase2-deferred-backstops-design.md`

## Global Constraints

- All DB access is via the service-role client from `@/lib/supabase/server` (`createServiceClient`) — do not construct raw Supabase clients elsewhere.
- Every migration must re-apply cleanly under `npx supabase db reset`; regenerate `packages/db/src/types.ts` after any schema change via `npx supabase gen types typescript --local > packages/db/src/types.ts`.
- DB changes ship with a pgTAP test in `supabase/tests/`. Repo idioms: `throws_ok(sql, '<SQLSTATE>', NULL, desc)`, `throws_like(sql, '%pattern%', desc)`, `has_column('public','<table>','<col>', desc)`, `lives_ok(sql, desc)`.
- Integrations no-op without keys, **except** a public background-trigger endpoint, which fails **closed** (no secret ⇒ refuse).
- Secrets are never `NEXT_PUBLIC_*`; document every env var in `.env.example`.
- Gates that must stay green: `npm run typecheck` (4/4), `npm run lint`, `npx supabase test db` (currently 113 pgTAP), `npm run test` (currently 53 Playwright).
- Commit after each task.

---

### Task 1: `leads` rate-limit schema (columns + indexes + backfill)

**Files:**
- Create: `supabase/migrations/20260718120000_leads_ratelimit_hardening.sql`
- Modify: `supabase/tests/rls_leads_test.sql` (plan count 7 → 9, add two `has_column` assertions)
- Modify: `packages/db/src/types.ts` (regenerated)

**Interfaces:**
- Produces: `leads.email_normalized text` (nullable, count-only key), `leads.ip_hash text` (nullable), indexes `leads_org_id_email_normalized_created_at_idx` and partial `leads_org_id_ip_hash_created_at_idx`.

- [ ] **Step 1: Write the failing pgTAP assertions**

In `supabase/tests/rls_leads_test.sql`, change `select plan(7);` to `select plan(9);` and immediately after that `plan(9);` line insert:

```sql
-- Phase 2 backstop columns (rate-limit hardening).
select has_column('public', 'leads', 'email_normalized', 'leads has email_normalized');
select has_column('public', 'leads', 'ip_hash', 'leads has ip_hash');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase db reset >/dev/null && npx supabase test db 2>&1 | grep -A2 rls_leads`
Expected: FAIL — `email_normalized`/`ip_hash` columns don't exist yet (and plan count mismatch).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260718120000_leads_ratelimit_hardening.sql`:

```sql
-- Phase 2 backstop: harden the Stage A teaser rate limiter.
--   * email_normalized — a count-only key that collapses case / "+tag" /
--     Gmail-dot variants so one prospect can't look like many. The raw `email`
--     stays the contact address; the app computes email_normalized on insert
--     (apps/web/lib/onboarding/rate-limit.ts). Existing rows get a best-effort
--     lower(btrim()) backfill — we deliberately do NOT re-implement the Gmail
--     dot/+tag algorithm in SQL (it would drift from the TS one), and the table
--     is effectively empty pre-launch.
--   * ip_hash — a non-reversible HMAC of the client IP (never the raw address),
--     powering a per-source/day sublimit so one actor can't consume the org's
--     whole daily quota. Null when unconfigured (no secret) or no client IP.

alter table public.leads
  add column email_normalized text,
  add column ip_hash text;

update public.leads
  set email_normalized = lower(btrim(email))
  where email_normalized is null;

-- The weekly per-email limit now slides on the normalized key.
drop index if exists public.leads_org_id_email_created_at_idx;

create index leads_org_id_email_normalized_created_at_idx
  on public.leads (org_id, email_normalized, created_at);

-- The per-source/day sublimit slides on ip_hash (only rows that have one).
create index leads_org_id_ip_hash_created_at_idx
  on public.leads (org_id, ip_hash, created_at)
  where ip_hash is not null;
```

- [ ] **Step 4: Apply + regenerate types**

Run: `npx supabase db reset >/dev/null && npx supabase gen types typescript --local > packages/db/src/types.ts`
Expected: reset succeeds; `git diff --stat packages/db/src/types.ts` shows the two new `leads` columns.

- [ ] **Step 5: Run pgTAP + typecheck to verify pass**

Run: `npx supabase test db 2>&1 | tail -5 && npm run typecheck`
Expected: pgTAP total now 115, all pass; typecheck 4/4.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260718120000_leads_ratelimit_hardening.sql supabase/tests/rls_leads_test.sql packages/db/src/types.ts
git commit -m "feat(leads): email_normalized + ip_hash columns for rate-limit hardening"
```

---

### Task 2: Pure rate-limit helpers

**Files:**
- Create: `apps/web/lib/onboarding/rate-limit.ts`
- Test: `apps/web/tests/e2e/rate-limit.spec.ts`

**Interfaces:**
- Produces:
  - `normalizeEmail(email: string): string`
  - `hashIp(ip: string | null | undefined, secret: string | undefined): string | null`
  - `rateLimitDecision(counts: RateLimitCounts, limits: RateLimits): { ok: boolean; reason?: RateLimitReason }`
  - types `RateLimitCounts { emailCount: number; orgCount: number; ipCount: number | null }`, `RateLimits { weeklyEmail: number; dailyOrg: number; dailyIp: number }`, `RateLimitReason = 'email' | 'ip' | 'org'`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/e2e/rate-limit.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import {
  hashIp,
  normalizeEmail,
  rateLimitDecision,
} from "../../lib/onboarding/rate-limit";

// Node-level coverage of the teaser limiter's pure decision logic (no browser,
// no DB) — mirrors turnstile.spec.ts.

test("normalizeEmail collapses case, +tags, and Gmail dots", () => {
  expect(normalizeEmail("  User@Example.com ")).toBe("user@example.com");
  // +tag stripped for all providers.
  expect(normalizeEmail("alice+promo@example.com")).toBe("alice@example.com");
  // Gmail: dots insignificant, googlemail == gmail, +tag stripped.
  expect(normalizeEmail("f.i.r.s.t.last+x@gmail.com")).toBe("firstlast@gmail.com");
  expect(normalizeEmail("First.Last@googlemail.com")).toBe("firstlast@gmail.com");
  // Non-Gmail dots are significant — must be preserved.
  expect(normalizeEmail("first.last@outlook.com")).toBe("first.last@outlook.com");
  // Idempotent.
  expect(normalizeEmail(normalizeEmail("A.B+c@GMAIL.com"))).toBe("ab@gmail.com");
});

test("hashIp is a stable non-reversible key, null when unusable", () => {
  expect(hashIp("1.2.3.4", "secret")).toBe(hashIp("1.2.3.4", "secret"));
  expect(hashIp("1.2.3.4", "secret")).not.toBe(hashIp("1.2.3.5", "secret"));
  // Not the raw IP.
  expect(hashIp("1.2.3.4", "secret")).not.toContain("1.2.3.4");
  // No IP or no secret → skip (null).
  expect(hashIp(null, "secret")).toBeNull();
  expect(hashIp("1.2.3.4", undefined)).toBeNull();
});

test("rateLimitDecision applies email → ip → org precedence", () => {
  const limits = { weeklyEmail: 3, dailyOrg: 50, dailyIp: 5 };
  expect(rateLimitDecision({ emailCount: 0, orgCount: 0, ipCount: 0 }, limits)).toEqual({ ok: true });
  expect(rateLimitDecision({ emailCount: 3, orgCount: 0, ipCount: 0 }, limits)).toEqual({ ok: false, reason: "email" });
  expect(rateLimitDecision({ emailCount: 0, orgCount: 0, ipCount: 5 }, limits)).toEqual({ ok: false, reason: "ip" });
  expect(rateLimitDecision({ emailCount: 0, orgCount: 50, ipCount: 0 }, limits)).toEqual({ ok: false, reason: "org" });
  // ipCount null → the per-IP sublimit is skipped.
  expect(rateLimitDecision({ emailCount: 0, orgCount: 0, ipCount: null }, limits)).toEqual({ ok: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx playwright test tests/e2e/rate-limit.spec.ts`
Expected: FAIL — cannot resolve `../../lib/onboarding/rate-limit`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/onboarding/rate-limit.ts`:

```ts
import { createHmac } from "node:crypto";

// Pure helpers for the Stage A teaser limiter (Phase 2 backstop). No DB/server
// imports, so the funnel e2e unit-tests every branch node-level (like
// turnstile.ts).

// Collapse the cosmetic variations that let one prospect look like many: case,
// surrounding space, "+tag" subaddressing (all providers), and — for Gmail
// only — dots in the local part (Gmail ignores them; other providers do not).
// Used ONLY as a rate-limit count key; the raw address is still stored and used
// for contact.
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at === -1) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus !== -1) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

// Non-reversible per-source key for the DoS sublimit. HMAC (not a bare hash) so
// the stored value can't be brute-forced back to an IP without the server
// secret. Returns null when we can't/shouldn't key on IP (no client IP, or no
// secret) — the caller then skips the per-IP sublimit ("no-op without keys").
export function hashIp(
  ip: string | null | undefined,
  secret: string | undefined,
): string | null {
  if (!ip || !secret) return null;
  return createHmac("sha256", secret).update(ip).digest("hex");
}

export interface RateLimitCounts {
  emailCount: number;
  orgCount: number;
  /** null → the per-IP sublimit is skipped (no IP or no secret). */
  ipCount: number | null;
}

export interface RateLimits {
  weeklyEmail: number;
  dailyOrg: number;
  dailyIp: number;
}

export type RateLimitReason = "email" | "ip" | "org";

// Precedence: a prospect hammering their own email hears the email message; a
// single flooding source hears the IP message; otherwise the whole link is hot
// (org). ipCount null → the per-IP sublimit is skipped.
export function rateLimitDecision(
  counts: RateLimitCounts,
  limits: RateLimits,
): { ok: boolean; reason?: RateLimitReason } {
  if (counts.emailCount >= limits.weeklyEmail) return { ok: false, reason: "email" };
  if (counts.ipCount !== null && counts.ipCount >= limits.dailyIp)
    return { ok: false, reason: "ip" };
  if (counts.orgCount >= limits.dailyOrg) return { ok: false, reason: "org" };
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx playwright test tests/e2e/rate-limit.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/onboarding/rate-limit.ts apps/web/tests/e2e/rate-limit.spec.ts
git commit -m "feat(teaser): pure email-normalize / ip-hash / rate-limit-decision helpers"
```

---

### Task 3: Wire the helpers into `submitLead`

**Files:**
- Modify: `apps/web/app/c/[slug]/start/actions.ts`
- Modify: `.env.example` (document `LEAD_IP_HASH_SECRET`)
- Modify: `apps/web/tests/e2e/teaser.spec.ts` (fix the existing weekly-limit seed; add a normalization test)

**Interfaces:**
- Consumes: `normalizeEmail`, `hashIp`, `rateLimitDecision` (Task 2); `leads.email_normalized`, `leads.ip_hash` (Task 1).

- [ ] **Step 1: Update the existing weekly-limit test to seed `email_normalized`, and add the normalization test**

In `apps/web/tests/e2e/teaser.spec.ts`, the existing weekly-limit test seeds on `email` only; the limiter now counts on `email_normalized`, so its seed must set it. Replace the seed insert inside `test("teaser: per-email weekly limit rejects a 4th preview for the same email", ...)`:

```ts
  // Seed the weekly per-email cap (3). The limiter counts on email_normalized.
  await service.from("leads").insert(
    Array.from({ length: 3 }, () => ({
      org_id: orgId,
      email,
      email_normalized: email,
      allergens: [],
    })),
  );
```

Then append a new test at the end of the file:

```ts
test("teaser: Gmail dot/+tag variants share one weekly quota (normalization)", async ({
  page,
}) => {
  const { orgId, slug } = await seedTeaserOrg();
  const service = serviceClient();
  const handle = `norm.user.${randomUUID().slice(0, 8)}`;

  // Three prior previews under the SAME normalized identity, seeded as dotted
  // Gmail variants (all normalize to handle-without-dots @gmail.com).
  const normalized = `${handle.replace(/\./g, "")}@gmail.com`;
  await service.from("leads").insert(
    Array.from({ length: 3 }, (_, i) => ({
      org_id: orgId,
      email: `${handle}+v${i}@gmail.com`,
      email_normalized: normalized,
      allergens: [],
    })),
  );

  // A fourth, spelled differently again, must still be recognized as the same
  // person and blocked.
  await fillToAllergenStep(page, slug, `${handle.toUpperCase()}@gmail.com`);
  await page.getByTestId("allergies-none").click();
  await page.getByTestId("next").click();

  await expect(page.getByTestId("step-error")).toContainText("this week");
  await expect(page.getByTestId("stage-a-done")).toHaveCount(0);
});
```

- [ ] **Step 2: Run to verify the new test fails**

Run: `cd apps/web && npx playwright test tests/e2e/teaser.spec.ts -g "normalization"`
Expected: FAIL — the action still counts on raw `email`, so the differently-spelled 4th is not blocked (no "this week" error).

- [ ] **Step 3: Wire the action**

In `apps/web/app/c/[slug]/start/actions.ts`:

(a) Add the import near the other `@/lib/onboarding` imports:

```ts
import { hashIp, normalizeEmail, rateLimitDecision, type RateLimitReason } from "@/lib/onboarding/rate-limit";
```

(b) Replace the limits/constants block:

```ts
// Sliding-window teaser quotas (P2.1 + P2 backstop). Weekly-per-email caps a
// single prospect (on a normalized key so +tag/dot variants can't dodge it);
// per-IP/day is a DoS sublimit so one source can't eat the org's quota;
// per-org/day is the overall cost ceiling. All slide on leads.created_at.
const WEEKLY_EMAIL_LIMIT = 3;
const DAILY_ORG_LIMIT = 50;
const PER_IP_DAILY_LIMIT = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const LIMIT_MESSAGES: Record<RateLimitReason, string> = {
  email: "You've already started a few previews this week — check your email or come back later.",
  ip: "There've been a lot of sign-ups from your connection today — please try again tomorrow.",
  org: "This coach is getting a lot of interest today — please try again tomorrow.",
};
```

(c) Replace the whole sliding-window block (from `// Sliding-window rate limits (Postgres count on created_at).` through the end of the `orgCount` check — i.e. the two existing `emailCount`/`orgCount` queries and their two `if` guards) with:

```ts
  // Sliding-window rate limits (Postgres counts on created_at).
  const emailNormalized = normalizeEmail(email);
  const ipHash = hashIp(ip, process.env.LEAD_IP_HASH_SECRET);
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();
  const dayAgo = new Date(Date.now() - DAY_MS).toISOString();

  const { count: emailCount } = await service
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", theme.orgId)
    .eq("email_normalized", emailNormalized)
    .gte("created_at", weekAgo);

  const { count: orgCount } = await service
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", theme.orgId)
    .gte("created_at", dayAgo);

  let ipCount: number | null = null;
  if (ipHash) {
    const { count } = await service
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", theme.orgId)
      .eq("ip_hash", ipHash)
      .gte("created_at", dayAgo);
    ipCount = count ?? 0;
  }

  const decision = rateLimitDecision(
    { emailCount: emailCount ?? 0, orgCount: orgCount ?? 0, ipCount },
    { weeklyEmail: WEEKLY_EMAIL_LIMIT, dailyOrg: DAILY_ORG_LIMIT, dailyIp: PER_IP_DAILY_LIMIT },
  );
  if (!decision.ok && decision.reason) {
    return { ok: false, message: LIMIT_MESSAGES[decision.reason] };
  }
```

(d) In the `.insert({ ... })` call, add the two new columns (after `allergens,`):

```ts
      email_normalized: emailNormalized,
      ip_hash: ipHash,
```

- [ ] **Step 4: Document the env var**

In `.env.example`, after the Turnstile block, append:

```bash

# ── Lead rate-limit IP hashing (Phase 2 backstop)
# Keys the per-source/day DoS sublimit on an HMAC of the client IP (never the
# raw address). Unset → ip_hash is null and the per-IP sublimit is skipped
# (Turnstile + per-email + per-org limits still apply). Server-only secret.
LEAD_IP_HASH_SECRET=
```

- [ ] **Step 5: Run the teaser suite to verify pass**

Run: `cd apps/web && npx playwright test tests/e2e/teaser.spec.ts && cd .. && npm run typecheck && npm run lint`
Expected: all teaser tests pass (incl. normalization + the fixed weekly test); typecheck 4/4; lint clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/c/[slug]/start/actions.ts apps/web/tests/e2e/teaser.spec.ts .env.example
git commit -m "feat(teaser): normalize email + per-source DoS sublimit in submitLead"
```

---

### Task 4: `plan_requests` onboarding partial-unique index

**Files:**
- Create: `supabase/migrations/20260718120100_plan_requests_onboarding_unique.sql`
- Create: `supabase/tests/plan_requests_onboarding_unique_test.sql`

**Interfaces:**
- Produces: partial unique index `plan_requests_onboarding_unique (client_id, kind) WHERE trigger = 'onboarding'`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/plan_requests_onboarding_unique_test.sql`:

```sql
-- Phase 2 backstop: the partial unique index guarantees at most one onboarding
-- diet and one onboarding split per client, while leaving monthly/manual
-- triggers unconstrained. (Client seed mirrors rls_stage_b_test.sql.)

begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-0000000000f1', 'owner-f@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('ff111111-1111-1111-1111-111111111111', 'Org F', 'org-f');

insert into public.clients (id, org_id, profile_id, status, source) values
  ('ff222222-2222-2222-2222-222222222222', 'ff111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-0000000000f1', 'onboarding', 'teaser');

insert into public.plan_requests (org_id, client_id, kind, trigger) values
  ('ff111111-1111-1111-1111-111111111111', 'ff222222-2222-2222-2222-222222222222', 'diet', 'onboarding');

-- A second onboarding diet for the same client is rejected (unique violation).
select throws_ok(
  $$ insert into public.plan_requests (org_id, client_id, kind, trigger) values
     ('ff111111-1111-1111-1111-111111111111', 'ff222222-2222-2222-2222-222222222222', 'diet', 'onboarding') $$,
  '23505',
  NULL,
  'a second onboarding diet is rejected'
);

-- A split (different kind) for the same client is allowed.
select lives_ok(
  $$ insert into public.plan_requests (org_id, client_id, kind, trigger) values
     ('ff111111-1111-1111-1111-111111111111', 'ff222222-2222-2222-2222-222222222222', 'split', 'onboarding') $$,
  'an onboarding split for the same client is allowed'
);

-- A monthly diet is allowed — the index is partial to trigger='onboarding'.
select lives_ok(
  $$ insert into public.plan_requests (org_id, client_id, kind, trigger) values
     ('ff111111-1111-1111-1111-111111111111', 'ff222222-2222-2222-2222-222222222222', 'diet', 'monthly') $$,
  'a monthly diet for the same client is allowed'
);

select finish();

rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase db reset >/dev/null && npx supabase test db 2>&1 | grep -A3 plan_requests_onboarding_unique`
Expected: FAIL — without the index, the second onboarding diet inserts successfully, so `throws_ok` fails.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260718120100_plan_requests_onboarding_unique.sql`:

```sql
-- Phase 2 backstop: a DB-level guarantee that a client gets at most one diet and
-- one split onboarding plan_request. completeIntake already guards with a
-- count-check, but two concurrent finalizes could both pass it; this partial
-- unique index is the real backstop (the app now treats a 23505 here as
-- "already queued"). monthly/manual triggers are intentionally unconstrained.

-- Defensive: collapse any pre-existing onboarding duplicates (keep the earliest)
-- so the unique index can be created on existing data.
delete from public.plan_requests p
using public.plan_requests q
where p.trigger = 'onboarding'
  and q.trigger = 'onboarding'
  and p.client_id = q.client_id
  and p.kind = q.kind
  and (q.created_at < p.created_at
       or (q.created_at = p.created_at and q.id < p.id));

create unique index plan_requests_onboarding_unique
  on public.plan_requests (client_id, kind)
  where trigger = 'onboarding';
```

- [ ] **Step 4: Apply + run pgTAP to verify pass**

Run: `npx supabase db reset >/dev/null && npx supabase test db 2>&1 | tail -5`
Expected: pgTAP total now 118 (115 + 3), all pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260718120100_plan_requests_onboarding_unique.sql supabase/tests/plan_requests_onboarding_unique_test.sql
git commit -m "feat(plan_requests): partial-unique backstop for onboarding requests"
```

---

### Task 5: Make `completeIntake` cooperate with the constraint

**Files:**
- Modify: `apps/web/lib/interview/engine.ts` (the `completeIntake` insert block, currently lines ~339-350)

**Interfaces:**
- Consumes: the `plan_requests_onboarding_unique` index (Task 4).

- [ ] **Step 1: Update the insert to swallow a unique violation**

In `apps/web/lib/interview/engine.ts`, replace the plan-request queue block inside `completeIntake` (the `if ((existing ?? 0) === 0) { ... }` block) with:

```ts
  if ((existing ?? 0) === 0) {
    const { error: queueError } = await service.from("plan_requests").insert([
      { org_id: orgId, client_id: clientId, kind: "diet", trigger: "onboarding" },
      { org_id: orgId, client_id: clientId, kind: "split", trigger: "onboarding" },
    ]);
    // The partial-unique index is the real backstop: a concurrent finalize that
    // slipped past the count-check hits 23505 here. That means the rows already
    // exist (the winner queued them and fired intake_complete once) — treat it
    // as a no-op and do NOT re-fire the event. Any other error still surfaces.
    if (queueError && queueError.code !== "23505") {
      throw new Error(`failed to queue plan_requests: ${queueError.message}`);
    }
    if (!queueError) {
      await trackServer({ orgId, event: "intake_complete", clientId });
    }
  }
```

- [ ] **Step 2: Run typecheck + the existing interview completion e2e to verify no regression**

Run: `npm run typecheck && cd apps/web && npx playwright test tests/e2e/interview.spec.ts`
Expected: typecheck 4/4; interview suite passes — completion still queues exactly one diet + one split and fires `intake_complete` once (the count-check happy path is unchanged; the new branch only affects the racing 23505 case).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/interview/engine.ts
git commit -m "fix(interview): treat plan_requests 23505 as already-queued in completeIntake"
```

---

### Task 6: Stall-nudge wiring (detection + in-thread nudge + cron)

**Files:**
- Create: `apps/web/lib/interview/pacing.ts` (lift `dayNumber` here)
- Modify: `apps/web/lib/interview/engine.ts` (import `dayNumber` from `./pacing`, delete the local copy)
- Create: `apps/web/lib/interview/stall.ts`
- Create: `apps/web/app/api/cron/interview-nudges/route.ts`
- Modify: `apps/web/middleware.ts` (bypass `/api/cron/*`)
- Create: `vercel.json`
- Modify: `.env.example` (document `CRON_SECRET`); append `CRON_SECRET` to `apps/web/.env.local`
- Test: `apps/web/tests/e2e/interview-nudges.spec.ts`

**Interfaces:**
- Consumes: `isNudgeDue` (`@/lib/interview/nudge`), `nextSection` + `SectionAnswers` (`@supertrainer/ai`), `trackServer`, `createServiceClient`.
- Produces: `dayNumber(startedAt: string, now?: number): number`; `runInterviewNudges(now?: number): Promise<{ nudged: number }>`; `GET /api/cron/interview-nudges`.

- [ ] **Step 1: Write the failing e2e**

Create `apps/web/tests/e2e/interview-nudges.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import type { Json } from "@supertrainer/db/types";

import { consentClient, seedClient, serviceClient, uniqueEmail } from "./helpers";

// The stall-nudge cron: a scheduled tick nudges an interview idle >24h that
// still has an open section, and never one that's merely between-days waiting.

// Seeds a consented client with an in_progress interview. `answers` decides
// whether a section is open; `lastPromptHoursAgo` drives idle-ness.
async function seedStalledInterview(opts: {
  answers: Record<string, unknown>;
  startedDaysAgo: number;
  lastPromptHoursAgo: number;
}) {
  const { userId, orgId } = await seedClient(uniqueEmail("nudge"));
  await consentClient(userId);
  const service = serviceClient();
  const { data: client } = await service
    .from("clients")
    .select("id")
    .eq("profile_id", userId)
    .single();
  const clientId = client!.id;

  await service.from("interview_state").insert({
    client_id: clientId,
    org_id: orgId,
    answers: opts.answers as Json,
    status: "in_progress",
    started_at: new Date(Date.now() - opts.startedDaysAgo * 86_400_000).toISOString(),
    last_prompt_at: new Date(Date.now() - opts.lastPromptHoursAgo * 3_600_000).toISOString(),
    nudges_sent: 0,
  });
  return { clientId, orgId };
}

async function nudgeMessageCount(clientId: string) {
  const service = serviceClient();
  const { count } = await service
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("kind", "interview")
    .eq("sender", "assistant");
  return count ?? 0;
}

test("cron nudges an idle interview with an open section, once", async ({ request }) => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET not set in this env");
  // Empty answers → logistics is open. Idle 25h → due.
  const { clientId } = await seedStalledInterview({
    answers: {},
    startedDaysAgo: 2,
    lastPromptHoursAgo: 25,
  });

  const before = await nudgeMessageCount(clientId);
  const res = await request.get("/api/cron/interview-nudges", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).nudged).toBeGreaterThanOrEqual(1);

  expect(await nudgeMessageCount(clientId)).toBe(before + 1);
  const service = serviceClient();
  const { data: state } = await service
    .from("interview_state")
    .select("nudges_sent")
    .eq("client_id", clientId)
    .single();
  expect(state!.nudges_sent).toBe(1);

  // Second tick immediately after: not due (last_prompt_at is now recent).
  await request.get("/api/cron/interview-nudges", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(await nudgeMessageCount(clientId)).toBe(before + 1);
});

test("cron does NOT nudge an interview that's merely waiting for the next day", async ({
  request,
}) => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET not set in this env");
  // Day-1 sections done, started today → nextSection is null (waiting for day 2).
  // Idle timestamp is artificially old to isolate the open-section guard.
  const { clientId } = await seedStalledInterview({
    answers: {
      logistics: { timezone: "UTC", preferredLanguage: "English", weighInDays: ["Mon"] },
      goals: { primaryGoal: "lose fat" },
    },
    startedDaysAgo: 0,
    lastPromptHoursAgo: 25,
  });

  const before = await nudgeMessageCount(clientId);
  await request.get("/api/cron/interview-nudges", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(await nudgeMessageCount(clientId)).toBe(before);
});

test("cron endpoint rejects an unauthenticated call", async ({ request }) => {
  const res = await request.get("/api/cron/interview-nudges");
  expect([401, 503]).toContain(res.status());
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx playwright test tests/e2e/interview-nudges.spec.ts`
Expected: FAIL — the route doesn't exist yet (404 / non-401 status).

- [ ] **Step 3: Create the pacing helper**

Create `apps/web/lib/interview/pacing.ts`:

```ts
// Day-pacing for the Stage B interview (Phase 2.5). Day 1 is the day they start;
// sections unlock across days 1–3. Extracted so the interview engine and the
// stall-nudge tick share one definition.
export function dayNumber(startedAt: string, now: number = Date.now()): number {
  const days = Math.floor((now - new Date(startedAt).getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, days + 1);
}
```

- [ ] **Step 4: Point the engine at the shared helper**

In `apps/web/lib/interview/engine.ts`, delete the local `dayNumber` function (the `// Day 1 on the day they start...` comment + the function, ~lines 35-41) and add to the imports:

```ts
import { dayNumber } from "@/lib/interview/pacing";
```

- [ ] **Step 5: Create the stall module**

Create `apps/web/lib/interview/stall.ts`:

```ts
import "server-only";

import { nextSection, type SectionAnswers } from "@supertrainer/ai";

import { trackServer } from "@/lib/analytics/server";
import { isNudgeDue } from "@/lib/interview/nudge";
import { dayNumber } from "@/lib/interview/pacing";
import { createServiceClient } from "@/lib/supabase/server";

const NUDGE_BODY =
  "Hey — no rush at all. Whenever you've got a minute, we can pick up your intake right where we left off.";
const MAX_PER_TICK = 200;

// Delivery-agnostic stall handling (Phase 2 backstop). A scheduled tick
// (app/api/cron/interview-nudges) calls this. It nudges an interview idle >24h,
// but ONLY when a section is actually open for the client — so we never poke
// someone correctly waiting for the next day's sections to unlock. In-app nudge
// + event now; push/email delivery attaches at notifyClient() in Phase 6.
export async function runInterviewNudges(now: number = Date.now()): Promise<{ nudged: number }> {
  const service = createServiceClient();

  const { data: rows } = await service
    .from("interview_state")
    .select("client_id, org_id, answers, started_at, last_prompt_at, nudges_sent")
    .eq("status", "in_progress")
    .order("last_prompt_at", { ascending: true })
    .limit(MAX_PER_TICK);

  let nudged = 0;
  for (const row of rows ?? []) {
    if (!row.last_prompt_at) continue;
    if (!isNudgeDue(row.last_prompt_at, row.nudges_sent, now)) continue;

    // Only nudge when the ball is in the client's court. Defensive: under the
    // current day-pacing a section unlocks before the 24h idle timer fires, so
    // this is already implied — but it keeps the nudge correct if the pacing or
    // the idle window ever change independently.
    const answers = (row.answers ?? {}) as Record<string, SectionAnswers>;
    if (nextSection(answers, dayNumber(row.started_at, now)) === null) continue;

    // Lease the row with optimistic concurrency on last_prompt_at so two
    // overlapping ticks can't both nudge. Bump BEFORE posting.
    const { data: leased } = await service
      .from("interview_state")
      .update({
        nudges_sent: row.nudges_sent + 1,
        last_prompt_at: new Date(now).toISOString(),
      })
      .eq("client_id", row.client_id)
      .eq("status", "in_progress")
      .eq("last_prompt_at", row.last_prompt_at)
      .select("client_id");
    if (!leased || leased.length === 0) continue;

    await service.from("messages").insert({
      org_id: row.org_id,
      client_id: row.client_id,
      sender: "assistant",
      kind: "interview",
      body: NUDGE_BODY,
    });
    await trackServer({ orgId: row.org_id, event: "interview_nudge_sent", clientId: row.client_id });
    notifyClient(row.org_id, row.client_id);
    nudged += 1;
  }

  return { nudged };
}

// Phase 6 seam: send the nudge over the client's real channel (Web Push / email
// digest). Today a no-op — the in-app message above is the whole delivery.
function notifyClient(_orgId: string, _clientId: string): void {
  // intentionally empty until Phase 6 wires Web Push / email.
}
```

- [ ] **Step 6: Create the cron route**

Create `apps/web/app/api/cron/interview-nudges/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { runInterviewNudges } from "@/lib/interview/stall";

export const dynamic = "force-dynamic";

// Vercel Cron hits this hourly (see vercel.json), sending Authorization:
// Bearer ${CRON_SECRET}. This is a public URL, so it fails CLOSED: no secret
// configured → refuse; wrong/absent bearer → 401. Unlike the app's "no-op
// without keys" integrations, an unauthenticated background trigger must never
// run.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runInterviewNudges();
  return NextResponse.json(result);
}
```

- [ ] **Step 7: Bypass the cron path in middleware**

In `apps/web/middleware.ts`, change the top of `middleware()` so `path` is read first and cron is skipped before session work. Replace:

```ts
export async function middleware(request: NextRequest) {
  const { supabaseResponse, claims } = await updateSession(request);
  const path = request.nextUrl.pathname;
```

with:

```ts
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Service-role cron endpoints authenticate via CRON_SECRET, not a user
  // session — skip session refresh and role gating entirely.
  if (path.startsWith("/api/cron/")) return NextResponse.next();

  const { supabaseResponse, claims } = await updateSession(request);
```

- [ ] **Step 8: Add the cron schedule**

Create `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/interview-nudges", "schedule": "0 * * * *" }
  ]
}
```

- [ ] **Step 9: Document + set the secret**

In `.env.example`, append:

```bash

# ── Cron trigger secret (Phase 2 backstop: interview stall nudges)
# Vercel Cron sends `Authorization: Bearer $CRON_SECRET` to /api/cron/*. The
# endpoint fails CLOSED — unset ⇒ it refuses to run (503). Set in production and
# in apps/web/.env.local for the cron e2e. Server-only secret.
CRON_SECRET=
```

Then append to `apps/web/.env.local` (gitignored; restart the dev server so it's picked up):

```bash
CRON_SECRET=local-cron-secret
```

- [ ] **Step 10: Run the suite to verify pass**

Run: `cd apps/web && npx playwright test tests/e2e/interview-nudges.spec.ts tests/e2e/interview.spec.ts && cd .. && npm run typecheck && npm run lint`
Expected: nudge tests pass (open-section nudged once; between-days not nudged; unauthenticated rejected); interview suite still green (engine's `dayNumber` refactor is behavior-preserving); typecheck 4/4; lint clean.

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/interview/pacing.ts apps/web/lib/interview/stall.ts apps/web/lib/interview/engine.ts apps/web/app/api/cron/interview-nudges/route.ts apps/web/middleware.ts vercel.json .env.example apps/web/tests/e2e/interview-nudges.spec.ts
git commit -m "feat(interview): delivery-agnostic stall-nudge cron (in-thread + event)"
```

---

### Task 7: Full verification + docs

**Files:**
- Modify: `docs/plan/PROGRESS.md`
- Modify: `docs/superpowers/specs/2026-07-18-phase2-deferred-backstops-design.md` (status → implemented)

- [ ] **Step 1: Run every gate green**

Run: `npm run typecheck && npm run lint && npx supabase db reset >/dev/null && npx supabase test db && cd apps/web && npm run test`
Expected: typecheck 4/4; lint clean; pgTAP 118 pass; Playwright all pass (53 prior + rate-limit unit + normalization + 3 nudge = 58).

- [ ] **Step 2: Update PROGRESS.md**

In `docs/plan/PROGRESS.md`, add a section under the Phase 2 review notes recording the three backstops as built (email-normalization + hashed-IP per-source sublimit, stall-nudge cron delivery-agnostic, plan_requests partial-unique), and move the still-deferred items to their own line: nudge push/email delivery + push-storage e2e (Phase 6 + VAPID), phone verification/uniqueness (later phase), sub-ms query micro-opts.

- [ ] **Step 3: Mark the spec implemented**

In the spec's header, change `**Status:** approved (design), pre-implementation` to `**Status:** implemented (2026-07-18)`.

- [ ] **Step 4: Commit**

```bash
git add docs/plan/PROGRESS.md docs/superpowers/specs/2026-07-18-phase2-deferred-backstops-design.md
git commit -m "docs: record Phase 2 backstops as implemented; update deferred list"
```

---

## Self-Review

**Spec coverage:**
- Item 1 (email-normalization + hashed-IP sublimit) → Tasks 1, 2, 3. ✓
- Item 2 (delivery-agnostic stall wiring) → Task 6. ✓
- Item 3 (plan_requests partial-unique + code cooperation) → Tasks 4, 5. ✓
- Cross-cutting (types regen, tests, gates, PROGRESS) → Tasks 1 + 7. ✓
- Still-deferred items are recorded, not built (Task 7). ✓

**Placeholder scan:** No TBD/TODO/"handle errors" — every code + test block is complete. The `notifyClient` no-op body is an intentional, documented Phase-6 seam, not a placeholder.

**Type consistency:** `normalizeEmail`/`hashIp`/`rateLimitDecision` signatures and the `RateLimitReason`/`RateLimitCounts`/`RateLimits` types are identical in Task 2 (definition), Task 2b (use), and the tests. `dayNumber(startedAt, now?)` is identical in Task 5's `pacing.ts` and its engine/stall consumers. `runInterviewNudges(now?)` returns `{ nudged }` consistently in the module, route, and test. `event: string` is free-form on `trackServer`, so `interview_nudge_sent` typechecks.

**Note carried into execution:** the two migration timestamps (`20260718120000`, `20260718120100`) sort after the last existing migration (`20260716180000`) — keep them in that order so `db reset` applies cleanly.
