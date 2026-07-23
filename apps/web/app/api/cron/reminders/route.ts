import { NextResponse, type NextRequest } from "next/server";

import { runReminderTick } from "@/lib/reminders/tick";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 3.6 — the reminder tick trigger. The decision engine only ever enqueues
// a reminder whose local time has passed and that isn't already logged/sent, so
// a coarse tick still behaves correctly (just less punctually). PRODUCTION IDEAL:
// a Supabase pg_cron job every 5 min hitting this endpoint (documented, not
// migrated, to avoid pg_cron preload fragility on local db reset); the Vercel
// Cron below is the daily backup tick. Fails CLOSED like every background job.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runReminderTick(createServiceClient(), new Date());
  return NextResponse.json(result);
}
