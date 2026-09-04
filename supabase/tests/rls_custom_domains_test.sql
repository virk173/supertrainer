-- RLS test for custom_domains (Phase 9.5). Routing depends on this table, so a
-- trainer must be able to READ their own row (the DNS records live in it) and
-- must not be able to write ANY row: an org that could insert `status = active`
-- for someone else's hostname could hijack that coach's traffic.

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');
insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');
insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');
insert into public.custom_domains (org_id, domain, status) values
  ('11111111-1111-1111-1111-111111111111', 'coach-a.example', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'coach-b.example', 'verifying');

select has_table('public', 'custom_domains', 'custom_domains exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.custom_domains'::regclass),
  'RLS enabled on custom_domains'
);
select col_is_unique('public', 'custom_domains', 'domain', 'a hostname maps to exactly one org');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "owner"}', true);
select is((select count(*)::int from public.custom_domains), 1, 'staff A reads only their own domain');
select is_empty(
  $$ select 1 from public.custom_domains where domain = 'coach-b.example' $$,
  'staff A cannot read org B''s domain row'
);
select throws_ok(
  $$ insert into public.custom_domains (org_id, domain, status)
     values ('11111111-1111-1111-1111-111111111111', 'stolen.example', 'active') $$,
  '42501',
  null,
  'a trainer cannot claim a hostname directly (verification is service-role)'
);
select is_empty(
  $$ with attempted as (
       update public.custom_domains set status = 'active' where domain = 'coach-b.example' returning 1
     ) select * from attempted $$,
  'a trainer cannot activate another org''s domain'
);

select finish();

rollback;
