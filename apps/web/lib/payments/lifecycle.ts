import "server-only";

import { recordAudit } from "@supertrainer/db/queries";
import { getStripeClient } from "@supertrainer/payments/client";

import { createServiceClient } from "@/lib/supabase/server";

import { DEFAULT_DUNNING, graceUntil } from "./dunning";

// Phase 8.4 — subscription lifecycle actions (pause/vacation, cancel, extend
// grace). Each is gated by the caller on isStripeConfigured() and writes through
// the service role with org_id verified in code. The subscription ROW is
// reconciled by the webhook (8.3) — these initiate the Stripe-side change and
// record intent; state converges when Stripe echoes it back.

async function subFor(
  orgId: string,
  clientId: string,
): Promise<{ rowId: string; stripeSubscriptionId: string | null; stripeAccountId: string } | null> {
  const service = createServiceClient();
  const { data: sub } = await service
    .from("subscriptions")
    .select("id, org_id, stripe_subscription_id")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub || sub.org_id !== orgId) return null;
  const { data: acct } = await service
    .from("connect_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!acct?.stripe_account_id) return null;
  return {
    rowId: sub.id,
    stripeSubscriptionId: sub.stripe_subscription_id,
    stripeAccountId: acct.stripe_account_id,
  };
}

/** Pause billing (vacation). Stripe pause_collection stops invoicing; the webhook
 *  flips the row to paused/vacation and P3 expectations off. */
export async function pauseSubscription(
  orgId: string,
  clientId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const s = await subFor(orgId, clientId);
  if (!s?.stripeSubscriptionId) return { ok: false, reason: "no_subscription" };
  const stripe = getStripeClient();
  await stripe.subscriptions.update(
    s.stripeSubscriptionId,
    { pause_collection: { behavior: "void" } },
    { stripeAccount: s.stripeAccountId },
  );
  await recordAudit(createServiceClient(), {
    orgId,
    action: "subscription.paused_requested",
    entityType: "subscription",
    entityId: s.rowId,
    payload: { client_id: clientId },
  });
  return { ok: true };
}

/** Resume billing after a vacation pause. */
export async function resumeSubscription(
  orgId: string,
  clientId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const s = await subFor(orgId, clientId);
  if (!s?.stripeSubscriptionId) return { ok: false, reason: "no_subscription" };
  const stripe = getStripeClient();
  await stripe.subscriptions.resume(s.stripeSubscriptionId, {
    billing_cycle_anchor: "now",
  }, { stripeAccount: s.stripeAccountId });
  await recordAudit(createServiceClient(), {
    orgId,
    action: "subscription.resume_requested",
    entityType: "subscription",
    entityId: s.rowId,
    payload: { client_id: clientId },
  });
  return { ok: true };
}

/** Client-requested cancellation at period end. Trainer is flagged (retention
 *  moment); access continues until the period ends, then the webhook churns. */
export async function requestCancellation(
  orgId: string,
  clientId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const s = await subFor(orgId, clientId);
  if (!s?.stripeSubscriptionId) return { ok: false, reason: "no_subscription" };
  const stripe = getStripeClient();
  await stripe.subscriptions.update(
    s.stripeSubscriptionId,
    { cancel_at_period_end: true },
    { stripeAccount: s.stripeAccountId },
  );
  const service = createServiceClient();
  // Flag the trainer to make a private save-offer (drafted via the P6 reply
  // engine) — the trainer never sees this as chasing money, it's a save moment.
  await recordAudit(service, {
    orgId,
    action: "subscription.cancel_requested",
    entityType: "subscription",
    entityId: s.rowId,
    payload: { client_id: clientId },
  });
  return { ok: true };
}

/** Trainer override: extend the grace window before the dunning pause bites.
 *  Reactivates access for `days`; the client owes nothing during grace (P3
 *  expectations stay off while past_due). Staff-only — enforced by the action. */
export async function extendGrace(
  orgId: string,
  clientId: string,
  days = DEFAULT_DUNNING.graceDays,
  now = new Date(),
): Promise<{ ok: boolean; reason?: string }> {
  const service = createServiceClient();
  const { data: sub } = await service
    .from("subscriptions")
    .select("id, org_id")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub || sub.org_id !== orgId) return { ok: false, reason: "no_subscription" };

  await service
    .from("subscriptions")
    .update({ grace_until: graceUntil(now, days), dunning_stage: 1 })
    .eq("id", sub.id);
  // Re-open access during grace (the ladder re-pauses if still unpaid at expiry).
  await service.from("clients").update({ status: "active" }).eq("id", clientId).eq("org_id", orgId);
  await recordAudit(service, {
    orgId,
    action: "subscription.grace_extended",
    entityType: "subscription",
    entityId: sub.id,
    payload: { client_id: clientId, days },
  });
  return { ok: true };
}
