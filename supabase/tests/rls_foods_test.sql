-- RLS tests for foods. P2.2 shipped global-read + org-custom-read with NO write
-- grant. Phase 3.1 opens an org-custom WRITE path: a trainer may create/edit/
-- delete their OWN org_custom foods, never a global food and never another org's
-- — enforced by RLS policies + the foods_org_custom_ownership CHECK.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000c1', 'client-a@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner'),
  ('a0000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'client');

-- A pre-existing org-custom food for A (seeded via service role in setup).
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

-- CHECK: org_custom <=> org-owned (validated regardless of role).
select throws_like(
  $$ insert into public.foods (org_id, source, name, name_normalized, kcal_per_100g)
     values (null, 'org_custom', 'bad global custom', 'bad global custom', 1) $$,
  '%foods_org_custom_ownership%',
  'CHECK rejects a global (org_id null) org_custom food'
);
select throws_like(
  $$ insert into public.foods (org_id, source, name, name_normalized, kcal_per_100g)
     values ('11111111-1111-1111-1111-111111111111', 'usda', 'bad org global', 'bad org global', 1) $$,
  '%foods_org_custom_ownership%',
  'CHECK rejects an org-owned non-org_custom food'
);

-- ── Owner A (staff) ──────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select ok(
  (select bool_and(org_id is null or org_id = '11111111-1111-1111-1111-111111111111')
     from public.foods),
  'owner A reads global foods + only their own org-custom foods'
);
select lives_ok(
  $$ insert into public.foods (org_id, source, name, name_normalized, kcal_per_100g, allergen_tags)
     values ('11111111-1111-1111-1111-111111111111', 'org_custom', 'A Protein Bowl', 'a protein bowl', 400, '{}') $$,
  'owner A can insert their own org-custom food'
);
select throws_like(
  $$ insert into public.foods (org_id, source, name, name_normalized, kcal_per_100g)
     values (null, 'seed', 'A Global Food', 'a global food', 100) $$,
  '%row-level security%',
  'owner A cannot insert a GLOBAL food (writes restricted to own org_custom)'
);
select throws_like(
  $$ insert into public.foods (org_id, source, name, name_normalized, kcal_per_100g, allergen_tags)
     values ('22222222-2222-2222-2222-222222222222', 'org_custom', 'X', 'x cross org', 1, '{}') $$,
  '%row-level security%',
  'owner A cannot insert an org-custom food into org B'
);

-- ── Owner B ──────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);

select is_empty(
  $$ select 1 from public.foods where name_normalized = 'a secret shake' $$,
  'owner B cannot read org A''s custom food'
);
select is(
  (select count(*)::int from public.foods where name_normalized = 'a protein bowl'),
  0,
  'owner B cannot even see org A''s newly inserted custom food'
);

-- ── Client role (non-staff) in org A ─────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select throws_like(
  $$ insert into public.foods (org_id, source, name, name_normalized, kcal_per_100g, allergen_tags)
     values ('11111111-1111-1111-1111-111111111111', 'org_custom', 'Client Food', 'client food', 1, '{}') $$,
  '%row-level security%',
  'a client-role user cannot create org-custom foods (staff only)'
);

select finish();

rollback;
