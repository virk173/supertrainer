-- Phase 6.1 — the messages table promoted to the real thread. Covers the NEW
-- surface (the P2.5 stub RLS — client reads own / staff read org / client cannot
-- write — is already proven by rls_stage_b_test): the kind enum, threading/receipt
-- columns, the offline-dedupe unique index, Realtime publication membership, FTS,
-- and that the new columns opened no client write hole (spoof a coach line, forge
-- a read receipt).

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000001', 'client-a@test.local', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test.local', 'authenticated', 'authenticated');

insert into public.orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');

insert into public.profiles (id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'client'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.clients (id, org_id, profile_id, status, source) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000001', 'active', 'teaser');

-- Seed as the migration owner (bypasses RLS) so the schema-level assertions have data.
insert into public.messages (id, org_id, client_id, sender, kind, body, client_tag) values
  ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'd0000000-0000-0000-0000-000000000001', 'client', 'text', 'is chicken breast ok tonight', 'tag-1'),
  ('e0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'd0000000-0000-0000-0000-000000000001', 'coach', 'text', 'go for it', null);

-- ── schema: the promoted columns exist ──────────────────────────────────────
select has_column('public', 'messages', 'reply_to', 'messages.reply_to exists');
select has_column('public', 'messages', 'delivered_at', 'messages.delivered_at exists');
select has_column('public', 'messages', 'read_at', 'messages.read_at exists');
select has_column('public', 'messages', 'client_tag', 'messages.client_tag exists');
select has_column('public', 'messages', 'body_tsv', 'messages.body_tsv (FTS) exists');
select col_type_is('public', 'messages', 'kind', 'message_kind', 'kind is the message_kind enum');

-- ── kind enum accepts a new value ────────────────────────────────────────────
select lives_ok(
  $$ insert into public.messages (org_id, client_id, sender, kind, body)
     values ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', 'system', 'card', '{}') $$,
  'kind enum accepts a new value (card)'
);

-- ── offline-dedupe: (client_id, client_tag) is unique ────────────────────────
select throws_ok(
  $$ insert into public.messages (org_id, client_id, sender, kind, body, client_tag)
     values ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', 'client', 'text', 'dup', 'tag-1') $$,
  '23505', null,
  'a replayed send (same client_id, client_tag) collides instead of duplicating'
);
select lives_ok(
  $$ insert into public.messages (org_id, client_id, sender, kind, body, client_tag)
     values ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', 'client', 'text', 'another', null),
            ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', 'client', 'text', 'yet another', null) $$,
  'a NULL client_tag is never deduped (coach/system writes co-exist)'
);

-- ── threaded reply: reply_to self-references a real message ──────────────────
select lives_ok(
  $$ insert into public.messages (org_id, client_id, sender, kind, body, reply_to)
     values ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', 'coach', 'text', 'in reply',
             'e0000000-0000-0000-0000-000000000001') $$,
  'a message can reply_to another message'
);

-- ── Realtime: messages is in the supabase_realtime publication ───────────────
select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'),
  1,
  'messages is published to supabase_realtime (RLS-scoped fanout)'
);

-- ── FTS: websearch over body_tsv matches ─────────────────────────────────────
select is(
  (select count(*)::int from public.messages
   where body_tsv @@ websearch_to_tsquery('simple', 'chicken')),
  1,
  'full-text search matches a thread line'
);

-- ── RLS: the new columns opened NO client write hole ─────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated", "org_id": "11111111-1111-1111-1111-111111111111", "user_role": "client"}',
  true);

select throws_like(
  $$ insert into public.messages (org_id, client_id, sender, kind, body)
     values ('11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', 'coach', 'text', 'spoofed coach line') $$,
  '%permission denied%',
  'a client cannot INSERT a message (no spoofing coach/assistant — writes are service-role)'
);
select throws_like(
  $$ update public.messages set read_at = now()
     where id = 'e0000000-0000-0000-0000-000000000002' $$,
  '%permission denied%',
  'a client cannot forge a read receipt (no UPDATE grant)'
);

select finish();

rollback;
