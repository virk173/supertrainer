-- RLS tests for subscriptions + payment_records (Phase 8.2). Staff read every
-- subscription/payment in their org; a client reads ONLY their own (never another
-- client's, never another org's). All writes are service-role (checkout +
-- webhooks), so a direct client write is denied at the grant layer.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000c1', 'client-a1@test.local', 'authenticated', 'authenticated'),
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

insert into public.subscriptions (id, org_id, client_id, status) values
  ('55555555-5555-5555-5555-555555555501', '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddd01', 'active'),
  ('55555555-5555-5555-5555-555555555502', '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddd02', 'active');

insert into public.payment_records (id, org_id, client_id, amount_cents, status) values
  ('66666666-6666-6666-6666-666666666601', '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddd01', 10000, 'paid'),
  ('66666666-6666-6666-6666-666666666602', '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddd02', 10000, 'paid');

select has_table('public', 'subscriptions', 'subscriptions exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.subscriptions'::regclass),
  'RLS enabled on subscriptions'
);
select has_table('public', 'payment_records', 'payment_records exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.payment_records'::regclass),
  'RLS enabled on payment_records'
);

-- ── staff A: reads every subscription + payment in the org ────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select is(
  (select count(*)::int from public.subscriptions),
  2,
  'staff A reads both org subscriptions'
);
select is(
  (select count(*)::int from public.payment_records),
  2,
  'staff A reads both org payment records'
);

-- ── client A1: own subscription/payment only ─────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select isnt_empty(
  $$ select 1 from public.subscriptions where id = '55555555-5555-5555-5555-555555555501' $$,
  'client A1 reads their own subscription'
);
select is_empty(
  $$ select 1 from public.subscriptions where id = '55555555-5555-5555-5555-555555555502' $$,
  'client A1 cannot read another client''s subscription'
);
select isnt_empty(
  $$ select 1 from public.payment_records where id = '66666666-6666-6666-6666-666666666601' $$,
  'client A1 reads their own payment record'
);
select is_empty(
  $$ select 1 from public.payment_records where id = '66666666-6666-6666-6666-666666666602' $$,
  'client A1 cannot read another client''s payment record'
);
select throws_like(
  $$ insert into public.subscriptions (org_id, client_id, status)
     values ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01', 'active') $$,
  '%permission denied%',
  'a client cannot write subscriptions directly (service-role only)'
);

-- ── org B staff: sees nothing of org A ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.subscriptions where org_id = '11111111-1111-1111-1111-111111111111' $$,
  'org B staff cannot read org A subscriptions'
);

select finish();

rollback;
