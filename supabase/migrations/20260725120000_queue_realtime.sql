-- Phase 7.1 — Realtime fanout for the trainer review queue.
--
-- The Home + Queue pending-count badge subscribes to drafts + escalations so it
-- stays live as clients message in (new drafts land) and as the trainer works
-- the queue (drafts approved/dismissed, escalations resolved). No new tables,
-- RLS, or grants: the P6.3/P6.4 SELECT policies (org staff read their org's
-- escalations / drafts; clients never see either) already scope the fanout per
-- subscriber — this migration only publishes the two tables.
--
-- REPLICA IDENTITY FULL so Realtime can apply the RLS org filter to UPDATE
-- events (approve/resolve status flips), not just INSERTs — matching the
-- messages promotion in 20260724150000_messages_thread.sql.

alter table public.drafts replica identity full;
alter table public.escalations replica identity full;

-- Guarded adds (safe to re-run): only publish a table not already published.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'drafts'
  ) then
    alter publication supabase_realtime add table public.drafts;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'escalations'
  ) then
    alter publication supabase_realtime add table public.escalations;
  end if;
end $$;
