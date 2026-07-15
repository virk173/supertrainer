-- RLS tests for the core multi-tenant schema (pgTAP, run via `supabase test db`).
-- Proves the Phase 0.2 isolation requirements:
--   (a) trainer A cannot read trainer B's clients
--   (b) a client cannot read another client
--   (c) a client cannot read audit_log
-- plus positive sanity checks and the privilege-escalation guards.

begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

-- ── Fixtures (inserted as postgres — bypasses RLS) ───────────────────────────

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000002', 'staff-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000003', 'client-a1@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000004', 'client-a2@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000009', 'unclaimed-a@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role, display_name) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner', 'Owner A'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'staff', 'Staff A'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'client', 'Client A1'),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'client', 'Client A2'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner', 'Owner B');

insert into public.clients (id, org_id, profile_id, status, source) values
  ('c0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'active', 'invite'),
  ('c0000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004', 'onboarding', 'teaser'),
  ('c0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', null, 'lead', 'import');

insert into public.audit_log (org_id, actor_profile_id, action, entity_type, entity_id) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'client.created', 'client', 'c0000000-0000-0000-0000-0000000000a1'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'client.updated', 'client', 'c0000000-0000-0000-0000-0000000000a2'),
  ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'client.created', 'client', 'c0000000-0000-0000-0000-0000000000b1');

insert into public.events (org_id, client_id, type) values
  ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-0000000000a1', 'log.meal'),
  ('22222222-2222-2222-2222-222222222222', 'c0000000-0000-0000-0000-0000000000b1', 'funnel.teaser_view');

-- ── Structure: tables exist, RLS enabled everywhere ──────────────────────────

select has_table('public', 'orgs', 'orgs table exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'clients', 'clients table exists');
select has_table('public', 'audit_log', 'audit_log table exists');
select has_table('public', 'events', 'events table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.orgs'::regclass), 'RLS enabled on orgs');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS enabled on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.clients'::regclass), 'RLS enabled on clients');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_log'::regclass), 'RLS enabled on audit_log');
select ok((select relrowsecurity from pg_class where oid = 'public.events'::regclass), 'RLS enabled on events');

-- ── Auth hook injects claims ─────────────────────────────────────────────────

select has_function('public', 'custom_access_token_hook', array['jsonb'], 'custom access token hook exists');

select is(
  (public.custom_access_token_hook(
    '{"user_id": "a0000000-0000-0000-0000-000000000001", "claims": {}}'::jsonb
  ) -> 'claims' ->> 'org_id'),
  '11111111-1111-1111-1111-111111111111',
  'hook injects org_id claim from profile'
);

select is(
  (public.custom_access_token_hook(
    '{"user_id": "a0000000-0000-0000-0000-000000000003", "claims": {}}'::jsonb
  ) -> 'claims' ->> 'user_role'),
  'client',
  'hook injects user_role claim from profile'
);

-- ── Persona: Owner A (trainer) ───────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select is(
  (select count(*) from public.clients),
  2::bigint,
  'owner A sees exactly their own org''s 2 clients'
);

-- Requirement (a): trainer A cannot read trainer B's clients
select is_empty(
  $$ select id from public.clients where org_id = '22222222-2222-2222-2222-222222222222' $$,
  'trainer A cannot read trainer B''s clients'
);

select is(
  (select count(*) from public.audit_log),
  2::bigint,
  'owner A sees only their org''s audit rows'
);

select is(
  (select count(*) from public.events),
  1::bigint,
  'owner A sees only their org''s events'
);

-- ── Persona: Staff A ─────────────────────────────────────────────────────────

select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000002", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "staff"}',
  true);

select is(
  (select count(*) from public.clients),
  2::bigint,
  'staff A sees the org''s clients'
);

select is_empty(
  $$ select id from public.audit_log $$,
  'staff cannot read audit_log (owner-only)'
);

-- Privilege-escalation guards: profile lifecycle is service-role only, so even
-- staff cannot mint a new profile (e.g. a second owner) or delete one.
select throws_like(
  $$ insert into public.profiles (id, org_id, role, display_name)
     values ('a0000000-0000-0000-0000-000000000009',
             '11111111-1111-1111-1111-111111111111', 'owner', 'Injected') $$,
  '%permission denied%',
  'staff cannot insert profiles (no INSERT grant)'
);

select throws_like(
  $$ delete from public.profiles
     where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '%permission denied%',
  'staff cannot delete the owner''s profile (no DELETE grant)'
);

-- ── Persona: Client A1 ───────────────────────────────────────────────────────

select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000003", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

-- Requirement (b): a client cannot read another client
select results_eq(
  $$ select id from public.clients $$,
  array['c0000000-0000-0000-0000-0000000000a1'::uuid],
  'client A1 sees only their own client record'
);

select results_eq(
  $$ select id from public.profiles $$,
  array['a0000000-0000-0000-0000-000000000003'::uuid],
  'client A1 sees only their own profile'
);

-- Requirement (c): a client cannot read audit_log
select is_empty(
  $$ select id from public.audit_log $$,
  'client cannot read audit_log'
);

select is_empty(
  $$ select id from public.events $$,
  'client cannot read events'
);

select lives_ok(
  $$ update public.clients
       set intake = '{"goal": "cut"}'::jsonb
     where id = 'c0000000-0000-0000-0000-0000000000a1' $$,
  'client can update own intake'
);

select throws_ok(
  $$ update public.clients
       set status = 'paused'
     where id = 'c0000000-0000-0000-0000-0000000000a1' $$,
  'clients cannot modify restricted columns'
);

-- Consent timestamps pair with a server-set hash, and health flags are trainer
-- annotations — a client must not forge either on their own record. (Distinct
-- values so the trigger's is-distinct-from guard actually fires.)
select throws_like(
  $$ update public.clients
       set consent_signed_at = now()
     where id = 'c0000000-0000-0000-0000-0000000000a1' $$,
  '%restricted columns%',
  'clients cannot forge their consent timestamp'
);

select throws_like(
  $$ update public.clients
       set health_flags = '{"risk": "elevated"}'::jsonb
     where id = 'c0000000-0000-0000-0000-0000000000a1' $$,
  '%restricted columns%',
  'clients cannot change trainer-set health flags'
);

-- audit_log is append-only and the actor cannot be spoofed (RLS 42501).
select throws_ok(
  $$ insert into public.audit_log (org_id, actor_profile_id, action)
     values ('11111111-1111-1111-1111-111111111111',
             'a0000000-0000-0000-0000-000000000001', 'org.deleted') $$,
  '42501',
  NULL,
  'client cannot append an audit row attributed to another actor'
);

select lives_ok(
  $$ insert into public.audit_log (org_id, actor_profile_id, action)
     values ('11111111-1111-1111-1111-111111111111',
             'a0000000-0000-0000-0000-000000000003', 'client.self_action') $$,
  'client may append an audit row attributed to themselves'
);

select throws_like(
  $$ update public.profiles
       set role = 'owner'
     where id = 'a0000000-0000-0000-0000-000000000003' $$,
  '%permission denied%',
  'client cannot escalate their own role (column grant)'
);

select finish();

rollback;
