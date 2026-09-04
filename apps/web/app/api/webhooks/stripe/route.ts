import { NextResponse, type NextRequest } from "next/server";

import { constructWebhookEvent, type Stripe } from "@supertrainer/payments/client";
import type { Json } from "@supertrainer/db/types";

import { processStripeEvent } from "@/lib/payments/process-event";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 8.3 — the Stripe webhook endpoint. Fails CLOSED without the signing
// secret. Verifies the signature, dedupes by stripe_event_id (replay-safe),
// runs the PURE state machine, and executes its effects idempotently. Configured
// by STRIPE_WEBHOOK_SECRET alone (independent of STRIPE_SECRET_KEY) so it can be
// verified deterministically in CI by signing fixture payloads with a test
// secret — the merge gate never calls live Stripe.

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhooks not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let raw: Stripe.Event;
  try {
    raw = constructWebhookEvent(body, signature, secret);
  } catch {
    // Bad/forged signature — never process.
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const service = createServiceClient();

  // ── idempotency: record the event before processing, skip if already done ──
  const { error: insertErr } = await service.from("webhook_events").insert({
    stripe_event_id: raw.id,
    type: raw.type,
    event_created: raw.created,
    payload: raw as unknown as Json,
  });
  if (insertErr) {
    // Unique violation → we've seen this event id before.
    const { data: existing } = await service
      .from("webhook_events")
      .select("processed_at")
      .eq("stripe_event_id", raw.id)
      .maybeSingle();
    if (existing?.processed_at) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Row exists but unprocessed (a prior crash) → fall through and re-run.
  }

  try {
    const result = await processStripeEvent(service, raw);
    await service
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("stripe_event_id", raw.id);
    if (!result.processed) return NextResponse.json({ received: true, ignored: result.ignored });
    return NextResponse.json({ received: true });
  } catch (err) {
    // Leave processed_at null → Stripe retries → idempotent effects re-run.
    console.error("[webhooks] processing failed:", err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
