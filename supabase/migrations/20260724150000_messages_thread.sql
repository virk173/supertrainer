-- Phase 6.1 — the real-time thread. Promotes the P2.5 `messages` STUB into the
-- client↔coach channel: a full `kind` enum, threaded replies, delivery/read
-- receipts, an offline-dedupe tag, full-text search, and Realtime fanout.
-- Extends IN PLACE — interview turns (P2.5) and reminder/log mirrors (P3) already
-- live here, so their history carries straight into the real thread.
--
-- Writes stay SERVICE-ROLE (no client INSERT/UPDATE grant): the send path is a
-- server action that derives client_id/org_id from the session and stamps the
-- `sender` itself, so a client can never spoof a coach/assistant message, forge a
-- read receipt, or write into another org's thread (the service role bypasses RLS
-- — tenancy is enforced in code, per the service-role-tenancy rule). The existing
-- SELECT policies (client reads own, staff read org) already scope BOTH the
-- paginated fetch AND the Realtime change stream — Postgres Changes evaluates the
-- subscriber's SELECT policy per row, so a client only ever sees their own thread.

-- ── kind: text → enum ────────────────────────────────────────────────────────
-- Existing rows use 'text' (default), 'interview', 'log_confirmation', 'reminder'
-- — every one is a member of the target enum, so the cast below is total.
create type public.message_kind as enum (
  'text', 'voice', 'photo', 'card', 'plan_delivery',
  'log_confirmation', 'reminder', 'interview'
);

alter table public.messages alter column kind drop default;
alter table public.messages
  alter column kind type public.message_kind using kind::public.message_kind;
alter table public.messages alter column kind set default 'text';

-- ── threading + delivery/read receipts ───────────────────────────────────────
alter table public.messages
  add column reply_to uuid references public.messages (id) on delete set null,
  add column delivered_at timestamptz,
  add column read_at timestamptz,
  -- Client-generated idempotency tag for the offline outbound queue: a replayed
  -- send collides on the unique index below instead of duplicating (the send
  -- UPSERTs on it). Set only for client-originated sends; NULL for coach/system/
  -- assistant server writes (which are never queued offline).
  add column client_tag text;

-- The offline-replay dedupe key: one message per (client, client_tag).
create unique index messages_client_tag_key
  on public.messages (client_id, client_tag)
  where client_tag is not null;

create index messages_reply_to_idx
  on public.messages (reply_to) where reply_to is not null;
-- A client's inbound, still-unread rows — the badge/unread count the P6.2 ladder
-- escalates on.
create index messages_unread_idx
  on public.messages (client_id) where read_at is null;

-- ── full-text search (ORIGINAL-SPEC §10 — scrollable, searchable history) ────
-- 'simple' (no stemming/stopwords) matches the foods/exercises search config —
-- names and short chat lines search better literally than stemmed.
alter table public.messages
  add column body_tsv tsvector
    generated always as (to_tsvector('simple', coalesce(body, ''))) stored;
create index messages_body_tsv_idx on public.messages using gin (body_tsv);

-- ── Realtime fanout ──────────────────────────────────────────────────────────
-- REPLICA IDENTITY FULL so Realtime can apply column filters (client_id) and the
-- RLS SELECT policy to UPDATE events too (read-receipt flips), not just INSERTs.
alter table public.messages replica identity full;

-- Add messages to the Realtime publication (guarded — safe to re-run). RLS is
-- still enforced per subscriber: a client receives only their own thread's
-- changes; staff receive their org's.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- No new grants: the P2.5 stub already `grant select on messages to authenticated`
-- (table-level, so it covers the columns added above) and `grant all ... to
-- service_role`. The send/receipt writes go through the service role. RLS policies
-- (staff read org / client reads own) are unchanged and already correct.
