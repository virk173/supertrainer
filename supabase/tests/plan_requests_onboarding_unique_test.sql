-- Phase 2 backstop: the partial unique index guarantees at most one onboarding
-- diet and one onboarding split per client, while leaving monthly/manual
-- triggers unconstrained. (Client seed mirrors rls_stage_b_test.sql.)

begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-0000000000f1', 'owner-f@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('ff111111-1111-1111-1111-111111111111', 'Org F', 'org-f');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-0000000000f1', 'ff111111-1111-1111-1111-111111111111', 'owner');

insert into public.clients (id, org_id, profile_id, status, source) values
  ('ff222222-2222-2222-2222-222222222222', 'ff111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-0000000000f1', 'onboarding', 'teaser');

insert into public.plan_requests (org_id, client_id, kind, trigger) values
  ('ff111111-1111-1111-1111-111111111111', 'ff222222-2222-2222-2222-222222222222', 'diet', 'onboarding');

-- A second onboarding diet for the same client is rejected (unique violation).
select throws_ok(
  $$ insert into public.plan_requests (org_id, client_id, kind, trigger) values
     ('ff111111-1111-1111-1111-111111111111', 'ff222222-2222-2222-2222-222222222222', 'diet', 'onboarding') $$,
  '23505',
  NULL,
  'a second onboarding diet is rejected'
);

-- A split (different kind) for the same client is allowed.
select lives_ok(
  $$ insert into public.plan_requests (org_id, client_id, kind, trigger) values
     ('ff111111-1111-1111-1111-111111111111', 'ff222222-2222-2222-2222-222222222222', 'split', 'onboarding') $$,
  'an onboarding split for the same client is allowed'
);

-- A monthly diet is allowed — the index is partial to trigger='onboarding'.
select lives_ok(
  $$ insert into public.plan_requests (org_id, client_id, kind, trigger) values
     ('ff111111-1111-1111-1111-111111111111', 'ff222222-2222-2222-2222-222222222222', 'diet', 'monthly') $$,
  'a monthly diet for the same client is allowed'
);

select finish();

rollback;
