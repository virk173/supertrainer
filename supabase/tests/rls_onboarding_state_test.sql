-- RLS tests for org_onboarding_state: staff manage their own org's checklist;
-- clients and other orgs' staff see nothing and cannot write.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

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

insert into public.org_onboarding_state (org_id, step, status) values
  ('11111111-1111-1111-1111-111111111111', 'brand', 'done'),
  ('22222222-2222-2222-2222-222222222222', 'brand', 'todo');

-- ── Structure ────────────────────────────────────────────────────────────────

select has_table('public', 'org_onboarding_state', 'org_onboarding_state table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.org_onboarding_state'::regclass),
  'RLS enabled on org_onboarding_state'
);

-- ── Persona: Owner A ─────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select results_eq(
  $$ select step::text from public.org_onboarding_state $$,
  array['brand'],
  'owner A sees only their org''s checklist rows'
);

select is_empty(
  $$ select id from public.org_onboarding_state where org_id = '22222222-2222-2222-2222-222222222222' $$,
  'owner A cannot read org B''s checklist rows'
);

select lives_ok(
  $$ insert into public.org_onboarding_state (org_id, step, status)
     values ('11111111-1111-1111-1111-111111111111', 'tiers', 'skipped') $$,
  'owner A can upsert checklist rows for own org'
);

select throws_like(
  $$ insert into public.org_onboarding_state (org_id, step, status)
     values ('22222222-2222-2222-2222-222222222222', 'tiers', 'done') $$,
  '%row-level security%',
  'owner A cannot write checklist rows for org B'
);

-- ── Persona: Client A1 ───────────────────────────────────────────────────────

select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000003", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select is_empty(
  $$ select id from public.org_onboarding_state $$,
  'client cannot read onboarding state (even their own org''s)'
);

select throws_like(
  $$ insert into public.org_onboarding_state (org_id, step, status)
     values ('11111111-1111-1111-1111-111111111111', 'demo', 'done') $$,
  '%row-level security%',
  'client cannot write onboarding state'
);

select finish();

rollback;
