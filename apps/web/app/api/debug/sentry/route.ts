import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { getSessionClaims } from "@/lib/onboarding/state";

// Manual verification endpoint (Phase 0.5 DoD: "confirm a Sentry test event").
// Staff-only: it captures an exception on every call, so leaving it anonymous
// would let anyone spam Sentry and exhaust its quota in production. Returns 404
// to non-staff so the endpoint isn't discoverable. No-op when Sentry is unset.
// GET /api/debug/sentry
export async function GET() {
  const { role } = await getSessionClaims();
  if (role !== "owner" && role !== "staff") {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!process.env.SENTRY_DSN) {
    return NextResponse.json(
      { ok: false, reason: "sentry-not-configured" },
      { status: 501 },
    );
  }

  const eventId = Sentry.captureException(
    new Error("Sentry test event (Phase 0.5 verification)"),
  );
  await Sentry.flush(2000);

  return NextResponse.json({ ok: true, eventId });
}
