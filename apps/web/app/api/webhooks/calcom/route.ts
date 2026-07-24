import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { recordBooking } from "@/lib/payments/calcom";

export const dynamic = "force-dynamic";

// Phase 8.5 — Cal.com booking webhook → decrement a monthly video-call credit.
// Fails CLOSED without CALCOM_WEBHOOK_SECRET. Verifies the HMAC-SHA256 signature
// Cal.com sends, then decrements the credit for the client id carried in the
// booking metadata (set by the portal embed).
function verify(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.CALCOM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const body = await request.text();
  if (!verify(body, request.headers.get("x-cal-signature-256"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let payload: {
    triggerEvent?: string;
    payload?: { startTime?: string; metadata?: { client_id?: string; org_id?: string } };
  };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  // Only new bookings consume a credit.
  if (payload.triggerEvent !== "BOOKING_CREATED") {
    return NextResponse.json({ received: true, ignored: payload.triggerEvent });
  }
  const clientId = payload.payload?.metadata?.client_id;
  const orgId = payload.payload?.metadata?.org_id;
  if (!clientId || !orgId) return NextResponse.json({ received: true, no_client: true });

  // Decrement against the BOOKING's month, not the webhook-processing month.
  const bookingAt = payload.payload?.startTime ? new Date(payload.payload.startTime) : new Date();
  const res = await recordBooking(orgId, clientId, bookingAt);
  return NextResponse.json({ received: true, remaining: res.remaining ?? null });
}
