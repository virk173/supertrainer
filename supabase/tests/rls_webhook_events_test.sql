-- RLS test for webhook_events (Phase 8.3). Platform-internal: service-role only,
-- no grant to authenticated → an API-role read is denied at the grant layer.
-- RLS is enabled as the belt to that braces.

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated');
insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a');
insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner');

insert into public.webhook_events (stripe_event_id, type, event_created) values
  ('evt_1', 'invoice.paid', 1000);

select has_table('public', 'webhook_events', 'webhook_events exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.webhook_events'::regclass),
  'RLS enabled on webhook_events'
);
select col_is_unique('public', 'webhook_events', 'stripe_event_id', 'stripe_event_id is unique (idempotency)');

-- An authenticated user has no grant at all → a direct read is denied.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);
select throws_like(
  $$ select 1 from public.webhook_events $$,
  '%permission denied%',
  'authenticated cannot read webhook_events (service-role only)'
);

select finish();

rollback;
