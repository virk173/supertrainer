import { NextResponse, type NextRequest } from "next/server";

import { runCardTick } from "@/lib/cards/tick";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 6.5 — the nightly smart check-in tick. Picks at most one gap-filling card
// per client (caps enforced in code) and delivers it into the thread. Fails
// CLOSED. Daily Vercel cron; nightly pg_cron is the prod ideal.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runCardTick(createServiceClient(), new Date()));
}
