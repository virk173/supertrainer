import { NextResponse, type NextRequest } from "next/server";

import { constructWebhookEvent, type Stripe } from "@supertrainer/payments/client";
import type { Json } from "@supertrainer/db/types";

import { executeEffects, type ExecContext } from "@/lib/payments/effects";
import { normalizeEvent } from "@/lib/payments/normalize";
import { transition } from "@/lib/payments/state-machine";
import type { SubState, WebhookEvent } from "@/lib/payments/webhook-types";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Phase 8.3 — the Stripe webhook endpoint. Fails CLOSED without the signing
// secret. Verifies the signature, dedupes by stripe_event_id (replay-safe),
// runs the PURE state machine, and executes its effects idempotently. Configured
// by STRIPE_WEBHOOK_SECRET alone (independent of STRIPE_SECRET_KEY) so it can be
// verified deterministically in CI by signing fixture payloads with a test
// secret — the merge gate never calls live Stripe.

const FRESH: SubState = {
  exists: false,
  status: "incomplete",
  pauseReason: "none",
  dunningStage: 0,
  cancelAtPeriodEnd: false,
  lastEventAt: null,
};

type Service = ReturnType<typeof createServiceClient>;

async function resolveContext(
  service: Service,
  event: WebhookEvent,
): Promise<{ ctx: ExecContext; state: SubState }> {
  let orgId = event.orgId ?? null;
  let clientId = event.clientId ?? null;
  let rowId: string | null = null;
  let state: SubState = { ...FRESH };

  // Prefer the subscription row (by Stripe sub id) — the authoritative state.
  if (event.stripeSubscriptionId) {
    const { data: row } = await service
      .from("subscriptions")
      .select("id, org_id, client_id, status, pause_reason, dunning_stage, cancel_at_period_end, last_event_at")
      .eq("stripe_subscription_id", event.stripeSubscriptionId)
      .maybeSingle();
    if (row) {
      rowId = row.id;
      orgId = row.org_id;
      clientId = row.client_id;
      state = {
        exists: true,
        status: row.status,
        pauseReason: row.pause_reason,
        dunningStage: row.dunning_stage,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        lastEventAt: row.last_event_at ? Math.floor(new Date(row.last_event_at).getTime() / 1000) : null,
      };
    }
  }

  // Idempotent re-checkout: an existing row for this client (no sub id match yet).
  if (!rowId && clientId) {
    const { data: row } = await service
      .from("subscriptions")
      .select("id, org_id, client_id, status, pause_reason, dunning_stage, cancel_at_period_end, last_event_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row) {
      rowId = row.id;
      orgId = row.org_id;
      clientId = row.client_id;
      state = {
        exists: true,
        status: row.status,
        pauseReason: row.pause_reason,
        dunningStage: row.dunning_stage,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        lastEventAt: row.last_event_at ? Math.floor(new Date(row.last_event_at).getTime() / 1000) : null,
      };
    }
  }

  // Fall back to the connected account → org for account / dispute events.
  if (!orgId && event.stripeAccountId) {
    const { data: acct } = await service
      .from("connect_accounts")
      .select("org_id")
      .eq("stripe_account_id", event.stripeAccountId)
      .maybeSingle();
    orgId = acct?.org_id ?? null;
  }

  return {
    ctx: {
      orgId,
      clientId,
      stripeAccountId: event.stripeAccountId,
      subscriptionRowId: rowId,
      newLastEventAt: null, // filled after transition
    },
    state,
  };
}

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

  const normalized = normalizeEvent(raw);
  if (!normalized) {
    await service.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("stripe_event_id", raw.id);
    return NextResponse.json({ received: true, ignored: raw.type });
  }

  try {
    const { ctx, state } = await resolveContext(service, normalized);
    const { newState, effects } = transition(state, normalized);
    ctx.newLastEventAt = newState.lastEventAt;
    await executeEffects(service, normalized, ctx, effects);
    await service.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("stripe_event_id", raw.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    // Leave processed_at null → Stripe retries → idempotent effects re-run.
    console.error("[webhooks] processing failed:", err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
