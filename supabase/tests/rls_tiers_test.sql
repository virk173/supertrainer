-- RLS tests for tiers: staff manage their own org's tiers; other orgs' staff
-- and clients see nothing and cannot write.

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000003', 'client-a1@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.tiers (org_id, name, price_cents, position) values
  ('11111111-1111-1111-1111-111111111111', 'Basic', 9900, 0),
  ('22222222-2222-2222-2222-222222222222', 'Basic', 9900, 0);

select has_table('public', 'tiers', 'tiers table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tiers'::regclass),
  'RLS enabled on tiers'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select results_eq(
  $$ select name from public.tiers $$,
  array['Basic'],
  'owner A sees only their org''s tiers'
);

select lives_ok(
  $$ insert into public.tiers (org_id, name, price_cents, position)
     values ('11111111-1111-1111-1111-111111111111', 'Gold', 19900, 1) $$,
  'owner A can create tiers for own org'
);

select throws_like(
  $$ insert into public.tiers (org_id, name, price_cents, position)
     values ('22222222-2222-2222-2222-222222222222', 'Gold', 19900, 1) $$,
  '%row-level security%',
  'owner A cannot create tiers for org B'
);

select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000003", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select is_empty(
  $$ select id from public.tiers $$,
  'client cannot read tiers'
);

select throws_like(
  $$ insert into public.tiers (org_id, name, price_cents, position)
     values ('11111111-1111-1111-1111-111111111111', 'X', 100, 5) $$,
  '%row-level security%',
  'client cannot write tiers'
);

select finish();

rollback;
