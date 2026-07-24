import { NextResponse, type NextRequest } from "next/server";

import { runMorningDigestTick } from "@/lib/cards/digest-tick";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 6.5 — the trainer morning digest (spec §13 core loop). Assembles per-org
// counts (on-track/slipping, pending drafts, renewals, overnight escalations) and
// records them for the trainer surface (P7 renders the 7am card/push). Fails CLOSED.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runMorningDigestTick(createServiceClient(), new Date()));
}
