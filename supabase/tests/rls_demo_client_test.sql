-- Guards for the demo-client flag: is_demo exists, and a client-role user
-- cannot flip is_demo on their own record (it's staff/service-controlled).

begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000003', 'client-a1@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'client');

insert into public.clients (id, org_id, profile_id, status, source) values
  ('c0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'active', 'invite');

select has_column('public', 'clients', 'is_demo', 'clients has is_demo');

-- Owner (staff) can flag a demo client.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select lives_ok(
  $$ update public.clients set is_demo = true
     where id = 'c0000000-0000-0000-0000-0000000000a1' $$,
  'staff can set is_demo'
);

-- Client cannot flip is_demo on their own record.
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000003", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select throws_like(
  $$ update public.clients set is_demo = false
     where id = 'c0000000-0000-0000-0000-0000000000a1' $$,
  '%restricted columns%',
  'client cannot modify is_demo'
);

select finish();

rollback;
