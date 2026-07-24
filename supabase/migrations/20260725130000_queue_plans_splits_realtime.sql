-- Phase 7.3 — Realtime fanout for the review queue's plan + split streams.
--
-- The queue (and the Home/sidebar pending badge) already refresh live on
-- drafts + escalations (7.1). Diet-plan and training-split drafts are created by
-- the background pipelines, so publishing them lets a draft that lands mid-session
-- appear in the queue without a reload. No new tables, RLS, or grants: the P4/P5
-- "staff read org plans/splits" SELECT policies already scope the fanout per
-- subscriber (clients see only their own APPROVED plan/split, never drafts).
--
-- REPLICA IDENTITY FULL so the RLS org filter applies to UPDATE events (a draft
-- flipping to approved/superseded leaves the queue), not just INSERTs.

alter table public.plans replica identity full;
alter table public.splits replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'plans'
  ) then
    alter publication supabase_realtime add table public.plans;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'splits'
  ) then
    alter publication supabase_realtime add table public.splits;
  end if;
end $$;
