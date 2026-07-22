-- Guard test for clients.approved_manually (Phase 2.2): a client-role user may
-- edit their own intake but must NOT flip approved_manually (self-approval) or
-- status. Enforced by clients_block_restricted_updates.

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

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

-- Self-bumping the signed consent version is blocked (PO-3): a client must not
-- be able to fake being current on a new material consent doc to dodge re-sign.
select throws_like(
  $$ update public.clients set consent_doc_version = 'v99'
     where id = 'd0000000-0000-0000-0000-000000000001' $$,
  '%restricted columns%',
  'client cannot set consent_doc_version'
);

-- Self-editing the trainer-facing brief is blocked (PO-5): a client must not be
-- able to rewrite the note (and its health flags) their coach reads.
select throws_like(
  $$ update public.clients set brief = '{"summary":"tampered"}'::jsonb
     where id = 'd0000000-0000-0000-0000-000000000001' $$,
  '%restricted columns%',
  'client cannot set brief'
);

select finish();

rollback;
