import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

// Manual verification endpoint (Phase 0.5 DoD: "confirm a Sentry test event").
// Only fires when Sentry is configured; otherwise a harmless no-op response.
// GET /api/debug/sentry
export async function GET() {
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
