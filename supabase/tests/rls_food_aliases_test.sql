-- RLS tests for food_aliases (Phase 3.1). Alias visibility MIRRORS the parent
-- food: global-food aliases are universal; org-custom-food aliases are private to
-- that org. Writes are limited to org staff editing aliases of their OWN
-- org_custom foods. (The 55 global aliases from the seed migration are present.)

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

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

-- Org A's own custom food + one alias for it (seeded via service role).
insert into public.foods (id, org_id, source, name, name_normalized, kcal_per_100g)
values ('cccccccc-cccc-cccc-cccc-ccccccccccc1', '11111111-1111-1111-1111-111111111111',
        'org_custom', 'A Secret Shake', 'a secret shake', 250);
insert into public.food_aliases (food_id, alias, alias_normalized, locale)
values ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'secret shake', 'secret shake', null);

-- Pick a global food id to hang test aliases off of.
select has_table('public', 'food_aliases', 'food_aliases table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.food_aliases'::regclass),
  'RLS enabled on food_aliases'
);

-- ── Owner A ──────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select ok(
  (select count(*) from public.food_aliases) >= 50,
  'owner A reads the global seed aliases'
);
select isnt_empty(
  $$ select 1 from public.food_aliases where alias_normalized = 'secret shake' $$,
  'owner A reads the alias of their own org-custom food'
);
select lives_ok(
  $$ insert into public.food_aliases (food_id, alias, alias_normalized)
     values ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'shake', 'shake') $$,
  'owner A can add an alias to their own org-custom food'
);
select throws_like(
  $$ insert into public.food_aliases (food_id, alias, alias_normalized)
     select f.id, 'my rice', 'my rice' from public.foods f
     where f.org_id is null and f.name_normalized = 'white rice, cooked' limit 1 $$,
  '%row-level security%',
  'owner A cannot add an alias to a GLOBAL food'
);

-- ── Owner B ──────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);

select is_empty(
  $$ select 1 from public.food_aliases where alias_normalized = 'secret shake' $$,
  'owner B cannot read the alias of org A''s custom food'
);
select throws_like(
  $$ insert into public.food_aliases (food_id, alias, alias_normalized)
     values ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'steal', 'steal') $$,
  '%row-level security%',
  'owner B cannot add an alias to org A''s custom food'
);

-- ── Client role (non-staff) in org A ─────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select throws_like(
  $$ insert into public.food_aliases (food_id, alias, alias_normalized)
     values ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'client alias', 'client alias') $$,
  '%row-level security%',
  'a client-role user cannot add food aliases (staff only)'
);

select finish();

rollback;
