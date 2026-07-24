-- Phase 8.2 — client subscriptions + payment history.
--
-- The subscriptions table is the local mirror of a client's Stripe subscription,
-- driven by the 8.3 webhook state machine (never by the checkout redirect). It
-- carries the fields the state machine + dunning ladder (8.4) need: status,
-- pause_reason, the dunning stage/grace window, and last_event_at for
-- out-of-order webhook safety. payment_records is the append-only invoice
-- history (8.2 portal history + 8.5 financial export).
--
-- All writes are service-role (checkout server action + webhooks), org_id
-- verified in code. API roles get read-only, per-verb SELECT: staff over the
-- whole org, a client only their OWN subscription / their own payments.

-- Mirrors the Stripe subscription statuses we act on.
create type public.subscription_status as enum (
  'incomplete', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid'
);
-- Why access is limited when a subscription isn't cleanly active: a dunning
-- pause (system-paused for non-payment, 8.4) vs a vacation pause (client-
-- requested) restrict the portal differently and flip P3 expectations off.
create type public.subscription_pause_reason as enum ('none', 'dunning', 'vacation');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  tier_id uuid references public.tiers (id) on delete set null,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  status public.subscription_status not null default 'incomplete',
  pause_reason public.subscription_pause_reason not null default 'none',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  -- Dunning ladder (8.4): 0 none · 1 day-0 nudge · 2 day-3 nudge · 3 paused.
  dunning_stage integer not null default 0 check (dunning_stage between 0 and 3),
  -- Grace window end — a dunning grace extension (trainer override) OR the 8.6
  -- cutover capture window during which access stays full.
  grace_until timestamptz,
  -- Out-of-order webhook safety (8.3): the Stripe `created` timestamp of the
  -- most recent event applied. A staler event is logged + skipped.
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_org_id_idx on public.subscriptions (org_id);
create index subscriptions_client_id_idx on public.subscriptions (client_id);
create index subscriptions_status_idx on public.subscriptions (org_id, status);

create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

grant select on table public.subscriptions to authenticated;
grant all on table public.subscriptions to service_role;

create policy "staff read org subscriptions"
  on public.subscriptions for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own subscription"
  on public.subscriptions for select
  to authenticated
  using (
    client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );

-- ── payment history (append-only invoice records) ─────────────────────────────
create type public.payment_status as enum ('paid', 'failed', 'refunded', 'uncollectible');

create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  stripe_invoice_id text unique,
  amount_cents integer not null default 0,
  -- The application fee the platform took on this payment (for the fee breakdown).
  application_fee_cents integer not null default 0,
  currency text not null default 'usd',
  status public.payment_status not null,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);

create index payment_records_org_id_idx on public.payment_records (org_id, created_at desc);
create index payment_records_client_id_idx on public.payment_records (client_id, created_at desc);

alter table public.payment_records enable row level security;

grant select on table public.payment_records to authenticated;
grant all on table public.payment_records to service_role;

create policy "staff read org payment records"
  on public.payment_records for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own payment records"
  on public.payment_records for select
  to authenticated
  using (
    client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );
