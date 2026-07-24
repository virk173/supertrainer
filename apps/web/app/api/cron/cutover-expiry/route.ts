import { NextResponse, type NextRequest } from "next/server";

import { expireCutoverGrace } from "@/lib/payments/cutover";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 8.6 — hand grace-expired, uncaptured cutover clients to the dunning
// restricted state (never a hard cut). Idempotent (a re-run finds nothing new
// expired). Fails CLOSED like every cron.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: orgs } = await service.from("connect_accounts").select("org_id");

  let moved = 0;
  for (const o of orgs ?? []) {
    try {
      moved += await expireCutoverGrace(o.org_id);
    } catch (err) {
      console.error("[cutover-expiry] failed for org", o.org_id, err);
    }
  }
  return NextResponse.json({ orgs: orgs?.length ?? 0, moved });
}
