-- RLS tests for meal_logs + plans_active (Phase 3.2). A client reads only their
-- own rows; their org's staff read the whole org; other orgs see nothing; and no
-- API role may write (writes go through the service-role log action).

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

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

-- Client A's own client row (claimed → profile linked).
insert into public.clients (id, org_id, profile_id, status, source)
values ('dddddddd-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111111',
        'a0000000-0000-0000-0000-0000000000c1', 'active', 'invite');

-- Seed a meal log + active plan for client A (service role, before role switch).
insert into public.meal_logs (org_id, client_id, tz_date, meal_slot, method, items, totals)
values ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01',
        current_date, 'lunch', 'text', '[]'::jsonb, '{"kcal":420}'::jsonb);
insert into public.plans_active (client_id, org_id, meal_slots)
values ('dddddddd-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111111',
        '["breakfast","lunch","dinner"]'::jsonb);

select has_table('public', 'meal_logs', 'meal_logs table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.meal_logs'::regclass),
  'RLS enabled on meal_logs'
);
select has_table('public', 'plans_active', 'plans_active table exists');

-- ── Client A ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select isnt_empty(
  $$ select 1 from public.meal_logs where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'client A reads their own meal log'
);
select isnt_empty(
  $$ select 1 from public.plans_active where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'client A reads their own active plan (targets)'
);
select throws_like(
  $$ insert into public.meal_logs (org_id, client_id, tz_date, meal_slot, method)
     values ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01',
             current_date, 'dinner', 'text') $$,
  '%permission denied%',
  'a client cannot INSERT meal logs directly (writes are service-role only)'
);

-- ── Owner A (staff) ──────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select isnt_empty(
  $$ select 1 from public.meal_logs where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'staff A reads their org''s meal logs'
);

-- ── Owner B / cross-org ──────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);

select is_empty(
  $$ select 1 from public.meal_logs where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'org B staff cannot read org A''s meal logs'
);
select is_empty(
  $$ select 1 from public.plans_active where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'org B staff cannot read org A''s active plan'
);
select throws_like(
  $$ insert into public.plans_active (client_id, org_id) values
     ('dddddddd-dddd-dddd-dddd-dddddddddd01', '22222222-2222-2222-2222-222222222222') $$,
  '%permission denied%',
  'no API role can write plans_active (P4.3 writes it service-role)'
);

select finish();

rollback;
