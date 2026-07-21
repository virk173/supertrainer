-- Phase 2 backstop (MF-4): the partial unique index guarantees at most one
-- is_demo=true client per org, while a second non-demo client for the same
-- org stays unconstrained. (Client/profile seed mirrors rls_stage_b_test.sql.)

begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-0000000000a1', 'owner-g@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000a2', 'client-g1@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('aa111111-1111-1111-1111-111111111111', 'Org G', 'org-g');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1', 'aa111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-0000000000a2', 'aa111111-1111-1111-1111-111111111111', 'client');

insert into public.clients (id, org_id, profile_id, status, source, is_demo) values
  ('aa222222-2222-2222-2222-222222222222', 'aa111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-0000000000a2', 'active', 'invite', true);

-- A second is_demo client for the same org is rejected (unique violation).
select throws_ok(
  $$ insert into public.clients (org_id, status, source, is_demo) values
     ('aa111111-1111-1111-1111-111111111111', 'active', 'invite', true) $$,
  '23505',
  NULL,
  'a second demo client for the same org is rejected'
);

-- A second NON-demo client for the same org is allowed (index is partial).
select lives_ok(
  $$ insert into public.clients (org_id, status, source, is_demo) values
     ('aa111111-1111-1111-1111-111111111111', 'active', 'invite', false) $$,
  'a second non-demo client for the same org is allowed'
);

select finish();

rollback;
