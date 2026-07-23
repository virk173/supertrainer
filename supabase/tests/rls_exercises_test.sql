-- RLS tests for exercises + exercise_videos (Phase 5.1). Global platform rows
-- (org_id null, the free-exercise-db seed) are readable by every authenticated
-- user; org-custom rows are readable by that org's staff AND that org's clients
-- (the session player renders assigned exercises), never another org. All writes
-- are service-role only in P5.1 (no INSERT grant to authenticated at all).

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

-- The client-read policy joins clients on profile_id.
insert into public.clients (id, org_id, profile_id, status, source) values
  ('dddddddd-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-0000000000c1', 'active', 'invite');

-- An org-custom exercise for A + videos: a platform default (visible to all) and
-- A's own override, both on the first seeded global exercise.
insert into public.exercises (id, org_id, source, name, name_normalized, movement_patterns)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', '11111111-1111-1111-1111-111111111111',
        'org_custom', 'A Custom Lift', 'a custom lift', array['squat']::public.movement_pattern[]);

insert into public.exercise_videos (exercise_id, org_id, kind, youtube_id)
select id, null, 'youtube', 'platformdemo1' from public.exercises
  where source = 'feb' order by name limit 1;
insert into public.exercise_videos (exercise_id, org_id, kind, youtube_id)
select id, '11111111-1111-1111-1111-111111111111', 'youtube', 'orgAoverride1'
  from public.exercises where source = 'feb' order by name limit 1;

select has_table('public', 'exercises', 'exercises table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.exercises'::regclass),
  'RLS enabled on exercises'
);
select ok(
  (select count(*) from public.exercises where org_id is null and source = 'feb') >= 800,
  'free-exercise-db global seed is populated (800+)'
);
select has_table('public', 'exercise_videos', 'exercise_videos table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.exercise_videos'::regclass),
  'RLS enabled on exercise_videos'
);

-- ── Owner A (staff) ──────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select ok(
  (select bool_and(org_id is null or org_id = '11111111-1111-1111-1111-111111111111')
     from public.exercises),
  'owner A reads global exercises + only their own org-custom'
);
select throws_like(
  $$ insert into public.exercises (org_id, source, name, name_normalized)
     values ('11111111-1111-1111-1111-111111111111', 'org_custom', 'x', 'x') $$,
  '%permission denied%',
  'no authenticated INSERT on exercises (service-role only in P5.1)'
);

-- ── Client A (non-staff, linked via clients) ─────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select isnt_empty(
  $$ select 1 from public.exercises where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01' $$,
  'client A reads their own org''s custom exercise (session player)'
);
select isnt_empty(
  $$ select 1 from public.exercise_videos where org_id = '11111111-1111-1111-1111-111111111111' $$,
  'client A reads their own org''s exercise video override'
);

-- ── Owner B (other org) ──────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.exercises where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01' $$,
  'owner B cannot read org A''s custom exercise'
);
select isnt_empty(
  $$ select 1 from public.exercise_videos where org_id is null $$,
  'owner B reads platform-default videos (global)'
);
select is_empty(
  $$ select 1 from public.exercise_videos where org_id = '11111111-1111-1111-1111-111111111111' $$,
  'owner B cannot read org A''s video override'
);

select finish();

rollback;
