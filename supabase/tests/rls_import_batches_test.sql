-- RLS tests for import_batches: staff manage their own org's batches; clients
-- and other orgs' staff see nothing and cannot write.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-000000000003', 'client-a1@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.import_batches (id, org_id, row_count) values
  ('e0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 10),
  ('e0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 5);

select has_table('public', 'import_batches', 'import_batches table exists');
select has_column('public', 'clients', 'import_batch_id', 'clients has import_batch_id');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}',
  true);

select results_eq(
  $$ select row_count from public.import_batches $$,
  array[10],
  'owner A sees only their org''s batches'
);

select lives_ok(
  $$ insert into public.import_batches (org_id, row_count)
     values ('11111111-1111-1111-1111-111111111111', 3) $$,
  'owner A can create batches for own org'
);

select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000003", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select is_empty(
  $$ select id from public.import_batches $$,
  'client cannot read import batches'
);

select throws_like(
  $$ insert into public.import_batches (org_id, row_count)
     values ('11111111-1111-1111-1111-111111111111', 1) $$,
  '%row-level security%',
  'client cannot write import batches'
);

select finish();

rollback;
