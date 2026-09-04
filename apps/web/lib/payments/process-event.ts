import "server-only";

import type { Stripe } from "@supertrainer/payments/client";

import { executeEffects, type ExecContext } from "@/lib/payments/effects";
import { normalizeEvent } from "@/lib/payments/normalize";
import { transition } from "@/lib/payments/state-machine";
import type { SubState, WebhookEvent } from "@/lib/payments/webhook-types";
import type { createServiceClient } from "@/lib/supabase/server";

// Phase 8.3 core, extracted in 9.3 so the admin console can REPLAY a stored
// event through exactly the same path a live delivery takes. A replay that runs
// different code than the original is not a replay — it is a second, untested
// write path into money state.

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

  // Idempotent re-checkout: reuse an existing row for this client ONLY when it's
  // a cutover row awaiting checkout (no stripe_subscription_id) or the very same
  // subscription. A different/old sub id (e.g. a churned client winning back)
  // gets a FRESH row instead — so the welcome fires and a new subscription never
  // repoints an old row (which would orphan the old one's late retry events onto
  // the new subscription's state).
  if (!rowId && clientId) {
    const { data: row } = await service
      .from("subscriptions")
      .select("id, org_id, client_id, status, pause_reason, dunning_stage, cancel_at_period_end, last_event_at, stripe_subscription_id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const reusable =
      row &&
      (row.stripe_subscription_id == null ||
        row.stripe_subscription_id === event.stripeSubscriptionId);
    if (row && reusable) {
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


export interface ProcessResult {
  processed: boolean;
  ignored?: string;
}

/** Run one already-verified Stripe event through the pure state machine and its
 *  effects. Idempotent: the effects are, and the caller owns processed_at. */
export async function processStripeEvent(
  service: Service,
  raw: Stripe.Event,
): Promise<ProcessResult> {
  const normalized = normalizeEvent(raw);
  if (!normalized) return { processed: false, ignored: raw.type };
  const { ctx, state } = await resolveContext(service, normalized);
  const { newState, effects } = transition(state, normalized);
  ctx.newLastEventAt = newState.lastEventAt;
  await executeEffects(service, normalized, ctx, effects);
  return { processed: true };
}
