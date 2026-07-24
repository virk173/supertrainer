import { expect, test } from "@playwright/test";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { consentClient, seedClient, serviceClient, uniqueEmail } from "./helpers";

// Phase 8.2 — client membership + checkout surfaces. Stripe keys are unset in
// CI, so both render their gated states (deterministic). a11y floor enforced.

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 375, height: 812 };

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("membership: gated state + a11y (desktop, mobile, dark)", async ({ page }) => {
  const { userId, tokenHash } = await seedClient(uniqueEmail("member"));
  await consentClient(userId);

  await page.setViewportSize(DESKTOP);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/portal/membership`);

  await expect(page.getByTestId("membership-title")).toBeVisible();
  await expect(page.getByText("Membership isn’t available yet")).toBeVisible();

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);

  await page.setViewportSize(MOBILE);
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByTestId("membership-title")).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
});

test("membership: a dunning subscription shows the restricted banner (system voice)", async ({ page }) => {
  const { orgId, userId, tokenHash } = await seedClient(uniqueEmail("dunned"));
  await consentClient(userId);
  const service = serviceClient();
  const { data: client } = await service
    .from("clients")
    .select("id")
    .eq("profile_id", userId)
    .single();
  const { data: tier } = await service
    .from("tiers")
    .insert({ org_id: orgId, name: "Pro", price_cents: 10000, currency: "usd" })
    .select("id")
    .single();
  await service.from("subscriptions").insert({
    org_id: orgId,
    client_id: client!.id,
    tier_id: tier!.id,
    status: "past_due",
    pause_reason: "dunning",
    dunning_stage: 3,
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/portal/membership`);

  await expect(page.getByTestId("membership-restricted")).toBeVisible();
  await expect(page.getByText("Your plan is paused")).toBeVisible();
  await expect(page.getByText("Update payment to resume")).toBeVisible();

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
});

test("pay page: shows the tier + gated checkout, a11y", async ({ page }) => {
  const { orgId, userId, tokenHash } = await seedClient(uniqueEmail("payer"));
  const service = serviceClient();
  const { data: tier } = await service
    .from("tiers")
    .insert({
      org_id: orgId,
      name: "Elite Coaching",
      price_cents: 15000,
      currency: "usd",
      features: { custom_lines: ["Weekly video call", "Priority replies"] },
    })
    .select("id")
    .single();
  // pay route is not consent-gated; sign the client in and land on /pay/[tier].
  void userId;

  await page.setViewportSize(DESKTOP);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/pay/${tier!.id}`);

  await expect(page.getByRole("heading", { name: "Elite Coaching" })).toBeVisible();
  await expect(page.getByText("$150.00")).toBeVisible();
  await expect(page.getByText("Weekly video call")).toBeVisible();
  await expect(page.getByText("Checkout isn’t available yet")).toBeVisible();

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);

  await page.setViewportSize(MOBILE);
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
});
