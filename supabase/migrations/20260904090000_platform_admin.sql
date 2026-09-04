-- Phase 9.3 — the platform console's own schema.
--
-- Everything here is PLATFORM-internal: the operators of supertrainer, not the
-- trainers who use it. So the rule for every table below is the strictest one we
-- have — RLS on, and NO grant to anon/authenticated at all. The only way in is
-- the service role behind the /admin guard (platform_admins + a live WebAuthn
-- elevation). An API role holding a valid trainer JWT must not be able to read a
-- single row of any of it; the pgTAP suite pins exactly that.

-- ── who may operate the platform ─────────────────────────────────────────────
create table public.platform_admins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_platform_admins_updated_at
  before update on public.platform_admins
  for each row execute function public.set_updated_at();

alter table public.platform_admins enable row level security;
grant all on table public.platform_admins to service_role;

-- ── hardware keys (WebAuthn) ─────────────────────────────────────────────────
-- A password (or a magic link to a mailbox) is not enough to hold the keys to
-- every org's data. /admin requires a physical authenticator, and the counter is
-- persisted so a cloned credential replaying an old signature is rejected.
create table public.admin_credentials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- base64url credential id from the authenticator
  credential_id text not null unique,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_type text,
  backed_up boolean not null default false,
  nickname text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index admin_credentials_profile_id_idx on public.admin_credentials (profile_id);

create trigger set_admin_credentials_updated_at
  before update on public.admin_credentials
  for each row execute function public.set_updated_at();

alter table public.admin_credentials enable row level security;
grant all on table public.admin_credentials to service_role;

-- One-shot challenges. Short-lived and single-use: consumed on verify, swept on
-- expiry, so a captured challenge is worth nothing a minute later.
create table public.admin_challenges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  challenge text not null,
  kind text not null check (kind in ('register', 'authenticate')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index admin_challenges_profile_id_idx on public.admin_challenges (profile_id, created_at desc);

alter table public.admin_challenges enable row level security;
grant all on table public.admin_challenges to service_role;

-- An elevation is the proof of a successful assertion. It expires on its own
-- (30 minutes), so walking away from a laptop closes the console.
create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  credential_id uuid references public.admin_credentials (id) on delete set null,
  elevated_until timestamptz not null,
  ip text,
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index admin_sessions_profile_id_idx on public.admin_sessions (profile_id, created_at desc);

alter table public.admin_sessions enable row level security;
grant all on table public.admin_sessions to service_role;

-- ── read-only impersonation ("view as") ──────────────────────────────────────
-- Support sometimes has to see what the trainer sees. Every such view opens a
-- row here first: who looked, at which org, why, and for how long. The banner in
-- the UI reads from it, and it is never deleted while the org lives.
create table public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  reason text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index impersonation_sessions_org_id_idx on public.impersonation_sessions (org_id, started_at desc);

alter table public.impersonation_sessions enable row level security;
grant all on table public.impersonation_sessions to service_role;

-- ── AI spend ledger (MASTER-PLAN §4.3 budget meter) ──────────────────────────
-- Langfuse is the trace store; this is the MARGIN meter, and it has to live in
-- our own DB because it gates behaviour (throttling) rather than dashboards.
-- Cost is computed in code from the model's published price and the token counts
-- the API returns — never estimated by a model (standing rule 4).
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs (id) on delete cascade,
  task text,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  -- millionths of a dollar: integer money, no floats anywhere near the ledger
  cost_micros bigint not null default 0,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index ai_usage_org_id_occurred_at_idx on public.ai_usage (org_id, occurred_at desc);
create index ai_usage_occurred_at_idx on public.ai_usage (occurred_at desc);

alter table public.ai_usage enable row level security;
grant all on table public.ai_usage to service_role;

-- The soft cap and the throttle it triggers live on the org itself.
alter table public.orgs
  add column if not exists ai_budget_micros bigint,
  add column if not exists ai_throttled_at timestamptz;

comment on column public.orgs.ai_budget_micros is
  'Phase 9.3 — soft monthly AI spend cap in millionths of a dollar; null = platform default.';
comment on column public.orgs.ai_throttled_at is
  'Phase 9.3 — set when an org crossed its cap and non-urgent AI was put in batch-only mode.';

-- ── feature flags ────────────────────────────────────────────────────────────
-- Every rollout from here on goes through flag(org_id, key): a default, a
-- percentage ramp, and a per-org override that always wins.
create table public.feature_flags (
  key text primary key,
  description text not null default '',
  enabled_default boolean not null default false,
  -- deterministic ramp: hash(org_id + key) % 100 < rollout_percent
  rollout_percent smallint not null default 0 check (rollout_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_feature_flags_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();

alter table public.feature_flags enable row level security;
grant all on table public.feature_flags to service_role;

create table public.feature_flag_overrides (
  flag_key text not null references public.feature_flags (key) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  enabled boolean not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (flag_key, org_id)
);

create index feature_flag_overrides_org_id_idx on public.feature_flag_overrides (org_id);

create trigger set_feature_flag_overrides_updated_at
  before update on public.feature_flag_overrides
  for each row execute function public.set_updated_at();

alter table public.feature_flag_overrides enable row level security;
grant all on table public.feature_flag_overrides to service_role;

-- ── incidents + maintenance ──────────────────────────────────────────────────
-- When something is wrong, saying so beats letting people discover it. A
-- published incident renders a banner; maintenance_mode additionally closes
-- write paths for the surfaces it names.
create type public.incident_severity as enum ('info', 'warning', 'critical');
create type public.incident_surface as enum ('portal', 'dashboard', 'both');

create table public.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  severity public.incident_severity not null default 'info',
  surface public.incident_surface not null default 'both',
  maintenance_mode boolean not null default false,
  published boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index platform_incidents_live_idx on public.platform_incidents (starts_at desc)
  where published;

create trigger set_platform_incidents_updated_at
  before update on public.platform_incidents
  for each row execute function public.set_updated_at();

alter table public.platform_incidents enable row level security;
grant all on table public.platform_incidents to service_role;

-- ── what an org actually pays us ─────────────────────────────────────────────
-- Platform billing (the base fee by seat band) is enrolled in P8.6 but not yet
-- priced through Stripe. The console reports platform MRR from THIS column and
-- shows the rest as "price not synced" rather than inventing a number: a
-- business metric that quietly guesses is worse than one that admits a gap.
alter table public.platform_subscriptions
  add column if not exists price_cents integer,
  add column if not exists currency text not null default 'usd';

comment on column public.platform_subscriptions.price_cents is
  'Phase 9.3 — the base fee this org is billed per month, synced from Stripe. Null = not yet priced (trial or pre-billing).';

-- ── the console's own audit trail ────────────────────────────────────────────
-- audit_log is org-scoped (a trainer can read their own history — that is the
-- point of it). Platform-wide acts have no org, and writing them into some
-- unrelated org's log would be both wrong and confusing. They land here instead.
create table public.platform_audit (
  id bigint generated always as identity primary key,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index platform_audit_created_at_idx on public.platform_audit (created_at desc);

alter table public.platform_audit enable row level security;
grant all on table public.platform_audit to service_role;
