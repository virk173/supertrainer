import type { Stripe } from "@supertrainer/payments/client";

import type { SubStatus, WebhookEvent, WebhookEventType } from "./webhook-types";

// Phase 8.3 — flatten a raw Stripe event into the normalized WebhookEvent the
// pure machine + executor consume. Kept defensive: Connect/Billing payloads move
// (current_period_end migrated onto subscription items, invoice→subscription
// linkage shifted to `parent`), so every field access is optional-chained and a
// couple of legacy locations are tried. Returns null for event types we ignore.

const HANDLED = new Set<WebhookEventType>([
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "account.updated",
  "account.application.deauthorized",
  "charge.dispute.created",
]);

type Bag = Record<string, unknown>;
const s = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const n = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const b = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

function meta(obj: Bag): Bag {
  const m = obj.metadata;
  return m && typeof m === "object" ? (m as Bag) : {};
}

/** The subscription id referenced by an invoice, across API shapes. */
function invoiceSubId(inv: Bag): string | undefined {
  if (s(inv.subscription)) return s(inv.subscription);
  const parent = inv.parent as Bag | undefined;
  const sd = parent?.subscription_details as Bag | undefined;
  return s(sd?.subscription);
}

function invoiceMeta(inv: Bag): Bag {
  const parent = inv.parent as Bag | undefined;
  const sd = parent?.subscription_details as Bag | undefined;
  const m = sd?.metadata as Bag | undefined;
  return m ?? meta(inv);
}

export function normalizeEvent(event: Stripe.Event): WebhookEvent | null {
  const type = event.type as WebhookEventType;
  if (!HANDLED.has(type)) return null;

  const obj = event.data.object as unknown as Bag;
  const created = event.created;
  const stripeAccountId = s((event as unknown as Bag).account);

  switch (type) {
    case "checkout.session.completed": {
      const m = meta(obj);
      return {
        type,
        created,
        stripeAccountId,
        orgId: s(m.org_id),
        clientId: s(m.client_id) ?? s(obj.client_reference_id),
        tierId: s(m.tier_id),
        stripeSubscriptionId: s(obj.subscription),
        stripeCustomerId: s(obj.customer),
      };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const m = invoiceMeta(obj);
      const line = ((obj.lines as Bag | undefined)?.data as Bag[] | undefined)?.[0];
      const period = line?.period as Bag | undefined;
      return {
        type,
        created,
        stripeAccountId,
        orgId: s(m.org_id),
        clientId: s(m.client_id),
        tierId: s(m.tier_id),
        stripeSubscriptionId: invoiceSubId(obj),
        stripeCustomerId: s(obj.customer),
        invoiceId: s(obj.id),
        amountCents: n(obj.amount_paid) ?? n(obj.amount_due) ?? 0,
        applicationFeeCents: n(obj.application_fee_amount) ?? 0,
        currency: s(obj.currency) ?? "usd",
        periodStart: n(period?.start) ?? n(obj.period_start) ?? null,
        periodEnd: n(period?.end) ?? n(obj.period_end) ?? null,
      };
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const m = meta(obj);
      const item = ((obj.items as Bag | undefined)?.data as Bag[] | undefined)?.[0];
      return {
        type,
        created,
        stripeAccountId,
        orgId: s(m.org_id),
        clientId: s(m.client_id),
        tierId: s(m.tier_id),
        stripeSubscriptionId: s(obj.id),
        stripeCustomerId: s(obj.customer),
        subscriptionStatus: s(obj.status) as SubStatus | undefined,
        cancelAtPeriodEnd: b(obj.cancel_at_period_end),
        currentPeriodEnd: n(item?.current_period_end) ?? n(obj.current_period_end) ?? null,
      };
    }

    case "account.updated": {
      const m = meta(obj);
      return {
        type,
        created,
        stripeAccountId: stripeAccountId ?? s(obj.id),
        orgId: s(m.org_id),
        chargesEnabled: b(obj.charges_enabled) ?? false,
        payoutsEnabled: b(obj.payouts_enabled) ?? false,
      };
    }

    case "account.application.deauthorized":
      return { type, created, stripeAccountId };

    case "charge.dispute.created":
      return {
        type,
        created,
        stripeAccountId,
        disputeId: s(obj.id),
        amountCents: n(obj.amount) ?? 0,
      };

    default:
      return null;
  }
}
