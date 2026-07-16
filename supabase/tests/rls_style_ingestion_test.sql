-- RLS tests for the style-ingestion tables (uploads, style_profiles,
-- style_exemplars): staff manage their own org's data; other orgs' staff and
-- clients see nothing and cannot write.

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

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

insert into public.style_profiles (org_id, domain, profile) values
  ('11111111-1111-1111-1111-111111111111', 'diet', '{"mealStructure":"3+2"}'),
  ('22222222-2222-2222-2222-222222222222', 'diet', '{}');

insert into public.uploads (org_id, bucket_path, kind) values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/plan.pdf', 'plan_pdf'),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222/plan.pdf', 'plan_pdf');

insert into public.style_exemplars (org_id, domain, content, source) values
  ('11111111-1111-1111-1111-111111111111', 'voice', 'Great work this week!', 'upload'),
  ('22222222-2222-2222-2222-222222222222', 'voice', 'Keep it up', 'upload');

-- ── Structure ────────────────────────────────────────────────────────────────

select has_table('public', 'uploads', 'uploads table exists');
select has_table('public', 'style_profiles', 'style_profiles table exists');
select has_table('public', 'style_exemplars', 'style_exemplars table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.style_profiles'::regclass),
  'RLS enabled on style_profiles'
);

-- ── Persona: Owner A ─────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select results_eq(
  $$ select domain::text from public.style_profiles $$,
  array['diet'],
  'owner A sees only their org''s style profiles'
);

select is_empty(
  $$ select id from public.uploads where org_id = '22222222-2222-2222-2222-222222222222' $$,
  'owner A cannot read org B''s uploads'
);

select lives_ok(
  $$ insert into public.style_profiles (org_id, domain, profile)
     values ('11111111-1111-1111-1111-111111111111', 'training', '{}') $$,
  'owner A can create style profiles for own org'
);

select throws_like(
  $$ insert into public.style_exemplars (org_id, domain, content, source)
     values ('22222222-2222-2222-2222-222222222222', 'voice', 'x', 'upload') $$,
  '%row-level security%',
  'owner A cannot write exemplars for org B'
);

-- ── Persona: Client A1 ───────────────────────────────────────────────────────

select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000003", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select is_empty(
  $$ select id from public.style_profiles $$,
  'client cannot read style profiles (even their own org''s)'
);

select is_empty(
  $$ select id from public.uploads $$,
  'client cannot read uploads'
);

select throws_like(
  $$ insert into public.style_profiles (org_id, domain, profile)
     values ('11111111-1111-1111-1111-111111111111', 'voice', '{}') $$,
  '%row-level security%',
  'client cannot write style profiles'
);

select finish();

rollback;
