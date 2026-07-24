-- Phase 8.1 — Connect foundation: the trainer's connected account snapshot, the
-- platform base-fee subscription, and the tier→Price link.
--
-- Both new tables are 1:1 with an org and written ONLY by server code (the
-- Connect onboarding action, the tier-sync worker, and the account.updated /
-- customer.subscription.* webhooks) through the service role, with org_id
-- verified in code (service-role bypasses RLS — CLAUDE.md standing rule 3 +
-- the service-role tenancy rule). API roles get read-only, staff-scoped:
-- per-verb `for select` policies, never FOR ALL, so the broad `authenticated`
-- grant in prod can't open a write hole (there is no write GRANT to attach a
-- write policy to). Clients never see billing internals.

-- ── connected account snapshot ───────────────────────────────────────────────
create table public.connect_accounts (
  org_id uuid primary key references public.orgs (id) on delete cascade,
  -- Stripe Connect Express account id (acct_…). Unique across the platform.
  stripe_account_id text not null unique,
  -- Mirrors of the Stripe account capabilities, refreshed on account.updated.
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  -- The `requirements` hash from account.updated (currently_due, past_due,
  -- disabled_reason) — drives the status panel + re-onboarding blocker.
  requirements jsonb not null default '{}'::jsonb,
  -- Lowercase ISO currency + country as reported by Stripe (informational).
  default_currency text,
  country text,
  -- The org's billing currency, LOCKED once the first Product/Price is created
  -- on the connected account (a Price's currency is immutable in Stripe, so the
  -- org can't mix currencies across tiers). Null until the first tier sync.
  locked_currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_connect_accounts_updated_at
  before update on public.connect_accounts
  for each row execute function public.set_updated_at();

alter table public.connect_accounts enable row level security;

-- Read-only grant → no privilege for a write policy to attach to; service_role
-- bypasses RLS for the onboarding/webhook writes.
grant select on table public.connect_accounts to authenticated;
grant all on table public.connect_accounts to service_role;

create policy "staff read own org connect account"
  on public.connect_accounts for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

-- ── platform base-fee subscription (the trainer's SaaS sub) ───────────────────
-- Seat bands per business rule §11 (client-count pricing). is_demo clients are
-- excluded from the seat count (computed in code, never here).
create type public.seat_band as enum ('20', '50', '100', 'unlimited');
-- Mirrors the Stripe subscription status we care about for the base fee.
create type public.platform_sub_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'paused'
);

create table public.platform_subscriptions (
  org_id uuid primary key references public.orgs (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  seat_band public.seat_band not null default '20',
  status public.platform_sub_status not null default 'trialing',
  trial_end timestamptz,
  current_period_end timestamptz,
  -- Founder-loyalty gesture (Phase 8.6): 60-day trial + founder pricing honored
  -- for life. Env-flagged (NEXT_PUBLIC_FOUNDER_GRACE) until the P9.3 flag ships.
  founder_pricing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_platform_subscriptions_updated_at
  before update on public.platform_subscriptions
  for each row execute function public.set_updated_at();

alter table public.platform_subscriptions enable row level security;

grant select on table public.platform_subscriptions to authenticated;
grant all on table public.platform_subscriptions to service_role;

create policy "staff read own org platform subscription"
  on public.platform_subscriptions for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

-- ── tier → Stripe Price link ──────────────────────────────────────────────────
-- tiers.stripe_product_id already exists (P1 reserved it). A price change never
-- mutates a Price in Stripe — the sync worker creates a NEW Price and repoints
-- this column; existing client subscriptions keep their legacy price until a
-- tier-change (8.2). tiers RLS is unchanged (staff-managed; already tested).
alter table public.tiers add column stripe_price_id text;
