-- SECURITY REGRESSION — privilege escalation + tenant hop via public.profiles.
--
-- A signed-in user may edit their OWN profile row. The columns that decide
-- authority (role) and tenancy (org_id) must NOT be self-editable: setting
-- role='owner' makes is_org_staff() true and exposes every other client's health
-- data, plans, messages and payments; setting org_id moves the attacker into
-- another tenant. This was live once — a table-wide UPDATE grant (Supabase's new
-- default) silently replaced the column-scoped grant that used to block it.
-- Guarded twice now: a column-scoped grant AND a trigger. Both are asserted here.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-0000000000f1', 'victimclient@test.local', 'authenticated', 'authenticated');
insert into public.orgs (id, name, slug) values
  ('f1111111-1111-1111-1111-111111111111', 'Org F', 'org-f'),
  ('f2222222-2222-2222-2222-222222222222', 'Other Org', 'other-org');
insert into public.profiles (id, org_id, role, display_name) values
  ('a0000000-0000-0000-0000-0000000000f1', 'f1111111-1111-1111-1111-111111111111', 'client', 'Before');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000f1", "role": "authenticated", "org_id": "f1111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

-- ── the attacks ─────────────────────────────────────────────────────────────
select throws_ok(
  $$ update public.profiles set role = 'owner'
     where id = 'a0000000-0000-0000-0000-0000000000f1' $$,
  '42501',
  null,
  'a client cannot escalate their own role to owner'
);
select throws_ok(
  $$ update public.profiles set role = 'staff'
     where id = 'a0000000-0000-0000-0000-0000000000f1' $$,
  '42501',
  null,
  'a client cannot escalate their own role to staff'
);
select throws_ok(
  $$ update public.profiles set org_id = 'f2222222-2222-2222-2222-222222222222'
     where id = 'a0000000-0000-0000-0000-0000000000f1' $$,
  '42501',
  null,
  'a client cannot move themselves into another org (tenant hop)'
);

-- ── the legitimate path still works ─────────────────────────────────────────
select lives_ok(
  $$ update public.profiles set display_name = 'After'
     where id = 'a0000000-0000-0000-0000-0000000000f1' $$,
  'a client CAN still edit their own display name'
);

reset role;
select is(
  (select role::text from public.profiles where id = 'a0000000-0000-0000-0000-0000000000f1'),
  'client',
  'role is unchanged after every escalation attempt'
);
select is(
  (select org_id::text from public.profiles where id = 'a0000000-0000-0000-0000-0000000000f1'),
  'f1111111-1111-1111-1111-111111111111',
  'org_id is unchanged after the tenant-hop attempt'
);

select finish();

rollback;
