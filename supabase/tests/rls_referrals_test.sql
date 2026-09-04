-- RLS tests for the Phase 9.4 referral tables. A trainer sees the referrals they
-- MADE and the codes they own — never another org's, and never the referred
-- org's internals. A client sees exactly one thing: their own "bring a friend"
-- code. All writes are service-role (the engine decides credit), so a direct
-- client write is denied at the grant layer — otherwise a trainer could mint
-- their own credit.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000c1', 'client-a1@test.local', 'authenticated', 'authenticated'),
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
   'a0000000-0000-0000-0000-0000000000c1', 'active', 'invite'),
  ('dddddddd-dddd-dddd-dddd-dddddddddd02', '11111111-1111-1111-1111-111111111111', null, 'active', 'referral');

insert into public.referral_codes (code, org_id, kind, client_id) values
  ('AAAA1111', '11111111-1111-1111-1111-111111111111', 'trainer', null),
  ('BBBB2222', '11111111-1111-1111-1111-111111111111', 'client', 'dddddddd-dddd-dddd-dddd-dddddddddd01'),
  ('CCCC3333', '11111111-1111-1111-1111-111111111111', 'client', 'dddddddd-dddd-dddd-dddd-dddddddddd02'),
  ('DDDD4444', '22222222-2222-2222-2222-222222222222', 'trainer', null);

insert into public.referrals (code, referrer_org_id, referred_org_id, kind, status) values
  ('AAAA1111', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'trainer', 'signed_up'),
  ('DDDD4444', '22222222-2222-2222-2222-222222222222', null, 'trainer', 'pending');

select has_table('public', 'referral_codes', 'referral_codes exists');
select has_table('public', 'referrals', 'referrals exists');
select ok((select relrowsecurity from pg_class where oid = 'public.referral_codes'::regclass),
  'RLS enabled on referral_codes');
select ok((select relrowsecurity from pg_class where oid = 'public.referrals'::regclass),
  'RLS enabled on referrals');

-- ── staff A ───────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}', true);
select is((select count(*)::int from public.referral_codes), 3, 'staff A reads their org''s three codes');
select is((select count(*)::int from public.referrals), 1, 'staff A reads only the referral they made');
select is_empty(
  $$ select 1 from public.referrals where referrer_org_id = '22222222-2222-2222-2222-222222222222' $$,
  'staff A cannot read org B''s referrals'
);
select throws_ok(
  $$ insert into public.referrals (code, referrer_org_id, kind, status, referrer_credit_months)
     values ('AAAA1111', '11111111-1111-1111-1111-111111111111', 'trainer', 'credited', 12) $$,
  '42501',
  null,
  'a trainer cannot mint their own credit'
);
select is_empty(
  $$ with attempted as (
       update public.referrals set status = 'credited', referrer_credit_months = 12 returning 1
     ) select * from attempted $$,
  'a trainer cannot upgrade a pending referral to credited'
);

-- ── client A1: exactly one code, their own ────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}', true);
select is((select count(*)::int from public.referral_codes), 1, 'client A1 reads only their own code');
select is(
  (select code from public.referral_codes),
  'BBBB2222',
  'and it is theirs, not another client''s'
);
select is_empty($$ select 1 from public.referrals $$,
  'a client cannot read the referral ledger');

select finish();

rollback;
