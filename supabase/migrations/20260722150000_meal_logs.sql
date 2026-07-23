-- Phase 3.2 — Meal logging (text / photo / voice) + the plans_active stub.
--
-- Every logging surface writes verified-DB numbers only: the model parses free
-- text (or a photo) into item names + portions, code resolves them against the
-- foods table (searchFoods) and computes macros from per-100g values — no LLM
-- arithmetic (CLAUDE.md rule 4). Writes go through server actions (service-role,
-- ownership-verified in code), matching the messages/interview model; API roles
-- get read-only, scoped to their org (staff) or their own client (portal).

create type public.meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack', 'other');
create type public.meal_log_method as enum ('text', 'photo', 'voice');

create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  logged_at timestamptz not null default now(),
  -- The client-local calendar date (computed from profiles.timezone). The whole
  -- ledger is bucketed by this, so day-close (P3.4) is timezone-correct.
  tz_date date not null,
  meal_slot public.meal_slot not null,
  -- [{ food_id|null, name, qty, unit, grams, kcal|null, protein, carbs, fat,
  --    fiber, verified, matched_via }]. Unverified freeform items carry a null
  --  food_id + null kcal and are flagged in the trainer lens.
  items jsonb not null default '[]'::jsonb,
  -- { kcal, protein, carbs, fat, fiber } — computed in code from items.
  totals jsonb not null default '{}'::jsonb,
  method public.meal_log_method not null,
  -- meal-photos object path ({org_id}/{client_id}/{uuid}); null for text/voice.
  photo_path text,
  confirmed boolean not null default true,
  raw_input text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meal_logs_client_id_tz_date_idx on public.meal_logs (client_id, tz_date);
create index meal_logs_org_id_idx on public.meal_logs (org_id);

create trigger set_meal_logs_updated_at
  before update on public.meal_logs
  for each row execute function public.set_updated_at();

-- ── plans_active (STUB — P4.3 fills it on plan approval) ──────────────────────
-- One current row per client. The confirm card reads targets/meal_slots/
-- fast_window from here when a row exists ("against today's targets"); clients
-- with no active plan log in generic mode. Written service-role by P4.3.
create table public.plans_active (
  client_id uuid primary key references public.clients (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- FK to plans(id) added in P4.3 (that table doesn't exist yet).
  plan_id uuid,
  day_types jsonb not null default '{}'::jsonb,
  -- weekday (0-6) -> day_type key.
  schedule jsonb not null default '{}'::jsonb,
  -- expected meal slots for a normal day, e.g. ["breakfast","lunch","dinner"].
  meal_slots jsonb not null default '[]'::jsonb,
  -- per-day-type macro targets, e.g. {"training":{"kcal":2200,...}}.
  targets jsonb not null default '{}'::jsonb,
  -- optional eating window, e.g. {"start":"12:00","end":"20:00"}.
  fast_window jsonb,
  effective_from date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plans_active_org_id_idx on public.plans_active (org_id);

create trigger set_plans_active_updated_at
  before update on public.plans_active
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
alter table public.meal_logs enable row level security;
alter table public.plans_active enable row level security;

grant select on table public.meal_logs to authenticated;
grant select on table public.plans_active to authenticated;
grant all on table public.meal_logs, public.plans_active to service_role;

create policy "staff read org meal logs"
  on public.meal_logs for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own meal logs"
  on public.meal_logs for select
  to authenticated
  using (
    client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );

create policy "staff read org plans_active"
  on public.plans_active for select
  to authenticated
  using ((select public.is_org_staff(org_id)));

create policy "clients read own plans_active"
  on public.plans_active for select
  to authenticated
  using (
    client_id in (
      select id from public.clients where profile_id = (select auth.uid())
    )
  );

-- ── meal-photos storage bucket ───────────────────────────────────────────────
-- Private. Objects are namespaced {org_id}/{client_id}/{file}: a client reads/
-- writes only their own path; their org's staff (the trainer) can read them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  false,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "clients read own meal photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[2] in (
      select id::text from public.clients where profile_id = (select auth.uid())
    )
  );

create policy "clients upload own meal photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[2] in (
      select id::text from public.clients where profile_id = (select auth.uid())
    )
  );

create policy "staff read own org meal photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (select public.is_org_staff((((storage.foldername(name))[1])::uuid)))
  );
