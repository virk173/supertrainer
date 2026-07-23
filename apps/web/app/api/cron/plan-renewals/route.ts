import { NextResponse, type NextRequest } from "next/server";

import { enqueueRenewals } from "@/lib/plans/renewals";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 4.4 — the monthly renewal tick. Vercel Cron hits this daily; it queues a
// monthly plan_request for every client whose live plan has aged past the cycle
// (28 days). The pipeline (runDietPipeline) then drafts a ledger-informed
// adjustment. Idempotent per client. Fails CLOSED like every background trigger.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await enqueueRenewals(createServiceClient(), new Date());
  return NextResponse.json(result);
}
