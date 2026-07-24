import "server-only";

import { applicationFeePercent } from "@supertrainer/payments";
import { getStripeClient } from "@supertrainer/payments/client";

import { createClient, createServiceClient } from "@/lib/supabase/server";

import { changeDirection, summarizeProration, type ProrationSummary } from "./proration";

// Phase 8.2 — the client payment moment + membership management. Checkout runs
// in SUBSCRIPTION mode on the trainer's connected account with our application
// fee; the subscription ROW is created by the 8.3 webhook (checkout.session.
// completed), never by the redirect — so a closed browser tab can't leave a
// paid client without a record. All Stripe calls are gated by the caller.

export interface CheckoutInput {
  orgId: string;
  clientId: string;
  tierId: string;
  successUrl: string;
  cancelUrl: string;
}

/** Create a branded Checkout Session for a client to subscribe to a tier.
 *  Verifies (service role) that the tier belongs to the org, has a synced price,
 *  and the connected account can take charges. Returns the hosted-checkout URL. */
export async function createCheckoutSession(
  input: CheckoutInput,
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const service = createServiceClient();

  const { data: tier } = await service
    .from("tiers")
    .select("id, org_id, name, price_cents, currency, stripe_price_id, is_active")
    .eq("id", input.tierId)
    .maybeSingle();
  if (!tier || tier.org_id !== input.orgId) return { ok: false, reason: "tier_not_found" };
  if (!tier.is_active) return { ok: false, reason: "tier_inactive" };
  if (!tier.stripe_price_id) return { ok: false, reason: "tier_not_synced" };

  const { data: client } = await service
    .from("clients")
    .select("id, org_id, is_demo")
    .eq("id", input.clientId)
    .maybeSingle();
  if (!client || client.org_id !== input.orgId) return { ok: false, reason: "client_not_found" };
  if (client.is_demo) return { ok: false, reason: "demo_client" };

  const { data: acct } = await service
    .from("connect_accounts")
    .select("stripe_account_id, charges_enabled")
    .eq("org_id", input.orgId)
    .maybeSingle();
  if (!acct?.stripe_account_id || !acct.charges_enabled) {
    return { ok: false, reason: "payments_not_ready" };
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      line_items: [{ price: tier.stripe_price_id, quantity: 1 }],
      subscription_data: {
        application_fee_percent: applicationFeePercent(),
        metadata: { org_id: input.orgId, client_id: input.clientId, tier_id: input.tierId },
      },
      automatic_tax: { enabled: true },
      client_reference_id: input.clientId,
      // The webhook (8.3) reads these off checkout.session.completed to create
      // the subscription row and flip the client active.
      metadata: { org_id: input.orgId, client_id: input.clientId, tier_id: input.tierId },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
    {
      stripeAccount: acct.stripe_account_id,
      idempotencyKey: `checkout:${input.clientId}:${input.tierId}`,
    },
  );

  if (!session.url) return { ok: false, reason: "no_session_url" };
  return { ok: true, url: session.url };
}

/** A Stripe Billing Portal session so the client can update their card / view
 *  invoices on the connected account. Returns the hosted URL. */
export async function createBillingPortalSession(
  orgId: string,
  clientId: string,
  returnUrl: string,
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const service = createServiceClient();
  const { data: sub } = await service
    .from("subscriptions")
    .select("stripe_customer_id, org_id")
    .eq("client_id", clientId)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub || sub.org_id !== orgId || !sub.stripe_customer_id) {
    return { ok: false, reason: "no_customer" };
  }
  const { data: acct } = await service
    .from("connect_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!acct?.stripe_account_id) return { ok: false, reason: "payments_not_ready" };

  const stripe = getStripeClient();
  const portal = await stripe.billingPortal.sessions.create(
    { customer: sub.stripe_customer_id, return_url: returnUrl },
    { stripeAccount: acct.stripe_account_id },
  );
  return { ok: true, url: portal.url };
}

// ── tier changes (upgrade / downgrade with proration) ────────────────────────

export interface TierChangePreview extends ProrationSummary {
  newTierId: string;
  newTierName: string;
}

/** Preview a tier change: asks Stripe for the exact upcoming-invoice proration
 *  so the confirm screen shows what will actually be charged (never an estimate).
 *  Gated. */
export async function previewTierChange(
  orgId: string,
  clientId: string,
  newTierId: string,
): Promise<{ ok: true; preview: TierChangePreview } | { ok: false; reason: string }> {
  const service = createServiceClient();

  const { data: sub } = await service
    .from("subscriptions")
    .select("stripe_subscription_id, tier_id, org_id, status")
    .eq("client_id", clientId)
    .not("stripe_subscription_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub || sub.org_id !== orgId || !sub.stripe_subscription_id) {
    return { ok: false, reason: "no_subscription" };
  }

  const { data: newTier } = await service
    .from("tiers")
    .select("id, org_id, name, price_cents, currency, stripe_price_id")
    .eq("id", newTierId)
    .maybeSingle();
  if (!newTier || newTier.org_id !== orgId || !newTier.stripe_price_id) {
    return { ok: false, reason: "tier_not_synced" };
  }

  let currentCents = 0;
  if (sub.tier_id) {
    const { data: cur } = await service
      .from("tiers")
      .select("price_cents")
      .eq("id", sub.tier_id)
      .maybeSingle();
    currentCents = cur?.price_cents ?? 0;
  }

  const { data: acct } = await service
    .from("connect_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!acct?.stripe_account_id) return { ok: false, reason: "payments_not_ready" };

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, {
    stripeAccount: acct.stripe_account_id,
  });
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) return { ok: false, reason: "no_subscription_item" };

  const direction = changeDirection(currentCents, newTier.price_cents);
  const preview = await stripe.invoices.createPreview(
    {
      subscription: sub.stripe_subscription_id,
      subscription_details: {
        items: [{ id: itemId, price: newTier.stripe_price_id }],
        proration_behavior: direction === "downgrade" ? "none" : "create_prorations",
      },
    },
    { stripeAccount: acct.stripe_account_id },
  );

  const summary = summarizeProration({
    immediateChargeCents: preview.amount_due,
    nextRenewalCents: newTier.price_cents,
    nextRenewalDate: subscription.items.data[0]?.current_period_end
      ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
      : null,
    currency: newTier.currency,
    direction,
  });

  return {
    ok: true,
    preview: { ...summary, newTierId: newTier.id, newTierName: newTier.name },
  };
}

/** Apply a tier change. Upgrades prorate + flip immediately; downgrades change
 *  the price going forward (proration_behavior 'none') so the client keeps their
 *  current features through the cycle they already paid for. Gated. The webhook
 *  (8.3) reconciles the subscription row from customer.subscription.updated. */
export async function applyTierChange(
  orgId: string,
  clientId: string,
  newTierId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const service = createServiceClient();
  const { data: sub } = await service
    .from("subscriptions")
    .select("stripe_subscription_id, tier_id, org_id")
    .eq("client_id", clientId)
    .not("stripe_subscription_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub || sub.org_id !== orgId || !sub.stripe_subscription_id) {
    return { ok: false, reason: "no_subscription" };
  }
  const { data: newTier } = await service
    .from("tiers")
    .select("id, org_id, price_cents, stripe_price_id")
    .eq("id", newTierId)
    .maybeSingle();
  if (!newTier || newTier.org_id !== orgId || !newTier.stripe_price_id) {
    return { ok: false, reason: "tier_not_synced" };
  }
  const { data: acct } = await service
    .from("connect_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!acct?.stripe_account_id) return { ok: false, reason: "payments_not_ready" };

  let currentCents = 0;
  if (sub.tier_id) {
    const { data: cur } = await service
      .from("tiers")
      .select("price_cents")
      .eq("id", sub.tier_id)
      .maybeSingle();
    currentCents = cur?.price_cents ?? 0;
  }
  const direction = changeDirection(currentCents, newTier.price_cents);

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, {
    stripeAccount: acct.stripe_account_id,
  });
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) return { ok: false, reason: "no_subscription_item" };

  await stripe.subscriptions.update(
    sub.stripe_subscription_id,
    {
      items: [{ id: itemId, price: newTier.stripe_price_id }],
      proration_behavior: direction === "downgrade" ? "none" : "create_prorations",
      metadata: { org_id: orgId, client_id: clientId, tier_id: newTierId },
    },
    { stripeAccount: acct.stripe_account_id },
  );
  return { ok: true };
}

// ── membership read (client portal) ───────────────────────────────────────────

export interface MembershipView {
  subscription: {
    status: string;
    pauseReason: string;
    tierId: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  tier: { id: string; name: string; priceCents: number; currency: string } | null;
  history: {
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    date: string;
  }[];
}

/** The client's current membership + recent payment history. RLS-scoped: a
 *  client only ever reads their own subscription/payments. */
export async function getMembership(clientId: string): Promise<MembershipView> {
  const db = await createClient();

  const { data: sub } = await db
    .from("subscriptions")
    .select("status, pause_reason, tier_id, current_period_end, cancel_at_period_end")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let tier: MembershipView["tier"] = null;
  if (sub?.tier_id) {
    const { data: t } = await db
      .from("tiers")
      .select("id, name, price_cents, currency")
      .eq("id", sub.tier_id)
      .maybeSingle();
    if (t) tier = { id: t.id, name: t.name, priceCents: t.price_cents, currency: t.currency };
  }

  const { data: records } = await db
    .from("payment_records")
    .select("id, amount_cents, currency, status, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(12);

  return {
    subscription: sub
      ? {
          status: sub.status,
          pauseReason: sub.pause_reason,
          tierId: sub.tier_id,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        }
      : null,
    tier,
    history: (records ?? []).map((r) => ({
      id: r.id,
      amountCents: r.amount_cents,
      currency: r.currency,
      status: r.status,
      date: r.created_at,
    })),
  };
}

export { summarizeProration, changeDirection, type ProrationSummary };
