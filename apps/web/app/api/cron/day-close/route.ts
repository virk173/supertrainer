import { NextResponse, type NextRequest } from "next/server";

import { trackServer } from "@/lib/analytics/server";
import { closeDueDays } from "@/lib/ledger/day-close-job";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // iterates all active clients

// Phase 3.4 — the day-close tick. Vercel Cron hits this daily (see vercel.json;
// the Hobby plan caps crons at once/day). window=2 means each run closes any
// finished-but-unclosed local day from the last two days, so every client's day
// is auto-missed within ~24h of their local midnight regardless of timezone.
// PRODUCTION IDEAL: also schedule a Supabase pg_cron job every 15 min hitting
// this same endpoint (via pg_net) so days close promptly at local midnight —
// documented rather than migrated, to avoid the pg_cron preload fragility on
// local `db reset`. Fails CLOSED like every background trigger.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await closeDueDays(createServiceClient(), new Date(), {
    onMissedDay: (e) =>
      trackServer({
        orgId: e.orgId,
        clientId: e.clientId,
        event: "day_closed_with_misses",
        properties: { tz_date: e.tzDate, misses: e.misses },
      }),
  });
  return NextResponse.json(result);
}
