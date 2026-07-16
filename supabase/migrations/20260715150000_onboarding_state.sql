-- Trainer activation checklist state (Phase 1.1). One row per (org, step);
-- the absence of a row means the step is still 'todo'. The checklist at
-- /onboarding reads this to drive progress, and every sub-flow (brand, style,
-- tiers, import, demo, invite) marks its step done here on completion.

-- ── Enums ────────────────────────────────────────────────────────────────────

create type public.onboarding_step
  as enum ('brand', 'style', 'tiers', 'import', 'demo', 'invite');
create type public.onboarding_step_status
  as enum ('todo', 'done', 'skipped');

-- ── Table ────────────────────────────────────────────────────────────────────

create table public.org_onboarding_state (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  step public.onboarding_step not null,
  status public.onboarding_step_status not null default 'todo',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One state row per step per org; the checklist upserts on this key.
  unique (org_id, step)
);

create index org_onboarding_state_org_id_idx
  on public.org_onboarding_state (org_id);

create trigger set_org_onboarding_state_updated_at
  before update on public.org_onboarding_state
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Onboarding is a staff-only surface: owners/staff manage their own org's
-- checklist; clients never touch it. Supabase grants API roles nothing on new
-- tables by default, so grant explicitly then let RLS narrow rows.

alter table public.org_onboarding_state enable row level security;

grant select, insert, update, delete
  on table public.org_onboarding_state to authenticated;
grant all on table public.org_onboarding_state to service_role;

create policy "staff full access to org onboarding state"
  on public.org_onboarding_state for all
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));
