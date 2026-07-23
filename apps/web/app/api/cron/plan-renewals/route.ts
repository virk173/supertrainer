import { NextResponse, type NextRequest } from "next/server";

import { enqueueRenewals } from "@/lib/plans/renewals";
import { enqueueSplitProgressions } from "@/lib/splits/renewals";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 4.4 / 5.4 — the monthly renewal tick. Vercel Cron hits this daily; it
// queues a monthly plan_request for every client whose live DIET plan (P4.4) or
// SPLIT (P5.4) has aged past the cycle (28 days). The pipelines then draft a
// ledger-informed diet adjustment / a logged-performance progression. Idempotent
// per client per kind. Fails CLOSED like every background trigger.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();
  const now = new Date();
  const diet = await enqueueRenewals(service, now);
  const split = await enqueueSplitProgressions(service, now);
  return NextResponse.json({ diet, split });
}
