-- Phase 9.5 — custom domains. Closes the spec §11 promise: a coach's clients can
-- arrive at the coach's OWN domain, not a subdomain of ours.
--
-- The row is the source of truth for routing, so it is readable by staff of the
-- org that owns it and written only by the service role (the verification flow
-- talks to Vercel's API with a platform token — nothing a trainer's JWT should
-- be able to influence).

create type public.domain_status as enum ('pending', 'verifying', 'active', 'error');

create table public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- lower-cased hostname, no scheme, no port
  domain text not null unique,
  status public.domain_status not null default 'pending',
  -- the DNS records the coach has to add, exactly as the host returned them
  verification jsonb not null default '[]'::jsonb,
  error text,
  verified_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One custom domain per org for now: routing a host to an org must be
  -- unambiguous, and a second domain adds no capability a redirect can't.
  constraint custom_domains_one_per_org unique (org_id)
);

create index custom_domains_active_idx on public.custom_domains (domain)
  where status = 'active';

create trigger set_custom_domains_updated_at
  before update on public.custom_domains
  for each row execute function public.set_updated_at();

alter table public.custom_domains enable row level security;

grant select on table public.custom_domains to authenticated;
grant all on table public.custom_domains to service_role;

create policy "staff read own custom domain"
  on public.custom_domains for select
  to authenticated
  using ((select public.is_org_staff(org_id)));
