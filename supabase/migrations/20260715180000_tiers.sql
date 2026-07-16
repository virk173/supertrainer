-- Trainer-defined coaching tiers (Phase 1.4, spec §8). The AI floor is constant
-- across every tier and lives in code (not here) — tiers only capture the human
-- attention each package sells. stripe_product_id is filled in Phase 8.

create type public.tier_cadence as enum ('monthly');

create table public.tiers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'usd',
  cadence public.tier_cadence not null default 'monthly',
  position integer not null default 0,
  -- { checkin_frequency: none|biweekly|weekly|daily,
  --   video_calls_per_month: int, response_priority: bool, custom_lines: text[] }
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  stripe_product_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tiers_org_id_position_idx on public.tiers (org_id, position);

create trigger set_tiers_updated_at
  before update on public.tiers
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Staff manage their own org's tiers. Client-facing tier display (teaser,
-- checkout) reads through the service role with only the public columns, so
-- clients/anon get no direct table access.

alter table public.tiers enable row level security;

grant select, insert, update, delete on table public.tiers to authenticated;
grant all on table public.tiers to service_role;

create policy "staff full access to org tiers"
  on public.tiers for all
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));
