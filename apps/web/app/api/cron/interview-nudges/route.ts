import { NextResponse, type NextRequest } from "next/server";

import { runInterviewNudges } from "@/lib/interview/stall";

export const dynamic = "force-dynamic";

// Vercel Cron hits this once daily (see vercel.json; the Hobby plan caps crons
// at once/day, which is fine for a 24h-idle nudge), sending Authorization:
// Bearer ${CRON_SECRET}. This is a public URL, so it fails CLOSED: no secret
// configured → refuse; wrong/absent bearer → 401. Unlike the app's "no-op
// without keys" integrations, an unauthenticated background trigger must never
// run.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runInterviewNudges();
  return NextResponse.json(result);
}
