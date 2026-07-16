-- RLS tests for leads (Phase 2.1): trainers read their own org's teaser leads;
-- other orgs' staff and clients see nothing. Critically, NO API role has an
-- INSERT grant — public writes must go through the submit action's service-role
-- client — so every authenticated insert fails at the grant (permission denied),
-- not merely at RLS.

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

insert into public.leads (org_id, email, allergens) values
  ('11111111-1111-1111-1111-111111111111', 'lead-a@test.local', array['peanuts']),
  ('22222222-2222-2222-2222-222222222222', 'lead-b@test.local', '{}');

select has_table('public', 'leads', 'leads table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.leads'::regclass),
  'RLS enabled on leads'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select results_eq(
  $$ select email from public.leads $$,
  array['lead-a@test.local'],
  'owner A sees only their org''s leads'
);

-- No INSERT grant for authenticated → permission denied even for own org.
select throws_like(
  $$ insert into public.leads (org_id, email, allergens)
     values ('11111111-1111-1111-1111-111111111111', 'x@test.local', '{}') $$,
  '%permission denied%',
  'owner A cannot insert leads directly (writes go through the service role)'
);

select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);

select results_eq(
  $$ select email from public.leads $$,
  array['lead-b@test.local'],
  'owner B sees only their own org''s leads (cross-org isolation)'
);

select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000003", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select is_empty(
  $$ select id from public.leads $$,
  'client cannot read leads'
);

select throws_like(
  $$ insert into public.leads (org_id, email, allergens)
     values ('11111111-1111-1111-1111-111111111111', 'y@test.local', '{}') $$,
  '%permission denied%',
  'client cannot insert leads'
);

select finish();

rollback;
