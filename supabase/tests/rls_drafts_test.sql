-- Phase 6.4 — the drafts queue RLS. A trainer-only surface: staff read + update
-- (approve/edit/dismiss) their org; clients NEVER see it; cross-org isolated;
-- INSERTs are service-role only (the reply engine writes them).

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

insert into public.clients (id, org_id, profile_id, status, source) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000001', 'active', 'invite');

insert into public.drafts (id, org_id, client_id, category, draft_text) values
  ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'd0000000-0000-0000-0000-000000000001', 'conversational', 'Great question — keep it up!');

select has_table('public', 'drafts', 'drafts table exists');

-- ── owner A (staff): reads + approves ───────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select is(
  (select count(*)::int from public.drafts),
  1,
  'staff read their org draft queue'
);
select lives_ok(
  $$ update public.drafts set status = 'dismissed'
     where id = 'f0000000-0000-0000-0000-000000000001' $$,
  'staff can action (update) a draft'
);
select throws_like(
  $$ insert into public.drafts (org_id, client_id, category, draft_text)
     values ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', 'conversational', 'spoof') $$,
  '%permission denied%',
  'staff cannot INSERT drafts (service-role only)'
);

-- ── client: never sees the queue ────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select is_empty(
  $$ select 1 from public.drafts $$,
  'a client never sees the reply-draft queue'
);

-- ── owner B (other org): sees nothing ───────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.drafts $$,
  'owner B cannot read org A''s drafts'
);

select finish();

rollback;
