-- Phase 5.1 — Exercise catalog + video library + FTS search.
--
-- The exercise foundation the split designer (P5.2) selects from and the client
-- session player (P5.4) renders. Rows with org_id IS NULL are GLOBAL platform
-- exercises (the free-exercise-db seed, generated in the companion migration);
-- every org reads them. Rows with a non-null org_id are that org's custom
-- exercises (source='org_custom', a later library-manager surface). This also
-- gives workout_logs.exercise_id a real catalog to FK against — that FK lands in
-- P5.3 once approved splits reference catalog ids (the logging_surfaces stub
-- kept exercise_id as free text until this catalog exists).
--
-- movement_patterns is the coded-validation vocabulary (P5.2 volume/balance
-- rules + P5.1 injury exclusions in packages/ai/injury-exclusions.ts) — it is
-- assigned deterministically at seed time by packages/db/scripts/classify-movement.ts
-- (+ a manual-override file for ambiguous lifts), never by the model.
--
-- Hosted-extension rule (CLAUDE.md): the Supabase CLI pre-enables extensions
-- locally but a fresh hosted DB does not — pg_trgm is created explicitly INTO
-- the extensions schema and referenced schema-qualified, or `supabase db push`
-- fails in prod.

create extension if not exists pg_trgm with schema extensions;

create type public.exercise_source as enum ('feb', 'org_custom');
create type public.movement_pattern as enum (
  'squat', 'hinge', 'lunge', 'push_h', 'push_v',
  'pull_h', 'pull_v', 'carry', 'core', 'isolation'
);
-- Ordered least→most demanding so `experience_min <= p_max_experience` works as
-- an enum comparison (Postgres orders enums by declaration position).
create type public.experience_level as enum ('beginner', 'intermediate', 'advanced');

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  -- null = global platform exercise (the seed); set for org-custom exercises.
  org_id uuid references public.orgs (id) on delete cascade,
  source public.exercise_source not null,
  -- free-exercise-db id (or an org-side ref) for provenance / de-dup.
  source_ref text,
  name text not null,
  name_normalized text not null,
  aliases text[] not null default '{}',
  -- Normalized muscle taxonomy (packages/db/scripts/classify-movement.ts).
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  -- The coded-validation vocabulary; see the movement_pattern enum.
  movement_patterns public.movement_pattern[] not null default '{}',
  -- Normalized equipment tokens (barbell|dumbbell|bodyweight|machine|cable|…).
  equipment text[] not null default '{}',
  experience_min public.experience_level not null default 'beginner',
  -- push|pull|static — a direct balance signal for the P5.2 validator, kept
  -- alongside the richer movement_patterns.
  force text,
  -- Source-relative demo image paths (free-exercise-db bundles CC0 images;
  -- byte-upload to our Storage rides with the P5.3 video library).
  image_paths text[] not null default '{}',
  instructions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exercises_name_normalized_idx on public.exercises (name_normalized);
create index exercises_org_id_idx on public.exercises (org_id) where org_id is not null;
create index exercises_movement_patterns_idx
  on public.exercises using gin (movement_patterns);
create index exercises_primary_muscles_idx
  on public.exercises using gin (primary_muscles);
create index exercises_equipment_idx
  on public.exercises using gin (equipment);
-- Trigram + FTS for search_exercises (typeahead + fuzzy).
create index exercises_name_trgm_idx
  on public.exercises using gin (name_normalized extensions.gin_trgm_ops);
create index exercises_name_fts_idx
  on public.exercises using gin (to_tsvector('simple', name));
-- Natural key for the global seed so re-application is idempotent.
create unique index exercises_global_key
  on public.exercises (name_normalized, source)
  where org_id is null;

create trigger set_exercises_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

