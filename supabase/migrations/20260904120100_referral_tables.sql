-- Phase 9.4 (part 2) — the referral tables. Split from the enum migration
-- because Postgres will not let a transaction use an enum value it added.

-- ── codes ────────────────────────────────────────────────────────────────────
-- One durable code per org (trainer loop) and one per client (friend loop). The
-- code is the whole link: /r/{code}.
create type public.referral_kind as enum ('trainer', 'client');

create table public.referral_codes (
  code text primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  kind public.referral_kind not null,
  -- set for the client loop; null for the trainer loop
  client_id uuid references public.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index referral_codes_org_trainer_idx
  on public.referral_codes (org_id)
  where kind = 'trainer';
create unique index referral_codes_client_idx
  on public.referral_codes (client_id)
  where kind = 'client';

create trigger set_referral_codes_updated_at
  before update on public.referral_codes
  for each row execute function public.set_updated_at();

alter table public.referral_codes enable row level security;

grant select on table public.referral_codes to authenticated;
grant all on table public.referral_codes to service_role;

-- Staff read their org's codes; a client reads their own (their card shows it).
create policy "staff read org referral codes"
  on public.referral_codes for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own referral code"
  on public.referral_codes for select
  to authenticated
  using (
    client_id in (select id from public.clients where profile_id = (select auth.uid()))
  );

-- ── the ledger ───────────────────────────────────────────────────────────────
-- pending    — the link was followed, nothing has happened yet
-- signed_up  — a referred org exists (trainer loop) or a lead landed (client loop)
-- activated  — the referred org finished onboarding AND has a paying client
-- credited   — the reward was recorded on both sides
-- rejected   — an abuse guard fired; `reason` says which
create type public.referral_status as enum
  ('pending', 'signed_up', 'activated', 'credited', 'rejected');

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.referral_codes (code) on delete cascade,
  referrer_org_id uuid not null references public.orgs (id) on delete cascade,
  -- trainer loop: the org that signed up through the link
  referred_org_id uuid references public.orgs (id) on delete set null,
  -- client loop: the lead the link produced
  referred_lead_id uuid references public.leads (id) on delete set null,
  kind public.referral_kind not null,
  status public.referral_status not null default 'pending',
  -- why a referral was rejected, in words a human can act on
  reason text,
  -- months of platform credit recorded for each side once credited
  referrer_credit_months smallint not null default 0,
  referred_credit_months smallint not null default 0,
  signed_up_at timestamptz,
  activated_at timestamptz,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index referrals_referrer_idx on public.referrals (referrer_org_id, created_at desc);
create unique index referrals_referred_org_idx
  on public.referrals (referred_org_id)
  where referred_org_id is not null;
create unique index referrals_referred_lead_idx
  on public.referrals (referred_lead_id)
  where referred_lead_id is not null;

create trigger set_referrals_updated_at
  before update on public.referrals
  for each row execute function public.set_updated_at();

alter table public.referrals enable row level security;

grant select on table public.referrals to authenticated;
grant all on table public.referrals to service_role;

-- A trainer sees the referrals they made — never anyone else's, and never the
-- referred org's internals.
create policy "staff read own referrals"
  on public.referrals for select
  to authenticated
  using ((select public.is_org_staff(referrer_org_id)));

-- ── where the reward lands ───────────────────────────────────────────────────
-- Platform billing (P8.6) enrols orgs but does not yet charge them, so a credit
-- is BANKED here and consumed by billing when it goes live. Recording months we
-- cannot yet apply is honest; silently dropping them would not be.
alter table public.platform_subscriptions
  add column if not exists credit_months_remaining smallint not null default 0,
  add column if not exists trial_extra_days smallint not null default 0;

comment on column public.platform_subscriptions.credit_months_remaining is
  'Phase 9.4 — banked free months from referrals; consumed by platform billing.';
comment on column public.platform_subscriptions.trial_extra_days is
  'Phase 9.4 — extra trial days a referred org arrived with.';
