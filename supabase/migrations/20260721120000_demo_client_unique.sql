-- Phase 2 backstop (MF-4): a DB-level guarantee that an org has at most one
-- is_demo=true client. seedDemoClient (packages/db/src/seed/demo-client.ts)
-- is a select-then-insert with no unique constraint behind it — a double-
-- click (or seedDemo racing resetDemo) lets two concurrent invocations both
-- miss the select and both insert, leaving two is_demo=true rows per org.
-- From then on every `.eq("is_demo", true).maybeSingle()` throws PGRST116
-- (multiple rows) and the demo page 500s forever with no recovery short of
-- manual cleanup. This partial unique index is the real backstop (the app
-- now treats a 23505 here as "already seeded"), mirroring the same
-- dedupe-then-create-unique pattern used for
-- plan_requests_onboarding_unique.sql.

-- Defensive: collapse any pre-existing duplicate demo rows per org (keep the
-- earliest) so the unique index can be created on existing data.
delete from public.clients c
using public.clients d
where c.is_demo
  and d.is_demo
  and c.org_id = d.org_id
  and (d.created_at < c.created_at
       or (d.created_at = c.created_at and d.id < c.id));

-- Replace the non-unique lookup index from 20260715200000_demo_client.sql
-- with a unique one on the same shape: one demo client per org, enforced.
drop index if exists public.clients_org_id_is_demo_idx;

create unique index clients_org_id_is_demo_idx
  on public.clients (org_id)
  where is_demo;
