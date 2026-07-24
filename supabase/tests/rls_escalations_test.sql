-- Phase 6.3 — the escalations queue RLS. A trainer-only surface: staff read +
-- update (ack/resolve) their org; clients NEVER see it; cross-org isolated;
-- writes are service-role only (a client can't self-file or clear an escalation).

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

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

insert into public.escalations (id, org_id, client_id, categories, source, self_harm) values
  ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'd0000000-0000-0000-0000-000000000001', array['injury'], 'keyword', false);

select has_table('public', 'escalations', 'escalations table exists');

-- ── owner A (staff) reads + resolves their org's queue ──────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select is(
  (select count(*)::int from public.escalations),
  1,
  'staff read their org escalation queue'
);
select lives_ok(
  $$ update public.escalations set status = 'resolved'
     where id = 'f0000000-0000-0000-0000-000000000001' $$,
  'staff can resolve an escalation'
);
select throws_like(
  $$ insert into public.escalations (org_id, client_id, categories, source)
     values ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', array['injury'], 'keyword') $$,
  '%permission denied%',
  'staff cannot INSERT escalations (service-role only)'
);

-- ── client sees nothing ─────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select is_empty(
  $$ select 1 from public.escalations $$,
  'a client never sees the escalation queue'
);

-- ── owner B (other org) sees nothing ────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.escalations $$,
  'owner B cannot read org A''s escalations'
);
-- RLS-filtered: this matches 0 rows and silently no-ops (it does not throw).
update public.escalations set status = 'acknowledged'
  where id = 'f0000000-0000-0000-0000-000000000001';

-- Back to the migration owner (bypasses RLS) to prove owner B changed nothing —
-- the status is still what owner A resolved it to.
reset role;
select is(
  (select status::text from public.escalations where id = 'f0000000-0000-0000-0000-000000000001'),
  'resolved',
  'owner B could not modify org A''s escalation (RLS-scoped no-op)'
);

select finish();

rollback;
