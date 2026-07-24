-- Phase 7.1 — the review-queue realtime badge. Asserts drafts + escalations are
-- published to supabase_realtime so the Home/Queue pending-count stays live.
-- RLS still scopes the fanout to org staff (drafts: rls_drafts_test; escalations:
-- rls_escalations_test); this only guards publication membership from regressing.

begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'drafts'),
  1,
  'drafts is published to supabase_realtime (RLS-scoped queue fanout)'
);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'escalations'),
  1,
  'escalations is published to supabase_realtime (RLS-scoped queue fanout)'
);

select finish();

rollback;
