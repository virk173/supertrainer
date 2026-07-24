-- Phase 7.3 — the review queue's plan + split realtime streams. Asserts plans +
-- splits are published to supabase_realtime so a draft landing mid-session shows
-- in the queue without a reload. RLS still scopes the fanout to org staff
-- (rls_plans_test / rls_splits_test); this only guards publication membership.

begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plans'),
  1,
  'plans is published to supabase_realtime (RLS-scoped queue fanout)'
);

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'splits'),
  1,
  'splits is published to supabase_realtime (RLS-scoped queue fanout)'
);

select finish();

rollback;
