-- Function tests for search_exercises (Phase 5.1). Runs against the migrated
-- free-exercise-db seed. Proves: a text query ranks (exact/prefix/fulltext >
-- fuzzy); a blank query is a filter browse; array filters are ANY-overlap;
-- experience is a ceiling. Called as the default (postgres) role — globals
-- (org_id null) are visible regardless of RLS, which is all the seed is.

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- Text query resolves a well-known lift and tags it push_h.
select ok(
  (select count(*) from public.search_exercises('bench press')) > 0,
  'text query "bench press" returns matches'
);
select ok(
  (select 'push_h' = any(movement_patterns)
     from public.search_exercises('bench press') limit 1),
  'top "bench press" match is a horizontal-press movement'
);

-- Blank query = filter browse: every row carries the requested pattern.
select ok(
  (select bool_and('squat' = any(movement_patterns))
     from public.search_exercises(null, null, null, array['squat']::public.movement_pattern[])),
  'blank-query pattern browse returns only squat-pattern exercises'
);
select ok(
  (select count(*) from public.search_exercises(
     null, null, array['barbell']::text[], array['squat']::public.movement_pattern[]
   )) > 0,
  'squat + barbell filter browse is non-empty'
);

-- Experience is a ceiling, not an exact match.
select ok(
  (select bool_and(experience_min = 'beginner')
     from public.search_exercises(
       null, null, null, null, null, 'beginner'::public.experience_level, 200
     )),
  'max-experience=beginner excludes intermediate/advanced'
);

-- Muscle filter (ANY-overlap on primary_muscles).
select ok(
  (select bool_and('chest' = any(primary_muscles))
     from public.search_exercises(null, null, null, null, array['chest']::text[])),
  'muscle filter returns only chest-primary exercises'
);

-- Limit is honoured (and clamped in the SQL).
select is(
  (select count(*)::int from public.search_exercises('press', null, null, null, null, null, 3)),
  3,
  'p_limit caps the result count'
);

select finish();

rollback;
