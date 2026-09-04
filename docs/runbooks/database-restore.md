# Database restore

**Rehearsed on:** _not yet — this is a launch-blocking item (see docs/plan/LAUNCH-RUNBOOK.md)._

## Before you touch anything

1. **Stop the writes.** Publish an incident with maintenance mode on
   (`/admin/incidents` → surface "both" → maintenance). Clients and trainers get
   a banner saying changes may not save; nobody is left guessing.
2. **Write down the target time.** Restores are to a POINT IN TIME. Establish
   the last known-good minute before you start, not while you're waiting.
3. **Do not delete anything.** A bad migration is recoverable; a bad migration
   plus an improvised cleanup usually is not.

## Restore

Supabase Point-in-Time Recovery (Pro plan and above):

1. Supabase dashboard → Database → Backups → Point in Time.
2. Choose the timestamp from step 2 above.
3. Restore **into a new project** first if you have any doubt. Verifying against
   a copy costs an hour; restoring over live data with the wrong timestamp costs
   the difference between the two timestamps, permanently.
4. Verify with `supabase test db` against the restored database — the pgTAP suite
   is a fast structural check that RLS, grants and constraints survived.

## After

1. Re-point the app (`NEXT_PUBLIC_SUPABASE_URL`, keys) if you restored into a new
   project, and redeploy.
2. **Replay Stripe events from the gap.** See [webhook-outage.md](webhook-outage.md):
   `webhook_events` rows written after the restore point are gone, so Stripe's
   dashboard is the source of truth for what happened in the window.
3. Turn maintenance mode off and end the incident.
4. Tell affected trainers what happened and what window was lost, in plain words.
   They have clients asking them, not us.

## What is NOT covered by a database restore

- **Storage objects** (progress photos, uploaded plans, exports) live in Supabase
  Storage and restore separately. Check the bucket contents before declaring
  recovery complete.
- **Auth users** are in the same database and do come back — but sessions issued
  after the restore point are invalid, so people will be signed out.
