import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import Stripe from "stripe";

import { serviceClient } from "./helpers";

// Phase 8.3 — the webhook ENDPOINT, end-to-end and deterministic: fixture events
// are signed with the local test secret (real signature verification, no live
// Stripe) and posted to /api/webhooks/stripe; we assert the effects landed in the
// DB and that replays are idempotent. Mirrors the AI-key gating: runs only when
// STRIPE_WEBHOOK_SECRET is set (local .env.local / CI env), else SKIPs.

const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const signer = new Stripe("sk_test_placeholder_for_signing", { typescript: true });

test.skip(!SECRET, "STRIPE_WEBHOOK_SECRET not set — webhook route e2e skipped (mirrors live-AI gating)");

function post(request: import("@playwright/test").APIRequestContext, event: object, opts: { badSig?: boolean; noSig?: boolean } = {}) {
  const payload = JSON.stringify(event);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (!opts.noSig) {
    headers["stripe-signature"] = opts.badSig
      ? "t=1,v1=deadbeef"
      : signer.webhooks.generateTestHeaderString({ payload, secret: SECRET! });
  }
  return request.post("/api/webhooks/stripe", { headers, data: payload });
}

async function seedOrgClientTier() {
  const service = serviceClient();
  const { data: org } = await service
    .from("orgs")
    .insert({ name: "WH Org", slug: `wh-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  const orgId = org!.id as string;
  const { data: client } = await service
    .from("clients")
    .insert({ org_id: orgId, source: "invite", status: "onboarding" })
    .select("id")
    .single();
  const { data: tier } = await service
    .from("tiers")
    .insert({ org_id: orgId, name: "Pro", price_cents: 10000, currency: "usd" })
    .select("id")
    .single();
  return { service, orgId, clientId: client!.id as string, tierId: tier!.id as string };
}

const now = () => Math.floor(Date.now() / 1000);

test("checkout.session.completed activates the client + creates the subscription", async ({ request }) => {
  const { service, orgId, clientId, tierId } = await seedOrgClientTier();
  const subId = `sub_${randomUUID().slice(0, 12)}`;
  const event = {
    id: `evt_${randomUUID().slice(0, 12)}`,
    object: "event",
    type: "checkout.session.completed",
    created: now(),
    data: {
      object: {
        id: `cs_${randomUUID().slice(0, 12)}`,
        object: "checkout.session",
        mode: "subscription",
        subscription: subId,
        customer: `cus_${randomUUID().slice(0, 10)}`,
        client_reference_id: clientId,
        metadata: { org_id: orgId, client_id: clientId, tier_id: tierId },
      },
    },
  };

  const res = await post(request, event);
  expect(res.status()).toBe(200);

  const { data: sub } = await service
    .from("subscriptions")
    .select("status, tier_id, stripe_subscription_id")
    .eq("stripe_subscription_id", subId)
    .single();
  expect(sub?.status).toBe("active");
  expect(sub?.tier_id).toBe(tierId);

  const { data: client } = await service.from("clients").select("status").eq("id", clientId).single();
  expect(client?.status).toBe("active");

  // Replay the SAME event → idempotent (still exactly one subscription row).
  const replay = await post(request, event);
  expect(replay.status()).toBe(200);
  const { count } = await service
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("stripe_subscription_id", subId);
  expect(count).toBe(1);
});

test("payment_failed → past_due + dunning, invoice.paid recovers", async ({ request }) => {
  const { service, orgId, clientId, tierId } = await seedOrgClientTier();
  const subId = `sub_${randomUUID().slice(0, 12)}`;

  await post(request, {
    id: `evt_${randomUUID().slice(0, 12)}`,
    object: "event",
    type: "checkout.session.completed",
    created: now(),
    data: {
      object: {
        id: `cs_${randomUUID().slice(0, 12)}`,
        subscription: subId,
        customer: `cus_${randomUUID().slice(0, 10)}`,
        metadata: { org_id: orgId, client_id: clientId, tier_id: tierId },
      },
    },
  });

  const failRes = await post(request, {
    id: `evt_${randomUUID().slice(0, 12)}`,
    object: "event",
    type: "invoice.payment_failed",
    created: now() + 1,
    data: {
      object: {
        id: `in_${randomUUID().slice(0, 12)}`,
        object: "invoice",
        subscription: subId,
        customer: `cus_x`,
        amount_due: 10000,
        currency: "usd",
        metadata: { org_id: orgId, client_id: clientId },
      },
    },
  });
  expect(failRes.status()).toBe(200);
  const { data: pastDue } = await service
    .from("subscriptions")
    .select("status, dunning_stage, pause_reason")
    .eq("stripe_subscription_id", subId)
    .single();
  expect(pastDue?.status).toBe("past_due");
  expect(pastDue?.dunning_stage).toBe(1);
  expect(pastDue?.pause_reason).toBe("dunning");

  const paidRes = await post(request, {
    id: `evt_${randomUUID().slice(0, 12)}`,
    object: "event",
    type: "invoice.paid",
    created: now() + 2,
    data: {
      object: {
        id: `in_${randomUUID().slice(0, 12)}`,
        object: "invoice",
        subscription: subId,
        customer: `cus_x`,
        amount_paid: 10000,
        application_fee_amount: 250,
        currency: "usd",
        metadata: { org_id: orgId, client_id: clientId },
      },
    },
  });
  expect(paidRes.status()).toBe(200);
  const { data: recovered } = await service
    .from("subscriptions")
    .select("status, dunning_stage")
    .eq("stripe_subscription_id", subId)
    .single();
  expect(recovered?.status).toBe("active");
  expect(recovered?.dunning_stage).toBe(0);

  const { data: pay } = await service
    .from("payment_records")
    .select("amount_cents, application_fee_cents, status")
    .eq("client_id", clientId)
    .eq("status", "paid")
    .single();
  expect(pay?.amount_cents).toBe(10000);
  expect(pay?.application_fee_cents).toBe(250);
});

test("rejects a missing or forged signature", async ({ request }) => {
  const event = { id: "evt_x", type: "checkout.session.completed", created: now(), data: { object: {} } };
  expect((await post(request, event, { noSig: true })).status()).toBe(400);
  expect((await post(request, event, { badSig: true })).status()).toBe(400);
});

test("acknowledges an unhandled event type without processing", async ({ request }) => {
  const res = await post(request, {
    id: `evt_${randomUUID().slice(0, 12)}`,
    object: "event",
    type: "customer.created",
    created: now(),
    data: { object: { id: "cus_x" } },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ignored: "customer.created" });
});
