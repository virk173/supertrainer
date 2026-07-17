-- RLS tests for foods (Phase 2.2): global verified foods are readable by every
-- authenticated user; org-custom foods only by that org's staff; no API role
-- can write (org-custom food management + its grants arrive in P3.1).

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

-- An org-custom food for A (org-scoped), on top of the global seed.
insert into public.foods (org_id, source, name, name_normalized, kcal_per_100g)
values ('11111111-1111-1111-1111-111111111111', 'org_custom', 'A Secret Shake', 'a secret shake', 250);

select has_table('public', 'foods', 'foods table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.foods'::regclass),
  'RLS enabled on foods'
);
select ok(
  (select count(*) from public.foods where org_id is null) >= 100,
  'global verified seed is populated'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

-- Owner A sees every global food (org_id null) plus their own custom food.
select ok(
  (select bool_and(org_id is null or org_id = '11111111-1111-1111-1111-111111111111')
     from public.foods),
  'owner A reads global foods + only their own org-custom foods'
);
select isnt_empty(
  $$ select 1 from public.foods where name_normalized = 'a secret shake' $$,
  'owner A can read their own org-custom food'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);

-- Owner B must NOT see org A's custom food (but still sees globals).
select is_empty(
  $$ select 1 from public.foods where name_normalized = 'a secret shake' $$,
  'owner B cannot read org A''s custom food'
);

-- No write grant for authenticated in P2.2.
select throws_like(
  $$ insert into public.foods (source, name, name_normalized, kcal_per_100g)
     values ('org_custom', 'X', 'x', 1) $$,
  '%permission denied%',
  'authenticated cannot insert foods (writes are service-role only in P2.2)'
);

select finish();

rollback;
