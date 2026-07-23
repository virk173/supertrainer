-- RLS tests for draft_edits (Phase 4.3). The trainer's edit-capture log: staff
-- read their own org's edits (the learning loop reads them nightly); other orgs
-- see nothing; clients never see them; writes are service-role (the edit action).
-- Also asserts the plans_active.plan_id → plans FK added in this migration.

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000c1', 'client-a@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.clients (id, org_id, profile_id, status, source)
values ('dddddddd-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111111',
        'a0000000-0000-0000-0000-0000000000c1', 'active', 'invite');

insert into public.plans (id, org_id, client_id, status, source)
values ('99999999-9999-9999-9999-999999999901', '11111111-1111-1111-1111-111111111111',
        'dddddddd-dddd-dddd-dddd-dddddddddd01', 'draft', 'onboarding');

insert into public.draft_edits (org_id, entity_type, entity_id, path, edit_kind)
values ('11111111-1111-1111-1111-111111111111', 'plan', '99999999-9999-9999-9999-999999999901',
        'versions.0.dayTypes.0.meals.0.items.0', 'swap');

select has_table('public', 'draft_edits', 'draft_edits exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.draft_edits'::regclass),
  'RLS enabled on draft_edits'
);

-- plans_active.plan_id FK now points at plans (was a bare uuid stub in P3.2).
select throws_ok(
  $$ insert into public.plans_active (client_id, org_id, plan_id)
     values ('dddddddd-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111111',
             '00000000-0000-0000-0000-0000000000ff') $$,
  '23503', NULL, 'plans_active.plan_id must reference an existing plan'
);

-- staff A read their org's edits
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select isnt_empty(
  $$ select 1 from public.draft_edits where entity_id = '99999999-9999-9999-9999-999999999901' $$,
  'staff A reads their org edit-capture log'
);
select throws_like(
  $$ insert into public.draft_edits (org_id, entity_type, entity_id, path, edit_kind)
     values ('11111111-1111-1111-1111-111111111111', 'plan', '99999999-9999-9999-9999-999999999901', 'x', 'resize') $$,
  '%permission denied%',
  'staff cannot write edits directly (service-role only)'
);

-- client can't read the edit log
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select is_empty(
  $$ select 1 from public.draft_edits $$,
  'a client cannot read the edit-capture log'
);

-- org B staff can't read org A's edits
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.draft_edits where org_id = '11111111-1111-1111-1111-111111111111' $$,
  'org B staff cannot read org A edits'
);

select finish();

rollback;
