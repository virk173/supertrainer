-- RLS tests for the Phase 3.3 logging surfaces (weigh_ins, gym_checkins,
-- splits_active, workout_logs, progress_photos, wearable_daily). Same model as
-- meal_logs: a client reads only their own rows; their org's staff read the org;
-- other orgs see nothing; no API role writes (writes are service-role actions).

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

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

insert into public.weigh_ins (org_id, client_id, tz_date, weight_kg, method) values
  ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01', current_date, 72.5, 'manual');
-- exercise_id now FKs the exercises catalog (P5.3) — use a seeded global exercise.
insert into public.workout_logs (org_id, client_id, tz_date, exercise_id, exercise_name, set_number, weight_kg, reps)
select '11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01', current_date,
       e.id, e.name, 1, 60, 8
  from public.exercises e where e.source = 'feb' order by e.name limit 1;
insert into public.wearable_daily (org_id, client_id, tz_date, steps, sleep_min) values
  ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01', current_date, 8200, 430);

select has_table('public', 'weigh_ins', 'weigh_ins exists');
select has_table('public', 'gym_checkins', 'gym_checkins exists');
select has_table('public', 'splits_active', 'splits_active exists');
select has_table('public', 'workout_logs', 'workout_logs exists');
select has_table('public', 'progress_photos', 'progress_photos exists');
select has_table('public', 'wearable_daily', 'wearable_daily exists');

-- ── Client A ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select isnt_empty(
  $$ select 1 from public.weigh_ins where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'client A reads their own weigh-ins'
);
select isnt_empty(
  $$ select 1 from public.workout_logs where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'client A reads their own working sets'
);
select throws_like(
  $$ insert into public.weigh_ins (org_id, client_id, tz_date, weight_kg)
     values ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01', current_date, 70) $$,
  '%permission denied%',
  'a client cannot INSERT weigh-ins directly (service-role only)'
);

-- ── Owner A (staff) ──────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select isnt_empty(
  $$ select 1 from public.wearable_daily where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'staff A reads their org''s wearable data'
);

-- ── Owner B / cross-org ──────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.workout_logs where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'org B staff cannot read org A''s working sets'
);

select finish();

rollback;
