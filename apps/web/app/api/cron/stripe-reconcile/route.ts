import { NextResponse, type NextRequest } from "next/server";

import { isStripeConfigured } from "@supertrainer/payments";

import { reconcileAllOrgs } from "@/lib/payments/connect";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 8.1 — nightly tier↔Stripe drift reconcile. Detect-only: it plans the
// sync per connected org and logs any drift (a price edited/deleted in the Stripe
// dashboard, a currency conflict) to audit_log — it never mutates billing on a
// schedule. Fails CLOSED like every background job; no-ops when payments isn't
// configured on the platform.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isStripeConfigured()) {
    return NextResponse.json({ skipped: "stripe not configured" });
  }

  const results = await reconcileAllOrgs();
  const withDrift = results.filter((r) => r.drift > 0 || r.blocked);
  return NextResponse.json({ orgs: results.length, drift: withDrift });
}
