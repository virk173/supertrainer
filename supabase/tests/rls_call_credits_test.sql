-- RLS test for call_credits (Phase 8.5). Staff read every credit row in their
-- org; a client reads ONLY their own. Writes are service-role (grant worker +
-- booking webhook) → a direct client write is denied at the grant layer.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000c1', 'client-a1@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');
insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');
insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');
insert into public.clients (id, org_id, profile_id, status, source) values
  ('dddddddd-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-0000000000c1', 'active', 'invite'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd02', '11111111-1111-1111-1111-111111111111', null, 'active', 'invite');
insert into public.call_credits (org_id, client_id, period_month, credits_total) values
  ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01', '2026-08-01', 2),
  ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd02', '2026-08-01', 4);

select has_table('public', 'call_credits', 'call_credits exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.call_credits'::regclass),
  'RLS enabled on call_credits'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}', true);
select is((select count(*)::int from public.call_credits), 2, 'staff A reads both org credit rows');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}', true);
select is((select count(*)::int from public.call_credits), 1, 'client A1 reads only their own credit row');
select throws_like(
  $$ update public.call_credits set credits_used = 1 where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  '%permission denied%',
  'a client cannot write call_credits directly (service-role only)'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}', true);
select is_empty(
  $$ select 1 from public.call_credits where org_id = '11111111-1111-1111-1111-111111111111' $$,
  'org B staff cannot read org A call credits'
);

select finish();

rollback;
