-- Phase 8.5 — monthly video-call credits for tiers with video_calls_per_month>0.
-- One row per (client, billing month). The monthly grant sets credits_total from
-- the tier; a Cal.com booking webhook increments credits_used. All writes are
-- service-role (grant worker + booking webhook); API roles read-only, per-verb:
-- staff over the org, a client only their own balance.
create table public.call_credits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  -- The billing month this balance covers (first-of-month date).
  period_month date not null,
  credits_total integer not null default 0 check (credits_total >= 0),
  credits_used integer not null default 0 check (credits_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, period_month)
);

create index call_credits_org_id_idx on public.call_credits (org_id);

create trigger set_call_credits_updated_at
  before update on public.call_credits
  for each row execute function public.set_updated_at();

alter table public.call_credits enable row level security;

grant select on table public.call_credits to authenticated;
grant all on table public.call_credits to service_role;

create policy "staff read org call credits"
  on public.call_credits for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own call credits"
  on public.call_credits for select
  to authenticated
  using (
    client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );
