-- Phase 3.1 — Verified nutrition database: search infrastructure.
--
-- Adds the pieces text/voice meal logging (P3.2) needs to turn "2 rotis, dal"
-- into food rows fast:
--   1. a trigram + full-text index on foods.name so fuzzy/typo'd queries resolve
--   2. food_aliases (regional + colloquial names, e.g. "chawal" -> White rice)
--   3. search_foods(query, locale) — one indexed round-trip, FTS + alias + trigram
--      fallback, ranked; targets <50ms on 20k rows.
--
-- Hosted-extension rule (see supabase/migrations/…rls_policies.sql pattern and
-- CLAUDE.md): the Supabase CLI pre-enables extensions locally, but the hosted DB
-- does not — every extension must be created explicitly INTO the `extensions`
-- schema and referenced schema-qualified, or `supabase db push` fails in prod.

create extension if not exists pg_trgm with schema extensions;

-- ── foods search indexes ─────────────────────────────────────────────────────
-- Trigram GIN powers similarity()/`%` fuzzy matching (typos, partial words).
-- gin_trgm_ops lives in the extensions schema.
create index if not exists foods_name_trgm_idx
  on public.foods using gin (name_normalized extensions.gin_trgm_ops);

-- Full-text GIN for word-boundary matches ("rice" hits "White rice, cooked").
-- 'simple' config: no stemming/stop-words — right for a multilingual food list
-- where "dal"/"idli" must never be stemmed away.
create index if not exists foods_name_fts_idx
  on public.foods using gin (to_tsvector('simple', name));

-- ── food_aliases ─────────────────────────────────────────────────────────────
-- Alternate names for a food: regional ("chawal" -> rice), colloquial
-- ("chana" -> chickpeas), and common log phrasings ("roti" -> Roti (whole wheat)).
-- Visibility mirrors the parent food (global vs org-custom) via RLS.
create table public.food_aliases (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods (id) on delete cascade,
  alias text not null,
  alias_normalized text not null,
  -- BCP-47-ish tag or cuisine hint ('en', 'hi', 'in'); null = universal.
  locale text,
  created_at timestamptz not null default now()
);

-- One alias per (food, spelling, locale); makes seed re-application idempotent.
create unique index food_aliases_unique
  on public.food_aliases (food_id, alias_normalized, coalesce(locale, ''));
create index food_aliases_food_id_idx on public.food_aliases (food_id);
create index food_aliases_alias_trgm_idx
  on public.food_aliases using gin (alias_normalized extensions.gin_trgm_ops);

alter table public.food_aliases enable row level security;

-- Supabase grants API roles nothing by default. Reads for every authenticated
-- user (RLS narrows to visible foods); writes for org staff on their OWN
-- org-custom foods' aliases only; service_role for the seed/import scripts.
grant select on table public.food_aliases to authenticated;
grant insert, update, delete on table public.food_aliases to authenticated;
grant all on table public.food_aliases to service_role;

-- Read an alias iff its parent food is readable (foods RLS decides that — the
-- exists() subquery is itself RLS-filtered, so global aliases are universal and
-- org-custom aliases stay org-private).
create policy "read aliases of visible foods"
  on public.food_aliases for select
  to authenticated
  using (
    exists (
      select 1 from public.foods f
      where f.id = food_aliases.food_id
        and (f.org_id is null or (select public.is_org_staff(f.org_id)))
    )
  );

-- Org staff may add/edit/remove aliases only for their own org-custom foods.
create policy "org staff write aliases of own custom foods"
  on public.food_aliases for insert
  to authenticated
  with check (
    exists (
      select 1 from public.foods f
      where f.id = food_aliases.food_id
        and f.org_id = (select public.jwt_org_id())
        and f.source = 'org_custom'
    )
  );

create policy "org staff update aliases of own custom foods"
  on public.food_aliases for update
  to authenticated
  using (
    exists (
      select 1 from public.foods f
      where f.id = food_aliases.food_id
        and f.org_id = (select public.jwt_org_id())
        and f.source = 'org_custom'
    )
  )
  with check (
    exists (
      select 1 from public.foods f
      where f.id = food_aliases.food_id
        and f.org_id = (select public.jwt_org_id())
        and f.source = 'org_custom'
    )
  );

