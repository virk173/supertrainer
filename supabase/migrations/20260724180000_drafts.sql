-- Phase 6.4 — the drafted-reply queue. A conversational or plan-impact client
-- message produces a reply DRAFT in the trainer's voice; the trainer approves /
-- edits / rewrites / dismisses it (edits captured in draft_edits entity_type='reply'
-- for voice learning). Phase 7 builds the full inbox; 6.4 stores the drafts + a
-- minimal /trainer/queue.

create type public.draft_status as enum ('pending', 'approved', 'edited', 'rewritten', 'dismissed');

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- The triggering client message (kept even if the message is later gone).
  message_id uuid references public.messages (id) on delete set null,
  -- conversational | plan_impact (the two draft lanes).
  category text not null,
  draft_text text not null,
  -- The coded context the draft was assembled from (for the queue card + audit).
  context_snapshot jsonb not null default '{}'::jsonb,
  status public.draft_status not null default 'pending',
  created_at timestamptz not null default now(),
  actioned_at timestamptz
);

create index drafts_org_status_idx on public.drafts (org_id, status);
create index drafts_client_id_idx on public.drafts (client_id);
-- The SLA nudge scans still-pending drafts by age.
create index drafts_pending_idx on public.drafts (created_at) where status = 'pending';

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Trainer-only: staff read + update (approve/edit/dismiss) their org's drafts;
-- clients NEVER see the queue (no client policy). INSERTs are service-role (the
-- reply engine writes them; a client can't file a draft as their own coach).
alter table public.drafts enable row level security;

grant select, update on table public.drafts to authenticated;
grant all on table public.drafts to service_role;

create policy "staff read org drafts"
  on public.drafts for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "staff update org drafts"
  on public.drafts for update
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));
