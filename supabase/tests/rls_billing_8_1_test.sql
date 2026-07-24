-- RLS tests for the Phase 8.1 billing tables: connect_accounts +
-- platform_subscriptions. Both are staff-read-only (per-verb `for select`),
-- 1:1 with an org; all writes are service-role (onboarding action + webhooks),
-- so API roles have only a SELECT grant and a direct write is denied at the
-- grant layer. Clients never see billing internals; org B never sees org A.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000c1', 'client-a@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.clients (id, org_id, profile_id, status, source) values
  ('dddddddd-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-0000000000c1', 'active', 'invite');

-- Seeded as superuser (bypasses RLS) — one connected account + platform sub per org.
insert into public.connect_accounts (org_id, stripe_account_id, charges_enabled) values
  ('11111111-1111-1111-1111-111111111111', 'acct_orgA', true),
  ('22222222-2222-2222-2222-222222222222', 'acct_orgB', false);
insert into public.platform_subscriptions (org_id, seat_band, status) values
  ('11111111-1111-1111-1111-111111111111', '50', 'active'),
  ('22222222-2222-2222-2222-222222222222', '20', 'trialing');

select has_table('public', 'connect_accounts', 'connect_accounts exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.connect_accounts'::regclass),
  'RLS enabled on connect_accounts'
);
select has_table('public', 'platform_subscriptions', 'platform_subscriptions exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.platform_subscriptions'::regclass),
  'RLS enabled on platform_subscriptions'
);

-- ── staff A: reads own org's billing rows ─────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select isnt_empty(
  $$ select 1 from public.connect_accounts where org_id = '11111111-1111-1111-1111-111111111111' $$,
  'staff A reads own connect account'
);
select isnt_empty(
  $$ select 1 from public.platform_subscriptions where org_id = '11111111-1111-1111-1111-111111111111' $$,
  'staff A reads own platform subscription'
);
-- direct writes are denied at the grant layer (only SELECT granted).
select throws_like(
  $$ update public.connect_accounts set charges_enabled = true
     where org_id = '11111111-1111-1111-1111-111111111111' $$,
  '%permission denied%',
  'staff cannot UPDATE connect_accounts directly (service-role only)'
);
select throws_like(
  $$ insert into public.platform_subscriptions (org_id) values ('11111111-1111-1111-1111-111111111111') $$,
  '%permission denied%',
  'staff cannot INSERT platform_subscriptions directly (service-role only)'
);

-- ── client A: never sees billing internals ────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select is_empty(
  $$ select 1 from public.connect_accounts $$,
  'client cannot read connect_accounts (no client policy)'
);
select is_empty(
  $$ select 1 from public.platform_subscriptions $$,
  'client cannot read platform_subscriptions (no client policy)'
);

-- ── org B staff: sees nothing of org A ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.connect_accounts where org_id = '11111111-1111-1111-1111-111111111111' $$,
  'org B staff cannot read org A connect account'
);
select is_empty(
  $$ select 1 from public.platform_subscriptions where org_id = '11111111-1111-1111-1111-111111111111' $$,
  'org B staff cannot read org A platform subscription'
);

select finish();

rollback;
