-- RLS tests for the Phase 9.3 platform-console tables. These hold the keys to
-- every org (operator identities, hardware-key material, elevations, support
-- views, margin telemetry, rollout config, status banners). None of them has a
-- grant to an API role and none has a policy, so a fully-authenticated trainer
-- JWT — even an owner's — must read nothing and write nothing. That is the whole
-- test: if any assertion below flips, the console has leaked into the product.

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated');
insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a');
insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner');

-- Seed one row in each table as the service role would.
insert into public.platform_admins (profile_id, note)
  values ('a0000000-0000-0000-0000-000000000001', 'seed');
insert into public.admin_credentials (id, profile_id, credential_id, public_key)
  values ('cccccccc-cccc-cccc-cccc-cccccccccc01',
          'a0000000-0000-0000-0000-000000000001', 'cred-1', '\x01'::bytea);
insert into public.admin_challenges (profile_id, challenge, kind, expires_at)
  values ('a0000000-0000-0000-0000-000000000001', 'chal-1', 'authenticate', now() + interval '5 minutes');
insert into public.admin_sessions (profile_id, elevated_until)
  values ('a0000000-0000-0000-0000-000000000001', now() + interval '30 minutes');
insert into public.impersonation_sessions (admin_profile_id, org_id, reason)
  values ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'support');
insert into public.ai_usage (org_id, task, model, input_tokens, output_tokens, cost_micros)
  values ('11111111-1111-1111-1111-111111111111', 'draft', 'claude-sonnet-5', 1000, 500, 12000);
-- A key nothing else can collide with: feature_flags is a GLOBAL table, so a
-- fixture must not assume the local database is empty of real rows.
insert into public.feature_flags (key, description, enabled_default, rollout_percent)
  values ('pgtap-fixture-flag', 'fixture', false, 25);
insert into public.feature_flag_overrides (flag_key, org_id, enabled)
  values ('pgtap-fixture-flag', '11111111-1111-1111-1111-111111111111', true);
insert into public.platform_incidents (title, body, severity, published)
  values ('Degraded push delivery', 'We are on it.', 'warning', true);
insert into public.platform_audit (actor_profile_id, action, entity_type)
  values ('a0000000-0000-0000-0000-000000000001', 'flag.updated', 'feature_flag');

-- ── RLS is on everywhere ─────────────────────────────────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'public.platform_admins'::regclass),
  'RLS enabled on platform_admins');
select ok((select relrowsecurity from pg_class where oid = 'public.admin_credentials'::regclass),
  'RLS enabled on admin_credentials');
select ok((select relrowsecurity from pg_class where oid = 'public.admin_challenges'::regclass),
  'RLS enabled on admin_challenges');
select ok((select relrowsecurity from pg_class where oid = 'public.admin_sessions'::regclass),
  'RLS enabled on admin_sessions');
select ok((select relrowsecurity from pg_class where oid = 'public.impersonation_sessions'::regclass),
  'RLS enabled on impersonation_sessions');
select ok((select relrowsecurity from pg_class where oid = 'public.ai_usage'::regclass),
  'RLS enabled on ai_usage');
select ok((select relrowsecurity from pg_class where oid = 'public.feature_flags'::regclass),
  'RLS enabled on feature_flags');
select ok((select relrowsecurity from pg_class where oid = 'public.feature_flag_overrides'::regclass),
  'RLS enabled on feature_flag_overrides');
select ok((select relrowsecurity from pg_class where oid = 'public.platform_incidents'::regclass),
  'RLS enabled on platform_incidents');
select ok((select relrowsecurity from pg_class where oid = 'public.platform_audit'::regclass),
  'RLS enabled on platform_audit');

-- ── not one policy grants an API role anything ───────────────────────────────
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and tablename in ('platform_admins','admin_credentials','admin_challenges','admin_sessions',
                        'impersonation_sessions','ai_usage','feature_flags','feature_flag_overrides',
                        'platform_incidents','platform_audit')),
  0,
  'no policy exists on any platform-console table (service-role only)'
);

-- ── an authenticated OWNER sees none of it ───────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select is_empty($$ select 1 from public.platform_admins $$,
  'an owner cannot read platform_admins');
select is_empty($$ select 1 from public.admin_credentials $$,
  'an owner cannot read admin_credentials (key material)');
select is_empty($$ select 1 from public.admin_challenges $$,
  'an owner cannot read admin_challenges');
select is_empty($$ select 1 from public.admin_sessions $$,
  'an owner cannot read admin_sessions (elevations)');
select is_empty($$ select 1 from public.impersonation_sessions $$,
  'an owner cannot read impersonation_sessions directly');
select is_empty($$ select 1 from public.ai_usage $$,
  'an owner cannot read ai_usage (platform margin data)');
select is_empty($$ select 1 from public.feature_flags $$,
  'an owner cannot read feature_flags');
select is_empty($$ select 1 from public.feature_flag_overrides $$,
  'an owner cannot read their own flag overrides');
select is_empty($$ select 1 from public.platform_incidents $$,
  'an owner cannot read platform_incidents directly (the banner is server-rendered)');
select is_empty($$ select 1 from public.platform_audit $$,
  'an owner cannot read the console audit trail');

-- ── …and cannot write themselves into power ──────────────────────────────────
select throws_ok(
  $$ insert into public.platform_admins (profile_id) values ('a0000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'an owner cannot make themselves a platform admin'
);
select throws_ok(
  $$ insert into public.admin_sessions (profile_id, elevated_until)
     values ('a0000000-0000-0000-0000-000000000001', now() + interval '1 day') $$,
  '42501',
  null,
  'an owner cannot forge an admin elevation'
);
select is_empty(
  $$ with attempted as (
       update public.ai_usage set cost_micros = 0 returning 1
     ) select * from attempted $$,
  'an owner cannot rewrite the AI spend ledger'
);

select finish();

rollback;
