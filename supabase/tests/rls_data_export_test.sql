-- RLS tests for export_jobs + deletion_requests (Phase 9.1). Staff read their
-- own org's rows; a client reads ONLY their own (their portability/deletion
-- right, never another client's). All writes are service-role (request actions +
-- background workers), so a direct API-role write is denied at the grant layer.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000c1', 'client-a1@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000c2', 'client-a2@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'client'),
  ('a0000000-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-111111111111', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.clients (id, org_id, profile_id, status, source) values
  ('dddddddd-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-0000000000c1', 'active', 'invite'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd02', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-0000000000c2', 'active', 'invite');

insert into public.export_jobs (id, org_id, scope, client_id) values
  ('99999999-9999-9999-9999-999999999901', '11111111-1111-1111-1111-111111111111', 'org', null),
  ('99999999-9999-9999-9999-999999999902', '11111111-1111-1111-1111-111111111111', 'client',
   'dddddddd-dddd-dddd-dddd-dddddddddd01'),
  ('99999999-9999-9999-9999-999999999903', '11111111-1111-1111-1111-111111111111', 'client',
   'dddddddd-dddd-dddd-dddd-dddddddddd02');

insert into public.deletion_requests (id, org_id, scope, client_id, grace_until) values
  ('88888888-8888-8888-8888-888888888801', '11111111-1111-1111-1111-111111111111', 'client',
   'dddddddd-dddd-dddd-dddd-dddddddddd01', now() + interval '30 days'),
  ('88888888-8888-8888-8888-888888888802', '11111111-1111-1111-1111-111111111111', 'client',
   'dddddddd-dddd-dddd-dddd-dddddddddd02', now() + interval '30 days');

select has_table('public', 'export_jobs', 'export_jobs exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.export_jobs'::regclass),
  'RLS enabled on export_jobs'
);
select has_table('public', 'deletion_requests', 'deletion_requests exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.deletion_requests'::regclass),
  'RLS enabled on deletion_requests'
);
-- A client-scoped row must name a client; an org-scoped row may not be forced to.
select throws_ok(
  $$ insert into public.export_jobs (org_id, scope, client_id)
     values ('11111111-1111-1111-1111-111111111111', 'client', null) $$,
  '23514',
  null,
  'a client-scoped export job must name a client (check constraint)'
);

-- ── staff A: reads every export job + deletion request in the org ────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select is((select count(*)::int from public.export_jobs), 3, 'staff A reads all org export jobs');
select is((select count(*)::int from public.deletion_requests), 2, 'staff A reads all org deletion requests');

-- ── client A1: own rows only ────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select is(
  (select count(*)::int from public.export_jobs),
  1,
  'client A1 reads ONLY their own export job (not the org archive, not A2''s)'
);
select is_empty(
  $$ select 1 from public.deletion_requests where id = '88888888-8888-8888-8888-888888888802' $$,
  'client A1 cannot read another client''s deletion request'
);
select throws_ok(
  $$ insert into public.export_jobs (org_id, scope, client_id)
     values ('11111111-1111-1111-1111-111111111111', 'client', 'dddddddd-dddd-dddd-dddd-dddddddddd01') $$,
  '42501',
  null,
  'a client cannot write export_jobs directly (service-role only)'
);

-- ── org B staff: sees nothing of org A ──────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.export_jobs where org_id = '11111111-1111-1111-1111-111111111111' $$,
  'org B staff cannot read org A export jobs'
);
select is_empty(
  $$ select 1 from public.deletion_requests where org_id = '11111111-1111-1111-1111-111111111111' $$,
  'org B staff cannot read org A deletion requests'
);

select finish();

rollback;
