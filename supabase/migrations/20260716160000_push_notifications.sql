-- PWA install + notification delivery (Phase 2.4). Web push is the adherence
-- engine's delivery dependency (MASTER-PLAN §4.1); email digest (P6) is the
-- fallback for anyone who can't or won't enable push.

-- The fallback ladder. Defaults to email_only: a client only moves up to 'push'
-- once they've actually granted permission, so nobody silently gets no reminders.
create type public.notification_channel as enum ('push', 'email_only');

alter table public.clients
  add column notification_channel public.notification_channel not null default 'email_only';

-- One row per device/browser (multiple devices per client allowed). Revocation
-- is a soft revoked_at so P6 can tell "never subscribed" from "unsubscribed".
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- The push service URL — globally unique per device subscription.
  endpoint text not null unique,
  -- { p256dh, auth } from PushSubscription.toJSON().keys
  keys jsonb not null default '{}'::jsonb,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index push_subscriptions_client_id_idx
  on public.push_subscriptions (client_id)
  where revoked_at is null;
create index push_subscriptions_org_id_idx on public.push_subscriptions (org_id);

create trigger set_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- A client manages their own device subscriptions (register on grant, soft
-- revoke on unsubscribe); staff read their org's for delivery/debugging. No
-- DELETE grant — subscriptions are revoked, never erased.

alter table public.push_subscriptions enable row level security;

grant select, insert, update on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;

create policy "clients manage own push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using (
    client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  )
  with check (
    org_id = (select public.jwt_org_id())
    and client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );

create policy "staff read org push subscriptions"
  on public.push_subscriptions for select
  to authenticated
  using ((select public.is_org_staff(org_id)));
