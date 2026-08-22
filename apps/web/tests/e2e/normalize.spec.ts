import { expect, test } from "@playwright/test";

import { normalizeEvent } from "@/lib/payments/normalize";

// Phase 8 — normalizer regression fixtures built from REAL Stripe payload shapes
// (captured from a live test-mode `stripe trigger` run). These exist because the
// hand-written state-machine fixtures pass amounts explicitly and therefore never
// exercised the raw-payload field selection.

type AnyEvent = Parameters<typeof normalizeEvent>[0];

function invoiceEvent(type: string, invoice: Record<string, unknown>): AnyEvent {
  return {
    id: "evt_test",
    object: "event",
    type,
    created: 1700000000,
    data: { object: { object: "invoice", ...invoice } },
  } as unknown as AnyEvent;
}

test("a FAILED invoice records what was OWED, not amount_paid (which is always 0)", () => {
  // Real shape: Stripe sets amount_paid = 0 on a failed invoice. `0 ?? x` does
  // NOT fall through, so selecting on `??` alone recorded every failure as $0.
  const e = normalizeEvent(
    invoiceEvent("invoice.payment_failed", {
      id: "in_failed",
      amount_due: 2000,
      amount_paid: 0,
      amount_remaining: 2000,
      currency: "usd",
    }),
  );
  expect(e?.amountCents).toBe(2000);
});

test("a PAID invoice records amount_paid", () => {
  const e = normalizeEvent(
    invoiceEvent("invoice.paid", {
      id: "in_paid",
      amount_due: 12000,
      amount_paid: 12000,
      application_fee_amount: 300,
      currency: "usd",
    }),
  );
  expect(e?.amountCents).toBe(12000);
  expect(e?.applicationFeeCents).toBe(300);
});

test("attempt_count is carried through (drives the order-independent ladder)", () => {
  const e = normalizeEvent(
    invoiceEvent("invoice.payment_failed", {
      id: "in_retry",
      amount_due: 2000,
      amount_paid: 0,
      attempt_count: 3,
      currency: "usd",
    }),
  );
  expect(e?.attemptCount).toBe(3);
});

test("subscription id is read from the CURRENT parent.subscription_details shape", () => {
  // Stripe moved invoice.subscription → invoice.parent.subscription_details
  // (API 2025-10-29 "basil"). The normalizer must read the new location.
  const e = normalizeEvent(
    invoiceEvent("invoice.paid", {
      id: "in_parent",
      amount_paid: 1000,
      currency: "usd",
      parent: {
        subscription_details: {
          subscription: "sub_new_shape",
          metadata: { org_id: "org_1", client_id: "client_1" },
        },
      },
    }),
  );
  expect(e?.stripeSubscriptionId).toBe("sub_new_shape");
  expect(e?.orgId).toBe("org_1");
  expect(e?.clientId).toBe("client_1");
});

test("legacy invoice.subscription still resolves (older API versions)", () => {
  const e = normalizeEvent(
    invoiceEvent("invoice.paid", {
      id: "in_legacy",
      amount_paid: 1000,
      currency: "usd",
      subscription: "sub_legacy",
      metadata: { org_id: "org_2", client_id: "client_2" },
    }),
  );
  expect(e?.stripeSubscriptionId).toBe("sub_legacy");
  expect(e?.orgId).toBe("org_2");
});

test("an unhandled event type normalizes to null (acked, not processed)", () => {
  expect(normalizeEvent(invoiceEvent("customer.created", { id: "cus_x" }))).toBeNull();
});
