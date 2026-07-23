-- Phase 3.3 — the remaining client logging surfaces: weigh-ins, gym check-ins,
-- working sets, progress photos, and a manual steps/sleep wearable substitute.
-- Plus the splits_active stub (P5.3 fills it). Every surface must tolerate
-- offline use: the portal queues writes in IndexedDB and replays them on
-- reconnect, so each table carries a NATURAL KEY the write path upserts on —
-- a replayed write is an idempotent no-op, never a duplicate row.

create type public.weigh_in_method as enum ('prompt_reply', 'manual');
create type public.checkin_status as enum ('trained', 'rest', 'missed');
create type public.wearable_source as enum ('manual', 'healthkit', 'health_connect');
create type public.progress_pose as enum ('front', 'side', 'back');

-- ── weigh_ins (one per client per local day) ─────────────────────────────────
-- weight_kg is normalized to kg regardless of the client's kg/lb preference.
create table public.weigh_ins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  tz_date date not null,
  weight_kg numeric not null check (weight_kg > 0 and weight_kg < 700),
  method public.weigh_in_method not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, tz_date)
);
create index weigh_ins_client_id_tz_date_idx on public.weigh_ins (client_id, tz_date);
create index weigh_ins_org_id_idx on public.weigh_ins (org_id);

-- ── gym_checkins (one per client per local day) ──────────────────────────────
-- AUTO-SATISFIED to 'trained' in code when working sets exist for the day
-- (lib/ledger/checkin.ts) — the one-tap card is only for rest/missed days.
create table public.gym_checkins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  tz_date date not null,
  status public.checkin_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, tz_date)
);
create index gym_checkins_client_id_tz_date_idx on public.gym_checkins (client_id, tz_date);
create index gym_checkins_org_id_idx on public.gym_checkins (org_id);

-- ── splits_active (STUB — P5.3 fills it on split approval) ────────────────────
-- One current row per client; the workout screen pre-fills today's exercises
-- from schedule -> days. exercise_id in workout_logs is an unconstrained text id
-- sourced from here until P5.3 creates the exercises catalog + FK.
create table public.splits_active (
  client_id uuid primary key references public.clients (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  split_id uuid,
  -- day_key -> [{ exercise_id, name, target_sets, target_reps }]
  days jsonb not null default '{}'::jsonb,
  -- weekday (0-6) -> day_key
  schedule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index splits_active_org_id_idx on public.splits_active (org_id);

-- ── workout_logs (one row per set) ───────────────────────────────────────────
create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  tz_date date not null,
  -- unconstrained text until P5.3 adds the exercises catalog + FK.
  exercise_id text not null,
  exercise_name text not null,
  set_number integer not null check (set_number > 0),
  weight_kg numeric check (weight_kg is null or weight_kg >= 0),
  reps integer check (reps is null or reps >= 0),
  rpe numeric check (rpe is null or (rpe >= 1 and rpe <= 10)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, tz_date, exercise_id, set_number)
);
create index workout_logs_client_id_tz_date_idx on public.workout_logs (client_id, tz_date);
create index workout_logs_org_id_idx on public.workout_logs (org_id);

-- ── progress_photos (front/side/back) ────────────────────────────────────────
create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  tz_date date not null,
  pose public.progress_pose not null,
  path text not null,
  created_at timestamptz not null default now(),
  unique (client_id, tz_date, pose)
);
create index progress_photos_client_id_tz_date_idx on public.progress_photos (client_id, tz_date);
create index progress_photos_org_id_idx on public.progress_photos (org_id);

-- ── wearable_daily (manual steps/sleep now; P9.2 auto-fills) ──────────────────
create table public.wearable_daily (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  tz_date date not null,
  steps integer check (steps is null or steps >= 0),
  sleep_min integer check (sleep_min is null or sleep_min >= 0),
  source public.wearable_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, tz_date)
);
create index wearable_daily_client_id_tz_date_idx on public.wearable_daily (client_id, tz_date);
create index wearable_daily_org_id_idx on public.wearable_daily (org_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────
create trigger set_weigh_ins_updated_at before update on public.weigh_ins
  for each row execute function public.set_updated_at();
create trigger set_gym_checkins_updated_at before update on public.gym_checkins
  for each row execute function public.set_updated_at();
create trigger set_splits_active_updated_at before update on public.splits_active
  for each row execute function public.set_updated_at();
create trigger set_workout_logs_updated_at before update on public.workout_logs
  for each row execute function public.set_updated_at();
create trigger set_wearable_daily_updated_at before update on public.wearable_daily
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Same model as meal_logs (P3.2): a client reads only their own rows; their org
-- staff read the whole org; writes go through the service-role log actions
-- (which upsert on the natural key for offline-replay idempotency).
alter table public.weigh_ins enable row level security;
alter table public.gym_checkins enable row level security;
alter table public.splits_active enable row level security;
alter table public.workout_logs enable row level security;
alter table public.progress_photos enable row level security;
alter table public.wearable_daily enable row level security;

grant select on table public.weigh_ins, public.gym_checkins, public.splits_active,
  public.workout_logs, public.progress_photos, public.wearable_daily to authenticated;
grant all on table public.weigh_ins, public.gym_checkins, public.splits_active,
  public.workout_logs, public.progress_photos, public.wearable_daily to service_role;

-- staff-read-org + client-read-own, generated per table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'weigh_ins', 'gym_checkins', 'splits_active', 'workout_logs',
    'progress_photos', 'wearable_daily'
  ]
  loop
    execute format(
      'create policy "staff read org %1$s" on public.%1$s for select to authenticated using ((select public.is_org_staff(org_id)))',
      t
    );
    execute format(
      'create policy "clients read own %1$s" on public.%1$s for select to authenticated using (client_id in (select id from public.clients where profile_id = (select auth.uid())))',
      t
    );
  end loop;
end $$;

-- ── progress-photos storage bucket ───────────────────────────────────────────
-- Private; namespaced {org_id}/{client_id}/{file}. Client reads/writes own,
-- their org's staff read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos', 'progress-photos', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "clients read own progress photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[2] in (
      select id::text from public.clients where profile_id = (select auth.uid())
    )
  );
create policy "clients upload own progress photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'progress-photos'
    -- Whole path must be the caller's own {org_id}/{client_id} (see meal-photos).
    and exists (
      select 1 from public.clients
      where profile_id = (select auth.uid())
        and id::text = (storage.foldername(name))[2]
        and org_id::text = (storage.foldername(name))[1]
    )
  );
create policy "staff read own org progress photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and (select public.is_org_staff((((storage.foldername(name))[1])::uuid)))
  );
