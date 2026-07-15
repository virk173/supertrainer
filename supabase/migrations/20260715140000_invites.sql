-- Client invite tokens. Client-role accounts are created ONLY through invites
-- or the teaser funnel (Phase 2) — never through trainer signup. This table is
-- the guard: /join/[token] resolves an invite server-side (service role) and
-- claims it for a client. Trainers manage invites for their own org.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invites_org_id_idx on public.invites (org_id);
create index invites_client_id_idx on public.invites (client_id);

create trigger set_invites_updated_at
  before update on public.invites
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Token resolution on /join/[token] happens through the service role, so
-- anon/client roles get no access at all.

alter table public.invites enable row level security;

grant select, insert, update, delete on table public.invites to authenticated;
grant all on table public.invites to service_role;

create policy "staff full access to org invites"
  on public.invites for all
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));
