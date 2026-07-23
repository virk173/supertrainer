-- RLS tests for plans (Phase 4.1). Staff read every plan in their org (the
-- review queue needs drafts); a client reads ONLY their own APPROVED plan —
-- drafts stay invisible until the trainer approves, and one client never sees
-- another's. All writes are service-role (the pipeline + the approve action).

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000c1', 'client-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000c2', 'client-a2@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'client'),
  ('a0000000-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-111111111111', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.clients (id, org_id, profile_id, status, source) values
  ('dddddddd-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-0000000000c1', 'active', 'invite'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd02', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-0000000000c2', 'active', 'invite');

-- client A: one draft (pipeline output), one approved (live plan).
insert into public.plans (id, org_id, client_id, status, source) values
  ('99999999-9999-9999-9999-999999999901', '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddd01', 'draft', 'onboarding'),
  ('99999999-9999-9999-9999-999999999902', '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddd01', 'approved', 'onboarding');
-- client A2: an approved plan client A must never see.
insert into public.plans (id, org_id, client_id, status, source) values
  ('99999999-9999-9999-9999-999999999903', '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddd02', 'approved', 'onboarding');

select has_table('public', 'plans', 'plans exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.plans'::regclass),
  'RLS enabled on plans'
);

-- ── staff A: reads every plan in the org, drafts included ──────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select isnt_empty(
  $$ select 1 from public.plans where status = 'draft' and client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'staff A reads org A draft plans'
);

-- ── client A: own approved only ───────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select isnt_empty(
  $$ select 1 from public.plans where id = '99999999-9999-9999-9999-999999999902' $$,
  'client A reads their own approved plan'
);
select is_empty(
  $$ select 1 from public.plans where id = '99999999-9999-9999-9999-999999999901' $$,
  'client A cannot read their own DRAFT plan'
);
select is_empty(
  $$ select 1 from public.plans where id = '99999999-9999-9999-9999-999999999903' $$,
  'client A cannot read another client''s approved plan'
);
select throws_like(
  $$ insert into public.plans (org_id, client_id, source)
     values ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01', 'manual') $$,
  '%permission denied%',
  'a client cannot write plans directly (service-role only)'
);

-- ── org B staff: sees nothing of org A ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.plans where org_id = '11111111-1111-1111-1111-111111111111' $$,
  'org B staff cannot read org A plans'
);

select finish();

rollback;
