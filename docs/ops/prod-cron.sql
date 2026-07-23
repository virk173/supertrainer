-- ============================================================================
-- Production cron setup — Supabase pg_cron → Vercel cron endpoints (Phase 3)
-- ============================================================================
-- WHAT: schedules the day-close and reminder ticks to hit the app's cron routes
--       on a real cadence. Vercel Hobby caps crons at once/DAY (see
--       apps/web/vercel.json — those daily runs stay as a harmless backup), so
--       reminders would otherwise only fire at one fixed UTC time. pg_cron in
--       Supabase can call the same endpoints every few minutes instead.
--
-- WHY NOT A MIGRATION: pg_cron must be preloaded and would break `supabase db
--       reset` locally, so this is a one-time MANUAL setup, not a migration.
--
-- HOW:  run this whole file in the Supabase Dashboard → SQL Editor on the PROD
--       project, after replacing the two placeholders in Part B. Idempotent —
--       safe to re-run (cron.schedule upserts by job name).
--
-- ENDPOINTS (GET, guarded by CRON_SECRET; fail closed):
--   /api/cron/reminders   — reminders/tick.ts (every 5 min)
--   /api/cron/day-close   — ledger/day-close-job.ts (every 15 min)
-- The routes reject anything without `Authorization: Bearer <CRON_SECRET>`, so
-- CRON_SECRET here MUST equal the CRON_SECRET set in the Vercel project env.
-- ============================================================================

-- ── Part A — extensions (or Dashboard → Database → Extensions) ──────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Part B — store the app URL + secret in Vault (REPLACE the placeholders) ──
-- Re-run-safe: delete any prior copies first, then recreate.
delete from vault.secrets where name in ('app_base_url', 'cron_secret');
select vault.create_secret('https://YOUR-APP.vercel.app', 'app_base_url');   -- your prod domain, no trailing slash
select vault.create_secret('YOUR_CRON_SECRET_VALUE',      'cron_secret');     -- EXACT same value as Vercel's CRON_SECRET

-- ── Part C — schedule the ticks ─────────────────────────────────────────────
select cron.schedule('reminders-5min', '*/5 * * * *', $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
$job$);

select cron.schedule('day-close-15min', '*/15 * * * *', $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/day-close',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
$job$);

-- ── Part D — verify (run a few minutes after scheduling) ────────────────────
-- Jobs registered + active:
--   select jobname, schedule, active from cron.job;
-- Recent job runs (want status = 'succeeded'):
--   select jobid, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
-- HTTP responses from the endpoints (want status_code = 200):
--   select id, status_code, created from net._http_response order by created desc limit 10;

-- ── Part E — teardown (if ever needed) ──────────────────────────────────────
--   select cron.unschedule('reminders-5min');
--   select cron.unschedule('day-close-15min');
