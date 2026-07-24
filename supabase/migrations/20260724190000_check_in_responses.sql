-- Phase 6.5 — smart check-in cards. The card picker delivers a card into the
-- thread (a `messages` row kind='card'); the client's tap-answer is recorded here
-- and surfaces in the trainer lens. One row per answered card.

create table public.check_in_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- The delivered card message this answers.
  message_id uuid references public.messages (id) on delete set null,
  card_id text not null,
  card_version integer not null default 1,
  card_kind text not null,
  -- The tap-answer, e.g. {"value": 4} for a 1–5 scale or {"choice": "travelling"}.
  answer jsonb not null default '{}'::jsonb,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index check_in_responses_client_id_idx on public.check_in_responses (client_id, answered_at);
create index check_in_responses_org_id_idx on public.check_in_responses (org_id);

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Client reads their own responses, staff read their org's (the trainer lens);
-- writes are service-role (the answer server action verifies the session client),
-- mirroring the ledger surfaces.
alter table public.check_in_responses enable row level security;

grant select on table public.check_in_responses to authenticated;
grant all on table public.check_in_responses to service_role;

create policy "clients read own check-in responses"
  on public.check_in_responses for select
  to authenticated
  using (client_id in (select id from public.clients where profile_id = (select auth.uid())));

create policy "staff read org check-in responses"
  on public.check_in_responses for select
  to authenticated
  using ((select public.is_org_staff(org_id)));
