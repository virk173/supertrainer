-- The teaser preview reads the global food pool with `where org_id is null`
-- every generation (apps/web/lib/preview/generate.ts). The existing org_id index
-- is partial `where org_id is not null`, so that query can't use it. Add the
-- matching partial index for the global rows (the vast majority, and the only
-- ones the preview reads). Cheap now (128 rows); load-bearing once P3.1 grows the
-- table with full imports.
create index if not exists foods_global_idx
  on public.foods (name_normalized)
  where org_id is null;
