-- RLS tests for consents (Phase 2.3): staff read their org's consents; a client
-- reads only their own; other orgs see nothing; no API role can write (the
-- evidence trail is service-role, append-only).

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000001', 'client-a@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.clients (id, org_id, profile_id, status, source)
values ('d0000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'c0000000-0000-0000-0000-000000000001', 'onboarding', 'teaser');

insert into public.consents (org_id, client_id, doc_version, doc_sha256, signed_name)
values ('11111111-1111-1111-1111-111111111111',
        'd0000000-0000-0000-0000-000000000001', 'v1', 'abc123', 'Client A');

select has_table('public', 'consents', 'consents table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.consents'::regclass),
  'RLS enabled on consents'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select results_eq(
  $$ select signed_name from public.consents $$,
  array['Client A'],
  'owner A reads their org''s consent'
);

select set_config('request.jwt.claims',
  '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select results_eq(
  $$ select signed_name from public.consents $$,
  array['Client A'],
  'client A reads their own consent'
);
select throws_like(
  $$ insert into public.consents (org_id, client_id, doc_version, doc_sha256, signed_name)
     values ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', 'v1', 'x', 'Hacker') $$,
  '%permission denied%',
  'client cannot insert consents (append-only, service-role writes)'
);

select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.consents $$,
  'owner B cannot read org A''s consents'
);

select finish();

rollback;
