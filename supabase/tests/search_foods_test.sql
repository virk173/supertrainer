-- Tests for the search_foods() resolver (Phase 3.1): match ranking (exact >
-- prefix/alias > full-text > trigram), org-scoping of custom foods, portion data
-- availability, and DB-verified macros flowing through the function.

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

-- Org A's private custom food, to prove search is org-scoped.
insert into public.foods (org_id, source, name, name_normalized, kcal_per_100g)
values ('11111111-1111-1111-1111-111111111111', 'org_custom', 'A Zappy Shake', 'a zappy shake', 320);

-- ── Owner A ──────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select is(
  (select matched_via from public.search_foods('roti (whole wheat)') limit 1),
  'exact',
  'exact name match ranks first as matched_via=exact'
);
select is(
  (select name_normalized from public.search_foods('roti', 'indian') limit 1),
  'roti (whole wheat)',
  'prefix search resolves "roti" -> Roti (whole wheat)'
);
select is(
  (select name_normalized from public.search_foods('chawal') limit 1),
  'white rice, cooked',
  'alias search resolves "chawal" -> White rice'
);
select ok(
  (select count(*) from public.search_foods('rice')) >= 3,
  'full-text "rice" matches multiple rice foods'
);
select isnt_empty(
  $$ select 1 from public.search_foods('chiken brest')
     where name_normalized = 'chicken breast, cooked' $$,
  'trigram fuzzy tolerates the typo "chiken brest"'
);
select is(
  (select serving_units->>'piece' from public.search_foods('roti') limit 1),
  '40',
  'portion data flows through search (roti piece = 40 g -> "2 rotis" = 80 g)'
);
select is(
  (select kcal_per_100g::int from public.search_foods('gulab jamun') limit 1),
  300,
  'DB-verified macros flow through search (gulab jamun = 300 kcal/100g)'
);
select ok(
  (select count(*) from public.search_foods('rice', null, null, 2)) <= 2,
  'p_limit caps the result count'
);
select isnt_empty(
  $$ select 1 from public.search_foods('zappy') where name_normalized = 'a zappy shake' $$,
  'owner A finds their own org-custom food via search'
);

-- ── Owner B ──────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);

select is_empty(
  $$ select 1 from public.search_foods('zappy') $$,
  'org B cannot reach org A''s custom food through search (org-scoped)'
);
select ok(
  (select count(*) from public.search_foods('rice')) >= 3,
  'org B still searches the global foods normally'
);

select finish();

rollback;
