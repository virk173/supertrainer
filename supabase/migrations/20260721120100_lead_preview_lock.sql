-- Phase 2 backstop (MF-7): a claim column so concurrent loads of the teaser
-- preview page can't both run the paid Sonnet preview generation.
-- getOrCreatePreview (apps/web/lib/preview/generate.ts) previously did a
-- read-then-check (if lead.preview return) with an unconditional cache write
-- at the end — a TOCTOU. Two concurrent loads both see preview===null, both
-- generate, both write, both fire preview_shown.
--
-- The fix is a conditional UPDATE ... WHERE preview IS NULL AND
-- (preview_generating_at IS NULL OR stale) RETURNING id before generating.
-- Only the row that claims proceeds; losers re-read and return the cached
-- preview if a concurrent winner already finished, else null (the page's
-- existing "pending" state) — no second paid call. Nullable timestamptz; the
-- staleness TTL is applied in application code (not enforced here) so a
-- crashed/abandoned claim is reclaimable and generation can never be
-- permanently blocked. Written only by the service role (leads grants API
-- roles nothing but SELECT — see 20260716120000_leads.sql), so no new grants
-- are needed.
alter table public.leads
  add column preview_generating_at timestamptz;
