-- Guard test for clients.approved_manually (Phase 2.2): a client-role user may
-- edit their own intake but must NOT flip approved_manually (self-approval) or
-- status. Enforced by clients_block_restricted_updates.

begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000001', 'client-a@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'client');

insert into public.clients (id, org_id, profile_id, status, source)
values ('d0000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'c0000000-0000-0000-0000-000000000001', 'onboarding', 'teaser');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

-- Editing own intake is allowed.
select lives_ok(
  $$ update public.clients set intake = '{"note":"hi"}'::jsonb
     where id = 'd0000000-0000-0000-0000-000000000001' $$,
  'client can edit their own intake'
);

-- Self-approval is blocked.
select throws_like(
  $$ update public.clients set approved_manually = true
     where id = 'd0000000-0000-0000-0000-000000000001' $$,
  '%restricted columns%',
  'client cannot set approved_manually'
);

-- Self-activation is blocked.
select throws_like(
  $$ update public.clients set status = 'active'
     where id = 'd0000000-0000-0000-0000-000000000001' $$,
  '%restricted columns%',
  'client cannot change their own status'
);

select finish();

rollback;
