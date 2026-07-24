import { NextResponse, type NextRequest } from "next/server";

import { grantMonthlyCredits } from "@/lib/payments/calcom";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 8.5 — monthly video-call credit grant. Idempotent (unique on
// client_id,period_month) so a daily tick is safe: it tops up the current
// month once per client and no-ops thereafter. Fails CLOSED like every cron.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: orgs } = await service.from("connect_accounts").select("org_id");

  let granted = 0;
  for (const o of orgs ?? []) {
    try {
      const r = await grantMonthlyCredits(o.org_id);
      granted += r.granted;
    } catch (err) {
      console.error("[grant-credits] failed for org", o.org_id, err);
    }
  }
  return NextResponse.json({ orgs: orgs?.length ?? 0, granted });
}
