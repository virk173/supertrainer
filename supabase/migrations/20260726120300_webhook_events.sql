-- Phase 8.3 — the webhook idempotency ledger. Every Stripe event we receive is
-- recorded here keyed by stripe_event_id (UNIQUE) BEFORE its effects run, and
-- stamped processed_at only after they succeed. Replay-safe by construction: a
-- redelivered event whose row already has processed_at is skipped; a row without
-- processed_at re-runs the (idempotent) effects. Stripe retries a 5xx, so a
-- mid-processing crash simply redelivers and completes.
--
-- Platform-internal plumbing (events are not org-scoped — account.updated maps
-- to an org via the connected account, checkout via metadata). Service-role ONLY:
-- no grant to authenticated, so API roles cannot read it at all (deny by
-- construction) and RLS is the belt to the grant's braces.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text not null,
  -- The Stripe `created` (unix seconds) — the out-of-order ordering key.
  event_created bigint,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  received_at timestamptz not null default now()
);

create index webhook_events_unprocessed_idx
  on public.webhook_events (received_at)
  where processed_at is null;

alter table public.webhook_events enable row level security;

-- No grant to authenticated → API roles have zero access. Service role only.
grant all on table public.webhook_events to service_role;
