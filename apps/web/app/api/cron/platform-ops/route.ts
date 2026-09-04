import { NextResponse, type NextRequest } from "next/server";

import { evaluateBudgets, sweepAdminSessions } from "@/lib/admin/budget";
import { evaluateReferrals } from "@/lib/growth/referrals";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Phase 9.3/9.4 — platform housekeeping: re-evaluate every org's AI budget
// (throttle the ones over cap, release the ones back under it), clear spent
// console credentials, and settle referrals that have become real. Fails CLOSED
// like every cron.

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const verdicts = await evaluateBudgets(now);
  const swept = await sweepAdminSessions(now);
  // Phase 9.4 — settle every referral that has become real since yesterday.
  const referrals = await evaluateReferrals();

  return NextResponse.json({
    orgs: verdicts.length,
    throttled: verdicts.filter((v) => v.state === "over").length,
    changed: verdicts.filter((v) => v.changed).length,
    swept,
    referralsCredited: referrals.filter((r) => r.verdict.decision === "credit").length,
    referralsRejected: referrals.filter((r) => r.verdict.decision === "reject").length,
  });
}
