-- Core multi-tenant schema: orgs, profiles, clients, audit_log, events.
-- Every org-scoped row carries org_id; RLS policies land in 20260715130200.

-- ── Enums ────────────────────────────────────────────────────────────────────

create type public.org_role as enum ('owner', 'staff', 'client');
create type public.client_status as enum ('lead', 'onboarding', 'active', 'paused', 'churned');
create type public.client_source as enum ('teaser', 'invite', 'import');

-- ── updated_at maintenance ───────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  -- {logo_url, colors, socials}
  brand jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  -- 1:1 with auth.users
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  role public.org_role not null,
  display_name text,
  timezone text not null default 'UTC',
  locale text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_org_id_idx on public.profiles (org_id);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- null until the client claims their account (Phase 2 invite/teaser flow)
  profile_id uuid references public.profiles (id) on delete set null,
  status public.client_status not null default 'lead',
  source public.client_source not null,
  intake jsonb not null default '{}'::jsonb,
  health_flags jsonb not null default '{}'::jsonb,
  consent_signed_at timestamptz,
  consent_doc_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_org_id_idx on public.clients (org_id);
create unique index clients_profile_id_key on public.clients (profile_id) where profile_id is not null;

-- Append-only: no UPDATE/DELETE policies are ever defined, and those grants
-- are revoked from API roles in the RLS migration.
create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index audit_log_org_id_created_at_idx on public.audit_log (org_id, created_at desc);

-- The funnel/event spine every phase writes to.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_org_id_occurred_at_idx on public.events (org_id, occurred_at desc);
create index events_client_id_occurred_at_idx on public.events (client_id, occurred_at desc);
create index events_org_id_type_idx on public.events (org_id, type);

-- ── updated_at triggers ──────────────────────────────────────────────────────

create trigger set_orgs_updated_at
  before update on public.orgs
  for each row execute function public.set_updated_at();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create trigger set_events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();
