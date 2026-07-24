import { NextResponse, type NextRequest } from "next/server";

import { runWeeklyRecapTick } from "@/lib/cards/recap-tick";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 6.5 — the client weekly recap (Sunday, client-local). Fails CLOSED.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runWeeklyRecapTick(createServiceClient(), new Date()));
}
