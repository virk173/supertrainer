-- Phase 6.5 — check_in_responses RLS. Client reads own, staff read org (the
-- trainer lens); writes are service-role (the answer action verifies the session
-- client). Cross-org isolated.

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000001', 'client-a@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.clients (id, org_id, profile_id, status, source) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000001', 'active', 'invite');

insert into public.check_in_responses (org_id, client_id, card_id, card_kind, answer) values
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001',
   'sleep-1', 'sleep', '{"value": 4}');

select has_table('public', 'check_in_responses', 'check_in_responses table exists');

-- ── owner A (staff): reads their org ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select is(
  (select count(*)::int from public.check_in_responses),
  1,
  'staff read their org check-in responses (trainer lens)'
);

-- ── client A: reads their own, cannot write ─────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select is(
  (select count(*)::int from public.check_in_responses),
  1,
  'a client reads their own check-in responses'
);
select throws_like(
  $$ insert into public.check_in_responses (org_id, client_id, card_id, card_kind, answer)
     values ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', 'sleep-1', 'sleep', '{"value":1}') $$,
  '%permission denied%',
  'a client cannot write check-in responses (service-role only)'
);

-- ── owner B (other org): sees nothing ───────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.check_in_responses $$,
  'owner B cannot read org A''s check-in responses'
);

select finish();

rollback;
