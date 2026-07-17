-- RLS tests for push_subscriptions (Phase 2.4): a client manages only their own
-- device subscriptions; staff read their org's; other orgs see nothing; nobody
-- can DELETE (subscriptions are soft-revoked).

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000001', 'client-a@test.local', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000002', 'client-a2@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'client'),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.clients (id, org_id, profile_id, status, source) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000001', 'active', 'invite'),
  ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000002', 'active', 'invite');

insert into public.push_subscriptions (org_id, client_id, endpoint, platform) values
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000002',
   'https://push.example/other-client', 'android');

select has_table('public', 'push_subscriptions', 'push_subscriptions table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass),
  'RLS enabled on push_subscriptions'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select lives_ok(
  $$ insert into public.push_subscriptions (org_id, client_id, endpoint, platform)
     values ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', 'https://push.example/mine', 'ios') $$,
  'client A registers their own device subscription'
);

select throws_like(
  $$ insert into public.push_subscriptions (org_id, client_id, endpoint, platform)
     values ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000002', 'https://push.example/spoof', 'ios') $$,
  '%row-level security%',
  'client A cannot register a subscription for another client'
);

-- Only their own row is visible (not the other client's).
select results_eq(
  $$ select endpoint from public.push_subscriptions $$,
  array['https://push.example/mine'],
  'client A sees only their own subscriptions'
);

select throws_like(
  $$ delete from public.push_subscriptions $$,
  '%permission denied%',
  'no DELETE grant — subscriptions are soft-revoked'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.push_subscriptions $$,
  'owner B cannot read org A''s push subscriptions'
);

select finish();

rollback;
