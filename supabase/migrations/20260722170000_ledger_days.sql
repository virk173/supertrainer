-- Phase 3.4 — ledger_days: one row per client per local day, written by the
-- day-close scheduler. `expected` (derived from plan/schedule/status), `actual`
-- (the day's logs), and `misses` (expected-but-absent, never blank) are computed
-- in code (lib/ledger/day-close.ts) and stored here as the ledger spine that
-- P3.5 scoring and P7 dashboards read. `late` marks a day reopened by a
-- back-dated log; `closed_at` stamps the close.

create table public.ledger_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  tz_date date not null,
  expected jsonb not null default '{}'::jsonb,
  actual jsonb not null default '{}'::jsonb,
  misses jsonb not null default '{}'::jsonb,
  late boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, tz_date)
);

create index ledger_days_client_id_tz_date_idx on public.ledger_days (client_id, tz_date);
create index ledger_days_org_id_idx on public.ledger_days (org_id);

create trigger set_ledger_days_updated_at
  before update on public.ledger_days
  for each row execute function public.set_updated_at();

-- ── RLS + grants (same model as the logging surfaces) ────────────────────────
alter table public.ledger_days enable row level security;

grant select on table public.ledger_days to authenticated;
grant all on table public.ledger_days to service_role;

create policy "staff read org ledger days"
  on public.ledger_days for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own ledger days"
  on public.ledger_days for select
  to authenticated
  using (
    client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );
