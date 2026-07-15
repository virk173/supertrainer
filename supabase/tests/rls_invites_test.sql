-- RLS tests for the invites table: staff manage their own org's invites;
-- clients and other orgs' staff see nothing.

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

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

insert into public.clients (id, org_id, profile_id, status, source) values
  ('c0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'active', 'invite'),
  ('c0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', null, 'lead', 'import');

insert into public.invites (id, org_id, client_id, token) values
  ('d0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-0000000000a1', 'token-org-a'),
  ('d0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'c0000000-0000-0000-0000-0000000000b1', 'token-org-b');

-- ── Structure ────────────────────────────────────────────────────────────────

select has_table('public', 'invites', 'invites table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.invites'::regclass), 'RLS enabled on invites');

-- ── Persona: Owner A ─────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select results_eq(
  $$ select id from public.invites $$,
  array['d0000000-0000-0000-0000-0000000000a1'::uuid],
  'owner A sees only their org''s invites'
);

select is_empty(
  $$ select id from public.invites where org_id = '22222222-2222-2222-2222-222222222222' $$,
  'owner A cannot read org B''s invites'
);

select lives_ok(
  $$ insert into public.invites (org_id, client_id)
     values ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-0000000000a1') $$,
  'owner A can create invites for own org'
);

select throws_like(
  $$ insert into public.invites (org_id, client_id)
     values ('22222222-2222-2222-2222-222222222222', 'c0000000-0000-0000-0000-0000000000b1') $$,
  '%row-level security%',
  'owner A cannot create invites for org B'
);

-- ── Persona: Client A1 ───────────────────────────────────────────────────────

select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000003", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select is_empty(
  $$ select id from public.invites $$,
  'client cannot read invites (even their own org''s)'
);

select finish();

rollback;
