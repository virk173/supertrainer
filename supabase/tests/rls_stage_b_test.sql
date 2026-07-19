-- RLS tests for the Stage B tables (Phase 2.5): messages + interview_state are
-- read-only for API roles (staff see their org, a client sees only their own;
-- every turn is written by the service-role interview action). plan_requests is
-- a staff-only queue clients must never see.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000001', 'client-a@test.local', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000002', 'client-a2@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'client'),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.clients (id, org_id, profile_id, status, source) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000001', 'onboarding', 'teaser'),
  ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000002', 'onboarding', 'teaser');

insert into public.messages (org_id, client_id, sender, body) values
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 'assistant', 'mine'),
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000002', 'assistant', 'other client');

insert into public.interview_state (client_id, org_id) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');

insert into public.plan_requests (org_id, client_id, kind, trigger) values
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 'diet', 'onboarding');

select has_table('public', 'messages', 'messages stub table exists');
select has_table('public', 'interview_state', 'interview_state table exists');
select has_table('public', 'plan_requests', 'plan_requests table exists');

-- ── owner A (staff) ─────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select results_eq(
  $$ select body from public.messages order by body $$,
  array['mine', 'other client'],
  'owner A reads every message in their org'
);

-- ── client A ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select results_eq(
  $$ select body from public.messages $$,
  array['mine'],
  'client A reads only their own messages'
);
select throws_like(
  $$ insert into public.messages (org_id, client_id, sender, body)
     values ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', 'assistant', 'spoof') $$,
  '%permission denied%',
  'client cannot write messages (turns are service-role written)'
);
select throws_like(
  $$ update public.interview_state set answers = '{"hacked":true}'::jsonb $$,
  '%permission denied%',
  'client cannot edit their own interview state'
);
select is_empty(
  $$ select 1 from public.plan_requests $$,
  'client cannot see the plan request queue'
);

-- ── owner B (other org) ─────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.messages $$,
  'owner B cannot read org A''s messages'
);

select finish();

rollback;
