-- RLS tests for ledger_days (Phase 3.4). Same model: a client reads only their
-- own days; their org's staff read the org; other orgs see nothing; the close
-- job (service-role) is the only writer.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

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

insert into public.clients (id, org_id, profile_id, status, source)
values ('dddddddd-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111111',
        'a0000000-0000-0000-0000-0000000000c1', 'active', 'invite');

insert into public.ledger_days (org_id, client_id, tz_date, misses, closed_at)
values ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01',
        current_date - 1, '{"total":2}'::jsonb, now());

select has_table('public', 'ledger_days', 'ledger_days exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.ledger_days'::regclass),
  'RLS enabled on ledger_days'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select isnt_empty(
  $$ select 1 from public.ledger_days where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'client A reads their own ledger days'
);
select throws_like(
  $$ insert into public.ledger_days (org_id, client_id, tz_date)
     values ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01', current_date) $$,
  '%permission denied%',
  'a client cannot write ledger days (close job is service-role)'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select isnt_empty(
  $$ select 1 from public.ledger_days where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'staff A reads their org''s ledger days'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.ledger_days where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'org B staff cannot read org A''s ledger days'
);

select finish();

rollback;
