-- Phase 6.2 — the delivery ladder's bookkeeping. The P3.6 `notifications` queue
-- gets the columns the worker needs to walk each row up the ladder (push → 4h
-- badge → 20:00 email digest), plus a push-degraded marker on clients so a client
-- whose every push endpoint has died is auto-moved to email and shown the
-- "re-enable notifications" banner.

-- ── notifications: ladder state ──────────────────────────────────────────────
alter table public.notifications
  -- when the push was actually accepted by the push service
  add column sent_at timestamptz,
  -- when the client caught up (read the thread / opened the deep link) — the
  -- ladder stops the moment this is set
  add column seen_at timestamptz,
  add column attempts integer not null default 0,
  add column last_attempt_at timestamptz,
  -- ladder position: queued → pushed → badged → digested → done | failed
  add column stage text not null default 'queued';

-- The worker's hot path: a client's still-unseen, non-terminal notifications.
create index notifications_active_idx
  on public.notifications (client_id, stage)
  where seen_at is null;

-- The in-app badge count reads unseen rows that have reached the badge stage.
create index notifications_badge_idx
  on public.notifications (client_id)
  where seen_at is null and stage in ('badged', 'digested');

-- ── clients: push-degraded marker ────────────────────────────────────────────
-- Set (with notification_channel → email_only) when ALL of a client's push
-- endpoints have died, so the portal can tell "auto-downgraded, offer re-enable"
-- from "never enabled push". Client-role users cannot set it (guard below).
alter table public.clients add column push_degraded_at timestamptz;

-- Extend the restricted-columns guard so a client can't clear or forge their own
-- degraded marker — only the delivery worker (service role) sets it. Re-declares
-- the FULL current guard (client_brief.sql version) + push_degraded_at; a partial
-- re-declaration would silently drop the columns later migrations added.
create or replace function public.clients_block_restricted_updates()
returns trigger
language plpgsql
as $$
begin
  if public.jwt_user_role() = 'client' then
    if new.org_id is distinct from old.org_id
      or new.profile_id is distinct from old.profile_id
      or new.status is distinct from old.status
      or new.source is distinct from old.source
      or new.is_demo is distinct from old.is_demo
      or new.approved_manually is distinct from old.approved_manually
      or new.consent_doc_hash is distinct from old.consent_doc_hash
      or new.consent_doc_version is distinct from old.consent_doc_version
      or new.consent_signed_at is distinct from old.consent_signed_at
      or new.health_flags is distinct from old.health_flags
      or new.brief is distinct from old.brief
      or new.brief_generated_at is distinct from old.brief_generated_at
      or new.push_degraded_at is distinct from old.push_degraded_at then
      raise exception 'clients cannot modify restricted columns';
    end if;
  end if;
  return new;
end;
$$;

-- No new grants: notifications is already `grant select ... to authenticated` +
-- `grant all ... to service_role` (P3.6), covering the new columns; the ladder
-- writes them through the service role. clients already has its grants + the
-- guard above narrows what a client-role UPDATE may touch.