-- ── exercise_videos ──────────────────────────────────────────────────────────
-- Demo videos per exercise. org_id NULL = a platform default (every org sees
-- it); a non-null org_id row is that org's OVERRIDE, which wins at render time
-- (the trainer's own coaching demo beats the stock clip). One video per
-- (exercise, org) — NULLS NOT DISTINCT so an exercise has at most one platform
-- default too. Uploads land in the exercise-videos bucket (P5.3); YouTube rows
-- carry the privacy-enhanced embed id.
create type public.exercise_video_kind as enum ('upload', 'youtube');

create table public.exercise_videos (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  -- null = platform default; non-null = that org's override.
  org_id uuid references public.orgs (id) on delete cascade,
  kind public.exercise_video_kind not null,
  storage_path text,
  youtube_id text,
  cue_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly the payload for the kind: an upload has a path, a youtube has an id.
  constraint exercise_videos_payload check (
    (kind = 'upload' and storage_path is not null and youtube_id is null)
    or (kind = 'youtube' and youtube_id is not null and storage_path is null)
  )
);

create unique index exercise_videos_one_per_org
  on public.exercise_videos (exercise_id, org_id) nulls not distinct;
create index exercise_videos_exercise_id_idx
  on public.exercise_videos (exercise_id);
create index exercise_videos_org_id_idx
  on public.exercise_videos (org_id) where org_id is not null;

create trigger set_exercise_videos_updated_at
  before update on public.exercise_videos
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
-- Global exercises/videos: readable by every authenticated user. Org-custom
-- rows: readable by that org's staff AND that org's clients (the client session
-- player renders exercises assigned in their split). Writes are service-role
-- only in P5.1 (the seed script + the P5.3 library-manager action); Supabase
-- grants API roles nothing by default, so grant SELECT explicitly then let RLS
-- narrow rows.
alter table public.exercises enable row level security;
alter table public.exercise_videos enable row level security;

grant select on table public.exercises, public.exercise_videos to authenticated;
grant all on table public.exercises, public.exercise_videos to service_role;

create policy "read global exercises"
  on public.exercises for select
  to authenticated
  using (org_id is null);

create policy "staff read org exercises"
  on public.exercises for select
  to authenticated
  using (org_id is not null and (select public.is_org_staff(org_id)));

create policy "clients read own org exercises"
  on public.exercises for select
  to authenticated
  using (
    org_id is not null
    and org_id in (
      select org_id from public.clients where profile_id = (select auth.uid())
    )
  );

create policy "read platform default videos"
  on public.exercise_videos for select
  to authenticated
  using (org_id is null);

create policy "staff read org videos"
  on public.exercise_videos for select
  to authenticated
  using (org_id is not null and (select public.is_org_staff(org_id)));

create policy "clients read own org videos"
  on public.exercise_videos for select
  to authenticated
  using (
    org_id is not null
    and org_id in (
      select org_id from public.clients where profile_id = (select auth.uid())
    )
  );

-- ── search_exercises(query, org, filters, limit) ─────────────────────────────
-- The typeahead + pool browser used by the trainer review surface (P5.3) and the
-- pool compiler's browse path. When p_query is blank it becomes a pure FILTER
-- browse (all rows matching the equipment/pattern/muscle/experience filters,
-- name-ordered) — the compiler needs "every squat-pattern barbell exercise the
-- client can do", not a text match. When p_query is present it ranks exact >
-- prefix > alias > full-text > trigram fuzzy, filters applied on top.
--
-- Filters are ANY-overlap (p_equipment/p_patterns/p_muscles) except experience,
-- which is a ceiling (experience_min <= p_max_experience). A null filter is
-- "don't filter on this".
--
-- SECURITY INVOKER: RLS decides visibility, so an authenticated caller sees
-- globals + only their org's customs. Service-role callers bypass RLS, so they
-- MUST pass p_org to scope org-customs; p_org defaults to the caller's JWT org.
create or replace function public.search_exercises(
  p_query text default null,
  p_org uuid default null,
  p_equipment text[] default null,
  p_patterns public.movement_pattern[] default null,
  p_muscles text[] default null,
  p_max_experience public.experience_level default null,
  p_limit int default 20
)
returns table (
  id uuid,
  org_id uuid,
  source public.exercise_source,
  name text,
  name_normalized text,
  aliases text[],
  primary_muscles text[],
  secondary_muscles text[],
  movement_patterns public.movement_pattern[],
  equipment text[],
  experience_min public.experience_level,
  force text,
  image_paths text[],
  instructions text[],
  score real,
  matched_via text
)
language sql
stable
security invoker
set search_path = extensions, public, pg_temp
as $$
  with q as (
    select
      lower(btrim(coalesce(p_query, ''))) as term,
      coalesce(p_org, public.jwt_org_id()) as org
  ),
  scored as (
    select
      e.*,
      case
        when (select term from q) = '' then 5
        when e.name_normalized = (select term from q) then 0
        when e.name_normalized like (select term from q) || '%' then 1
        when (select term from q) = any(
          select lower(a) from unnest(e.aliases) a
        ) then 1
        when to_tsvector('simple', e.name)
             @@ plainto_tsquery('simple', (select term from q)) then 2
        when e.name_normalized % (select term from q) then 3
        else 9
      end as rank,
      case
        when (select term from q) = '' then 0
        else similarity(e.name_normalized, (select term from q))
      end as sim,
      (e.org_id is not null) as is_org_custom
    from public.exercises e, q
    where
      -- Belt-and-suspenders org scope (service-role bypasses RLS): globals
      -- always visible; org-customs only for q.org.
      (e.org_id is null or e.org_id = q.org)
      -- Filters (null = don't filter). ANY-overlap for arrays; experience ceiling.
      and (p_equipment is null or e.equipment && p_equipment)
      and (p_patterns is null or e.movement_patterns && p_patterns)
      and (p_muscles is null or e.primary_muscles && p_muscles)
      and (p_max_experience is null or e.experience_min <= p_max_experience)
      -- Text match (only when a query is present; blank query = filter browse).
      and (
        q.term = ''
        or e.name_normalized = q.term
        or e.name_normalized like q.term || '%'
        or q.term = any(select lower(a) from unnest(e.aliases) a)
        or to_tsvector('simple', e.name) @@ plainto_tsquery('simple', q.term)
        or e.name_normalized % q.term
      )
  )
  select
    s.id, s.org_id, s.source, s.name, s.name_normalized, s.aliases,
    s.primary_muscles, s.secondary_muscles, s.movement_patterns, s.equipment,
    s.experience_min, s.force, s.image_paths, s.instructions,
    s.sim::real as score,
    case s.rank
      when 0 then 'exact'
      when 1 then 'prefix_or_alias'
      when 2 then 'fulltext'
      when 3 then 'trigram'
      else 'filter'
    end as matched_via
  from scored s
  where s.rank < 9
  order by
    s.rank asc,
    -- An org's own exercise outranks a global at the same match quality.
    s.is_org_custom desc,
    s.sim desc,
    s.name asc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

grant execute on function public.search_exercises(
  text, uuid, text[], public.movement_pattern[], text[], public.experience_level, int
) to authenticated, service_role;
