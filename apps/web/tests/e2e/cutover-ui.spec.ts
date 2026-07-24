import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import Stripe from "stripe";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

// Phase 8.6 — the beta cutover migration dashboard + the capture flow that
// retires the approved_manually stopgap.

const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const signer = new Stripe("sk_test_placeholder_for_signing", { typescript: true });

test("cutover: dashboard renders, start cutover creates the grace subscription", async ({ page }) => {
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("cutover-trainer"));
  const service = serviceClient();
  const { data: client } = await service
    .from("clients")
    .insert({ org_id: orgId, source: "invite", status: "active", approved_manually: true, intake: { name: "Casey Beta" } })
    .select("id")
    .single();
  await service.from("tiers").insert({ org_id: orgId, name: "Pro", price_cents: 10000, currency: "usd" });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/settings/payments/cutover`);

  await expect(page.getByTestId("cutover-title")).toBeVisible();
  await expect(page.getByText("Casey Beta", { exact: true })).toBeVisible();

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);

  await page.getByRole("button", { name: "Start cutover" }).click();
  await expect(page.getByText(/Cutover started/)).toBeVisible();

  const { data: sub } = await service
    .from("subscriptions")
    .select("status, grace_until, tier_id")
    .eq("client_id", client!.id)
    .single();
  expect(sub?.status).toBe("incomplete");
  expect(sub?.grace_until).not.toBeNull();
});

test("capture: a completed checkout clears approved_manually (stopgap retired)", async ({ request }) => {
  test.skip(!SECRET, "STRIPE_WEBHOOK_SECRET not set");
  const service = serviceClient();
  const { data: org } = await service
    .from("orgs")
    .insert({ name: "Cutover Org", slug: `cut-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  const orgId = org!.id as string;
  const { data: client } = await service
    .from("clients")
    .insert({ org_id: orgId, source: "invite", status: "active", approved_manually: true })
    .select("id")
    .single();
  const { data: tier } = await service
    .from("tiers")
    .insert({ org_id: orgId, name: "Pro", price_cents: 10000, currency: "usd" })
    .select("id")
    .single();

  const subId = `sub_${randomUUID().slice(0, 12)}`;
  const event = {
    id: `evt_${randomUUID().slice(0, 12)}`,
    object: "event",
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_${randomUUID().slice(0, 12)}`,
        subscription: subId,
        customer: `cus_${randomUUID().slice(0, 10)}`,
        metadata: { org_id: orgId, client_id: client!.id, tier_id: tier!.id },
      },
    },
  };
  const payload = JSON.stringify(event);
  const res = await request.post("/api/webhooks/stripe", {
    headers: {
      "content-type": "application/json",
      "stripe-signature": signer.webhooks.generateTestHeaderString({ payload, secret: SECRET! }),
    },
    data: payload,
  });
  expect(res.status()).toBe(200);

  const { data: after } = await service
    .from("clients")
    .select("status, approved_manually")
    .eq("id", client!.id)
    .single();
  expect(after?.status).toBe("active");
  expect(after?.approved_manually).toBe(false);
});
