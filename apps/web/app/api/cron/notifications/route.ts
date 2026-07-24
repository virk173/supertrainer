import { NextResponse, type NextRequest } from "next/server";

import { runDeliveryLadder } from "@/lib/push/worker";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 6.2 — the delivery-ladder tick. Walks every active notification up the
// ladder (push → 4h badge → 20:00 email digest), prunes dead endpoints, and
// downgrades clients whose push has died. The ladder reads timestamps + stored
// stage, so a coarse tick still behaves correctly (just less punctually).
// PRODUCTION IDEAL: a Supabase pg_cron job every ~15 min; the Vercel Cron is the
// daily backup tick (Hobby caps crons at once/day). Fails CLOSED like every job.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDeliveryLadder(createServiceClient(), new Date());
  return NextResponse.json(result);
}
