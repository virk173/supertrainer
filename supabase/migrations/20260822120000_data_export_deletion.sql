-- Phase 9.1 — data portability + deletion rights (spec §11 rule 2: "one-click
-- full data export… stated publicly as a trust promise", plus PIPEDA/US-state
-- deletion rights).
--
-- Two job tables + a PRIVATE exports bucket. Both tables are written ONLY by
-- server code (the request action + the background workers) through the service
-- role with org_id verified in code (service-role bypasses RLS — the tenancy
-- rule). API roles get read-only, per-verb `for select`: staff over their org, a
-- client over their OWN rows only (their portability right, not anyone else's).

-- ── export jobs ──────────────────────────────────────────────────────────────
create type public.export_scope as enum ('org', 'client');
create type public.export_status as enum ('queued', 'running', 'ready', 'failed', 'expired');

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  scope public.export_scope not null,
  -- Required for a client-scoped export; null for a whole-org archive.
  client_id uuid references public.clients (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  status public.export_status not null default 'queued',
  -- Object key inside the private 'exports' bucket: {org_id}/{job_id}.zip
  storage_path text,
  size_bytes bigint,
  error text,
  -- Signed-URL lifetime (24h per the spec); a swept job flips to 'expired'.
  expires_at timestamptz,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint export_jobs_client_required
    check (scope = 'org' or client_id is not null)
);

create index export_jobs_org_id_idx on public.export_jobs (org_id, requested_at desc);
create index export_jobs_client_id_idx on public.export_jobs (client_id, requested_at desc);
-- The worker claims queued work oldest-first.
create index export_jobs_queued_idx on public.export_jobs (requested_at)
  where status = 'queued';

create trigger set_export_jobs_updated_at
  before update on public.export_jobs
  for each row execute function public.set_updated_at();

alter table public.export_jobs enable row level security;

grant select on table public.export_jobs to authenticated;
grant all on table public.export_jobs to service_role;

create policy "staff read org export jobs"
  on public.export_jobs for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own export jobs"
  on public.export_jobs for select
  to authenticated
  using (
    client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );

-- ── deletion requests ────────────────────────────────────────────────────────
-- A request opens a 30-day grace window (the trainer is notified for a client
-- deletion; an org deletion forces a final export first). The sweep hard-deletes
-- only after the window elapses — nothing is destroyed synchronously.
create type public.deletion_scope as enum ('org', 'client');
create type public.deletion_status as enum ('pending', 'canceled', 'completed');

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  scope public.deletion_scope not null,
  client_id uuid references public.clients (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  status public.deletion_status not null default 'pending',
  reason text,
  -- Hard delete runs only once now() > grace_until (30 days by default).
  grace_until timestamptz not null,
  -- An org purge must have a completed export before it may run.
  final_export_job_id uuid references public.export_jobs (id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deletion_requests_client_required
    check (scope = 'org' or client_id is not null)
);

create index deletion_requests_org_id_idx on public.deletion_requests (org_id, requested_at desc);
-- The sweep looks for pending requests whose grace has elapsed.
create index deletion_requests_due_idx on public.deletion_requests (grace_until)
  where status = 'pending';

create trigger set_deletion_requests_updated_at
  before update on public.deletion_requests
  for each row execute function public.set_updated_at();

alter table public.deletion_requests enable row level security;

grant select on table public.deletion_requests to authenticated;
grant all on table public.deletion_requests to service_role;

create policy "staff read org deletion requests"
  on public.deletion_requests for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own deletion requests"
  on public.deletion_requests for select
  to authenticated
  using (
    client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );

-- ── exports bucket (PRIVATE — access only via short-lived signed URLs) ───────
insert into storage.buckets (id, name, public, file_size_limit)
values ('exports', 'exports', false, 1073741824) -- 1 GB
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- Objects are namespaced {org_id}/{job_id}.zip. Staff may read their own org's
-- archives directly; everything else goes through a service-role signed URL.
-- No insert/update/delete policy: only the service-role worker writes here.
create policy "staff read own org exports"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'exports'
    and public.is_org_staff((((storage.foldername(name))[1])::uuid))
  );

-- ── schema introspection for the export-completeness guard ───────────────────
-- The data registry (apps/web/lib/data/registry.ts) must classify EVERY public
-- table: an unclassified table would be silently missing from an export (a broken
-- public promise) or left behind by a purge (orphaned personal data). The test
-- diffs the registry against this list, so any table added by a future phase
-- fails CI until someone classifies it. Service-role only — the shape of the
-- schema is not something an API role needs.
create or replace function public.list_public_tables()
returns setof text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select table_name::text
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by 1
$$;

revoke all on function public.list_public_tables() from public;
revoke all on function public.list_public_tables() from anon;
revoke all on function public.list_public_tables() from authenticated;
grant execute on function public.list_public_tables() to service_role;

-- ── monthly archive opt-in ───────────────────────────────────────────────────
-- A trainer can ask for an archive to be built on the 1st of every month, so the
-- promise ("your data is yours") holds even if they never open the settings page.
-- Written only by the server action / worker through the service role, so the
-- existing orgs grants stay untouched.
alter table public.orgs
  add column if not exists data_export_monthly boolean not null default false;

comment on column public.orgs.data_export_monthly is
  'Phase 9.1 — build a full org archive automatically each month (opt-in).';
