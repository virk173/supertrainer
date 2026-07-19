-- Stage B conversational interview (Phase 2.5).
-- Creates three tables: the messages STUB (interview turns persist here so the
-- history carries into P6.1's real thread), interview_state, and plan_requests
-- (full schema — P4/P5 consume it).

-- ── messages (STUB — P6.1 extends with realtime, receipts, full kind enum) ────

create type public.message_sender as enum ('client', 'coach', 'system', 'assistant');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  sender public.message_sender not null,
  -- Free text for now; P6.1 replaces this with a full kind enum.
  kind text not null default 'text',
  body text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index messages_client_id_created_at_idx on public.messages (client_id, created_at);
create index messages_org_id_idx on public.messages (org_id);

-- ── interview_state (one row per client) ─────────────────────────────────────

create type public.interview_section
  as enum ('logistics', 'goals', 'nutrition', 'training', 'lifestyle', 'health');
create type public.interview_status
  as enum ('in_progress', 'paused_health', 'complete');

create table public.interview_state (
  client_id uuid primary key references public.clients (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  section public.interview_section not null default 'logistics',
  -- Accumulated typed answers, keyed by section.
  answers jsonb not null default '{}'::jsonb,
  status public.interview_status not null default 'in_progress',
  -- Drives the 24h-idle nudge (max 2) that Phase 6 sends.
  last_prompt_at timestamptz,
  nudges_sent integer not null default 0,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index interview_state_org_id_idx on public.interview_state (org_id);

create trigger set_interview_state_updated_at
  before update on public.interview_state
  for each row execute function public.set_updated_at();

-- ── plan_requests (full schema — P4/P5 consume; queued at intake_complete) ───

create type public.plan_kind as enum ('diet', 'split');
create type public.plan_trigger as enum ('onboarding', 'monthly', 'manual');
create type public.plan_request_status as enum ('queued', 'running', 'drafted', 'failed');

create table public.plan_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  kind public.plan_kind not null,
  trigger public.plan_trigger not null,
  status public.plan_request_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_requests_org_id_status_idx on public.plan_requests (org_id, status);
create index plan_requests_client_id_idx on public.plan_requests (client_id);

create trigger set_plan_requests_updated_at
  before update on public.plan_requests
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- messages / interview_state: staff read their org, a client reads only their
-- own. Writes are service-role — the interview action owns every turn (it also
-- writes health flags and intake, which clients must not control). P6.1 adds the
-- client-send grants when the real thread lands.
-- plan_requests: a staff-only work queue; clients never see it.

alter table public.messages enable row level security;
alter table public.interview_state enable row level security;
alter table public.plan_requests enable row level security;

grant select on table public.messages to authenticated;
grant select on table public.interview_state to authenticated;
grant select, insert, update, delete on table public.plan_requests to authenticated;
grant all on table public.messages, public.interview_state, public.plan_requests
  to service_role;

create policy "staff read org messages"
  on public.messages for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own messages"
  on public.messages for select
  to authenticated
  using (
    client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );

create policy "staff read org interview state"
  on public.interview_state for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own interview state"
  on public.interview_state for select
  to authenticated
  using (
    client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );

create policy "staff full access to org plan requests"
  on public.plan_requests for all
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));
