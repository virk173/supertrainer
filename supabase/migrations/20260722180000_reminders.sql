-- Phase 3.6 — reminder engine: rules + the notifications queue. Decisions
-- (quiet hours, 3/day cap, suppression — lib/reminders/decide.ts) and enqueuing
-- happen here; actual push/email DELIVERY is Phase 6 draining `notifications`.
-- Every sent reminder is ALSO mirrored into messages (kind='reminder') so the
-- client can scroll their prompt history (ORIGINAL-SPEC §10).

create type public.reminder_kind as enum ('meal', 'weigh_in', 'checkin', 'custom');
create type public.notif_channel as enum ('push', 'email', 'in_app');
create type public.notif_status as enum ('queued', 'sent', 'delivered', 'failed');

-- ── reminder_rules (one per client per kind; defaults seeded from intake) ─────
create table public.reminder_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  kind public.reminder_kind not null,
  -- e.g. {"times":["12:00","19:00"]} for meals, {"days":[1,3,6],"time":"07:30"} for weigh-ins.
  schedule jsonb not null default '{}'::jsonb,
  quiet_hours jsonb not null default '{"start":"21:30","end":"07:30"}'::jsonb,
  -- the kill switch (client vacation mode / org pause) — writes flip this.
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, kind)
);
create index reminder_rules_client_id_idx on public.reminder_rules (client_id);
create index reminder_rules_org_id_idx on public.reminder_rules (org_id);

create trigger set_reminder_rules_updated_at
  before update on public.reminder_rules
  for each row execute function public.set_updated_at();

-- ── notifications (the delivery queue — P6 drains it) ────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  channel public.notif_channel not null,
  status public.notif_status not null default 'queued',
  -- {client}:{kind}:{tz_date}:{slot} — makes the tick idempotent (no dupes).
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dedupe_key)
);
create index notifications_client_id_idx on public.notifications (client_id);
create index notifications_status_idx on public.notifications (status) where status = 'queued';

create trigger set_notifications_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

-- ── RLS + grants (client reads own, staff read org, writes service-role) ─────
alter table public.reminder_rules enable row level security;
alter table public.notifications enable row level security;

grant select on table public.reminder_rules, public.notifications to authenticated;
grant all on table public.reminder_rules, public.notifications to service_role;

create policy "staff read org reminder rules"
  on public.reminder_rules for select to authenticated
  using ((select public.is_org_staff(org_id)));
create policy "clients read own reminder rules"
  on public.reminder_rules for select to authenticated
  using (client_id in (select id from public.clients where profile_id = (select auth.uid())));

create policy "staff read org notifications"
  on public.notifications for select to authenticated
  using ((select public.is_org_staff(org_id)));
create policy "clients read own notifications"
  on public.notifications for select to authenticated
  using (client_id in (select id from public.clients where profile_id = (select auth.uid())));
