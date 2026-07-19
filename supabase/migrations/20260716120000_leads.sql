-- Stage A teaser leads (Phase 2.1). A lead is a pre-signup prospect who filled
-- the public teaser intake at /c/{slug}/start. It converts into a client on
-- signup (Phase 2.2). Public writes happen ONLY through the submit server
-- action (service role) — anon/authenticated get no INSERT path — so a shared
-- teaser link can't be used to write arbitrary rows. Trainers read their own
-- org's leads; the sliding-window rate limits (per-email/week, per-org/day) are
-- computed from created_at on this table (no separate counter table).

create type public.lead_status
  as enum ('started', 'preview_shown', 'converted', 'expired');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null,
  phone text,
  -- the Stage A questionnaire minus the promoted columns (name, age, sex,
  -- height, weight, goal, activity, training days, experience, diet preference)
  answers jsonb not null default '{}'::jsonb,
  -- Allergens are safety-critical and drive the preview allergen block (P2.2),
  -- so they are a first-class column, never buried in answers. NOT NULL with a
  -- '{}' default: an empty array means the prospect explicitly selected "none"
  -- (the form forces that choice — it is never a silent default).
  allergens text[] not null default '{}',
  status public.lead_status not null default 'started',
  -- Whether Cloudflare Turnstile verified this submission. False when Turnstile
  -- is unconfigured (dev/preview) — the submit action still records the source.
  turnstile_verified boolean not null default false,
  -- Set when a lead converts to a client (Phase 2.2 links them).
  converted_client_id uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Weekly per-email limit and daily per-org limit both slide on created_at.
create index leads_org_id_created_at_idx on public.leads (org_id, created_at);
create index leads_org_id_email_created_at_idx
  on public.leads (org_id, email, created_at);

create trigger set_leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Read-only for trainers over their own org; NO write grant for API roles —
-- every insert/update flows through the submit action's service-role client.
-- Supabase grants API roles nothing on new tables by default, so grant SELECT
-- explicitly then let RLS narrow to the caller's org.

alter table public.leads enable row level security;

grant select on table public.leads to authenticated;
grant all on table public.leads to service_role;

create policy "staff read own org leads"
  on public.leads for select
  to authenticated
  using ((select public.is_org_staff(org_id)));
