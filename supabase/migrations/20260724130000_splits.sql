-- Phase 5.2 — the splits table (training-split draft/version).
--
-- The training-side mirror of `plans` (P4.1). The training-engine
-- (packages/training-engine) computes volume/balance in code; P5.2's selection
-- agents fill `days` (the prescribed exercises, ids constrained to the injury-
-- safe pool); the trainer reviews and approves (P5.3), which upserts splits_active
-- (P3.3 stub). plan_requests (kind='split') drives generation.
--
-- All writes are service-role: the pipeline creates drafts and the approve
-- action flips status, both server-side with org_id verified in code. API roles
-- get read-only — staff over their whole org (the review queue shows drafts),
-- clients only their own APPROVED split (a draft is invisible until approved).

create type public.split_status as enum ('draft', 'approved', 'superseded', 'archived');

create table public.splits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  version int not null default 1,
  status public.split_status not null default 'draft',
  -- [{ label, exercises: [{ exercise_id, sets, reps, rir, tips, video_ref }], warmup }]
  -- per training day — filled by P5.2 (empty on a fresh draft).
  days jsonb not null default '[]'::jsonb,
  -- weekday (0-6, as string keys) -> day label; a weekday absent = rest day.
  schedule jsonb not null default '{}'::jsonb,
  -- Draft metadata the review surface (P5.3) reads: { critique, report,
  -- needsAttention, autofilled, warnings, weeklyVolume, balance }. needsAttention
  -- is a draft sub-state (the status enum has no such value).
  meta jsonb not null default '{}'::jsonb,
  rationale text,
  -- What triggered this split; reuses plan_trigger (onboarding|monthly|manual).
  source public.plan_trigger not null,
  -- The split this one progresses from (monthly loop, P5.4); null for a first split.
  based_on_split_id uuid references public.splits (id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index splits_org_id_idx on public.splits (org_id);
create index splits_client_id_status_idx on public.splits (client_id, status);

create trigger set_splits_updated_at
  before update on public.splits
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Grant only SELECT to API roles (no insert/delete grant → no privilege for a
-- write policy to attach to); service_role bypasses RLS for the pipeline writes.
alter table public.splits enable row level security;

grant select on table public.splits to authenticated;
grant all on table public.splits to service_role;

create policy "staff read org splits"
  on public.splits for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own approved splits"
  on public.splits for select
  to authenticated
  using (
    status = 'approved'
    and client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );
