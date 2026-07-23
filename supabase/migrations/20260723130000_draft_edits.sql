-- Phase 4.3 — draft_edits (the edit-capture learning loop) + the plans_active FK.
--
-- Every trainer edit to a draft (plan now; splits P5, replies P6 reuse this
-- table) is captured here. A nightly job distills patterns from these rows into
-- style_exemplars + style-profile proposals (the moat, MASTER-PLAN §4.2). Writes
-- are service-role (the edit action); staff read their own org's log.

create type public.draft_edit_entity as enum ('plan', 'split', 'reply');
create type public.draft_edit_kind as enum ('swap', 'resize', 'add', 'remove', 'structure', 'rewrite');

create table public.draft_edits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  entity_type public.draft_edit_entity not null,
  -- The edited entity's id (plan/split/message). Polymorphic → no FK.
  entity_id uuid not null,
  -- Dotted path within the entity's content, e.g.
  -- "versions.0.dayTypes.0.meals.1.items.0".
  path text not null,
  before jsonb,
  after jsonb,
  edit_kind public.draft_edit_kind not null,
  editor_id uuid references public.profiles (id) on delete set null,
  -- Nulled once the nightly job has folded this edit into the style profile.
  distilled_at timestamptz,
  created_at timestamptz not null default now()
);

create index draft_edits_org_id_entity_idx
  on public.draft_edits (org_id, entity_type, entity_id);
create index draft_edits_undistilled_idx
  on public.draft_edits (org_id) where distilled_at is null;

-- The plans_active.plan_id stub (P3.2) now references the real plans table.
alter table public.plans_active
  add constraint plans_active_plan_id_fkey
  foreign key (plan_id) references public.plans (id) on delete set null;

-- ── RLS + grants ─────────────────────────────────────────────────────────────
alter table public.draft_edits enable row level security;

grant select on table public.draft_edits to authenticated;
grant all on table public.draft_edits to service_role;

create policy "staff read org draft edits"
  on public.draft_edits for select
  to authenticated
  using ((select public.is_org_staff(org_id)));