create policy "org staff delete aliases of own custom foods"
  on public.food_aliases for delete
  to authenticated
  using (
    exists (
      select 1 from public.foods f
      where f.id = food_aliases.food_id
        and f.org_id = (select public.jwt_org_id())
        and f.source = 'org_custom'
    )
  );

-- ── search_foods(query, locale, org, limit) ──────────────────────────────────
-- Ranked resolver used by the meal-logging parse step (P3.2). Returns visible
-- foods matching the query by, in priority order: exact name, name prefix,
-- exact alias, full-text, then trigram fuzzy (name or alias). Locale (a cuisine
-- hint like 'indian') only breaks ties — never filters results out.
--
-- SECURITY INVOKER (default): RLS on foods/food_aliases decides visibility, so
-- an authenticated caller sees globals + only their org's customs automatically.
-- Service-role callers bypass RLS, so they MUST pass p_org to scope org-customs;
-- p_org defaults to the caller's JWT org. search_path pins extensions so `%` and
-- similarity() resolve without per-call qualification.
create or replace function public.search_foods(
  p_query text,
  p_locale text default null,
  p_org uuid default null,
  p_limit int default 20
)
returns table (
  id uuid,
  org_id uuid,
  source public.food_source,
  name text,
  name_normalized text,
  cuisine_tags text[],
  allergen_tags text[],
  serving_units jsonb,
  kcal_per_100g numeric,
  protein_per_100g numeric,
  carbs_per_100g numeric,
  fat_per_100g numeric,
  fiber_per_100g numeric,
  verified boolean,
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
      lower(btrim(p_query)) as term,
      coalesce(p_org, public.jwt_org_id()) as org
  ),
  -- Every visible food scored against the query; lower rank = better match.
  scored as (
    select
      f.*,
      case
        when f.name_normalized = q.term then 0
        when f.name_normalized like q.term || '%' then 1
        when exists (
          select 1 from public.food_aliases a
          where a.food_id = f.id and a.alias_normalized = q.term
        ) then 1
        when to_tsvector('simple', f.name) @@ plainto_tsquery('simple', q.term) then 2
        when f.name_normalized % q.term then 3
        when exists (
          select 1 from public.food_aliases a
          where a.food_id = f.id and a.alias_normalized % q.term
        ) then 3
        else 9
      end as rank,
      greatest(
        similarity(f.name_normalized, q.term),
        coalesce((
          select max(similarity(a.alias_normalized, q.term))
          from public.food_aliases a
          where a.food_id = f.id
        ), 0)
      ) as sim,
      -- Locale is a tiebreaker only: an org's cuisine wins ties, never filters.
      case
        when p_locale is not null and f.cuisine_tags && array[lower(p_locale)]
        then 1 else 0
      end as locale_boost,
      (f.org_id is not null) as is_org_custom
    from public.foods f, q
    where
      -- Belt-and-suspenders org scope: RLS already narrows authenticated callers
      -- to globals + their own org, but service-role callers bypass RLS, so scope
      -- org-customs to q.org explicitly (globals always visible; unknown org =>
      -- globals only). q.org = the caller's JWT org unless p_org overrides it.
      (f.org_id is null or f.org_id = q.org)
      and (
      f.name_normalized = q.term
      or f.name_normalized like q.term || '%'
      or to_tsvector('simple', f.name) @@ plainto_tsquery('simple', q.term)
      or f.name_normalized % q.term
      or exists (
        select 1 from public.food_aliases a
        where a.food_id = f.id
          and (a.alias_normalized = q.term or a.alias_normalized % q.term)
      )
      )
  )
  select
    s.id, s.org_id, s.source, s.name, s.name_normalized, s.cuisine_tags,
    s.allergen_tags, s.serving_units, s.kcal_per_100g, s.protein_per_100g,
    s.carbs_per_100g, s.fat_per_100g, s.fiber_per_100g, s.verified,
    s.sim::real as score,
    case s.rank
      when 0 then 'exact'
      when 1 then 'prefix_or_alias'
      when 2 then 'fulltext'
      else 'trigram'
    end as matched_via
  from scored s
  where s.rank < 9
  order by
    s.rank asc,
    s.locale_boost desc,
    -- An org's own recipe outranks a global row at the same match quality.
    s.is_org_custom desc,
    s.sim desc,
    s.name asc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

grant execute on function public.search_foods(text, text, uuid, int) to authenticated, service_role;
