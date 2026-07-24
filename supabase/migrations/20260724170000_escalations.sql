-- Phase 6.3 — the escalation queue. When the fail-closed router flags a client
-- message (injury/medical/distress/self-harm/plan-change), an urgent item is
-- recorded here for the trainer to handle personally (the AI never coaches around
-- it). Phase 7 builds the queue UI on top of this table; 6.3 writes the data +
-- the client's holding line / crisis card (in `messages`).

create type public.escalation_status as enum ('open', 'acknowledged', 'resolved');

create table public.escalations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- The triggering client message (nullable — kept even if the message is gone).
  message_id uuid references public.messages (id) on delete set null,
  categories text[] not null default '{}',
  self_harm boolean not null default false,
  plan_change boolean not null default false,
  -- What tripped the gate: keyword | classifier | both.
  source text not null,
  -- A bounded excerpt of the triggering message (the queue shows context).
  excerpt text,
  status public.escalation_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index escalations_org_status_idx on public.escalations (org_id, status);
create index escalations_client_id_idx on public.escalations (client_id);

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- A trainer-only queue: staff read + update (ack/resolve) their org's items;
-- clients NEVER see it (there is deliberately no client policy). All INSERTs go
-- through the service role (the send path writes them; a client can't self-file).
alter table public.escalations enable row level security;

grant select, update on table public.escalations to authenticated;
grant all on table public.escalations to service_role;

create policy "staff read org escalations"
  on public.escalations for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "staff update org escalations"
  on public.escalations for update
  to authenticated
  using ((select public.is_org_staff(org_id)))
  with check ((select public.is_org_staff(org_id)));
