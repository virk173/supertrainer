-- Phase 6.2 — the delivery-ladder bookkeeping columns + the push-degraded guard.
-- The P3.6 notifications RLS (client reads own / staff read org / no client write)
-- is already proven by rls_reminders_test; this covers the NEW surface: the ladder
-- columns exist, a client can't forge their own push_degraded_at marker, and the
-- new notification columns opened no client write hole.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email, aud, role) values
  ('c0000000-0000-0000-0000-000000000001', 'client-a@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a');

insert into public.profiles (id, org_id, role) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'client');

insert into public.clients (id, org_id, profile_id, status, source) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000001', 'active', 'invite');

insert into public.notifications (org_id, client_id, kind, channel, dedupe_key) values
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001',
   'message', 'push', 'seed:1');

-- ── schema: the ladder columns exist ────────────────────────────────────────
select has_column('public', 'notifications', 'sent_at', 'notifications.sent_at exists');
select has_column('public', 'notifications', 'seen_at', 'notifications.seen_at exists');
select has_column('public', 'notifications', 'stage', 'notifications.stage exists');
select has_column('public', 'notifications', 'attempts', 'notifications.attempts exists');
select has_column('public', 'clients', 'push_degraded_at', 'clients.push_degraded_at exists');

-- ── RLS: a client-role user ─────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

-- A client may still edit their own intake (guard didn't over-block)…
select lives_ok(
  $$ update public.clients set intake = '{"note":"ok"}'::jsonb
     where profile_id = (select auth.uid()) $$,
  'a client can still edit their own non-restricted columns'
);
-- …but cannot forge the push-degraded marker (only the delivery worker sets it).
select throws_like(
  $$ update public.clients set push_degraded_at = now()
     where profile_id = (select auth.uid()) $$,
  '%restricted columns%',
  'a client cannot set their own push_degraded_at'
);
-- …and still cannot write the notifications queue at all (no UPDATE grant).
select throws_like(
  $$ update public.notifications set stage = 'done' $$,
  '%permission denied%',
  'a client cannot advance a notification through the ladder'
);

select finish();

rollback;
