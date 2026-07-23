-- Phase 4.1 — the plans table.
--
-- A diet plan draft/version. The nutrition-engine (packages/nutrition-engine)
-- computes protocol + day_types (kcal/macros) in code; P4.2's recipe agents fill
-- `content` (the planned meals); the trainer reviews and approves (P4.3), which
-- upserts plans_active (the FK from plans_active.plan_id → plans.id is added in
-- P4.3). plan_requests (created in P2.5) drives generation; a produced draft is
-- linked from that queue by status, not a column here.
--
-- All writes are service-role: the pipeline creates drafts and the approve
-- action flips status, both server-side with org_id verified in code. API roles
-- get read-only — staff over their whole org (the review queue shows drafts),
-- clients only their own APPROVED plan (a draft is invisible until approved).

create type public.plan_status as enum ('draft', 'approved', 'superseded', 'archived');

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  version int not null default 1,
  status public.plan_status not null default 'draft',
  -- { type: standard | if_16_8 | carb_cycle, config } — from nutrition-engine.
  protocol jsonb not null default '{"type":"standard"}'::jsonb,
  -- [{ name, kcal, protein_g, carbs_g, fat_g, meal_slots }] per day type.
  day_types jsonb not null default '[]'::jsonb,
  -- The planned meals per day type — filled by P4.2 (empty on a fresh draft).
  content jsonb not null default '{}'::jsonb,
  rationale text,
  -- What triggered this plan; reuses plan_trigger (onboarding|monthly|manual).
  source public.plan_trigger not null,
  -- The plan this one adjusts (monthly loop, P4.4); null for a first plan.
  based_on_plan_id uuid references public.plans (id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plans_org_id_idx on public.plans (org_id);
create index plans_client_id_status_idx on public.plans (client_id, status);

create trigger set_plans_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Grant only SELECT to API roles (no insert/delete grant → no privilege for a
-- write policy to attach to); service_role bypasses RLS for the pipeline writes.
alter table public.plans enable row level security;

grant select on table public.plans to authenticated;
grant all on table public.plans to service_role;

create policy "staff read org plans"
  on public.plans for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own approved plans"
  on public.plans for select
  to authenticated
  using (
    status = 'approved'
    and client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );
