-- Phase 2 backstop: harden the Stage A teaser rate limiter.
--   * email_normalized — a count-only key that collapses case / "+tag" /
--     Gmail-dot variants so one prospect can't look like many. The raw `email`
--     stays the contact address; the app computes email_normalized on insert
--     (apps/web/lib/onboarding/rate-limit.ts). Existing rows get a best-effort
--     lower(btrim()) backfill — we deliberately do NOT re-implement the Gmail
--     dot/+tag algorithm in SQL (it would drift from the TS one), and the table
--     is effectively empty pre-launch.
--   * ip_hash — a non-reversible HMAC of the client IP (never the raw address),
--     powering a per-source/day sublimit so one actor can't consume the org's
--     whole daily quota. Null when unconfigured (no secret) or no client IP.

alter table public.leads
  add column email_normalized text,
  add column ip_hash text;

update public.leads
  set email_normalized = lower(btrim(email))
  where email_normalized is null;

-- The weekly per-email limit now slides on the normalized key.
drop index if exists public.leads_org_id_email_created_at_idx;

create index leads_org_id_email_normalized_created_at_idx
  on public.leads (org_id, email_normalized, created_at);

-- The per-source/day sublimit slides on ip_hash (only rows that have one).
create index leads_org_id_ip_hash_created_at_idx
  on public.leads (org_id, ip_hash, created_at)
  where ip_hash is not null;
