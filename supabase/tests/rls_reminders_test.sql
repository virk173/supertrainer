-- RLS tests for reminder_rules + notifications (Phase 3.6). Client reads own,
-- staff read org, other orgs see nothing, and writes are service-role (the tick
-- and the vacation action).

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

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

insert into public.reminder_rules (org_id, client_id, kind, schedule)
values ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01', 'meal', '{"times":["12:00"]}'::jsonb);
insert into public.notifications (org_id, client_id, kind, channel, dedupe_key)
values ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01', 'meal', 'push', 'k1');

select has_table('public', 'reminder_rules', 'reminder_rules exists');
select has_table('public', 'notifications', 'notifications exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.reminder_rules'::regclass),
  'RLS enabled on reminder_rules'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-0000000000c1", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);
select isnt_empty(
  $$ select 1 from public.reminder_rules where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'client A reads their own reminder rules'
);
select throws_like(
  $$ insert into public.reminder_rules (org_id, client_id, kind)
     values ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddd01', 'checkin') $$,
  '%permission denied%',
  'a client cannot write reminder rules directly (service-role only)'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select isnt_empty(
  $$ select 1 from public.notifications where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'staff A reads their org''s notifications'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "22222222-2222-2222-2222-222222222222", "user_role": "owner"}',
  true);
select is_empty(
  $$ select 1 from public.reminder_rules where client_id = 'dddddddd-dddd-dddd-dddd-dddddddddd01' $$,
  'org B staff cannot read org A''s reminder rules'
);

select finish();

rollback;
