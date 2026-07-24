import { expect, test } from "@playwright/test";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

// Phase 8.5 — the headline deliverable: real subscription data lights up the P7
// MRR card + the revenue-by-tier donut.

test("analytics: MRR + revenue-by-tier donut render from real subscriptions", async ({ page }) => {
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("rev-trainer"));
  const service = serviceClient();

  const mk = async (name: string, price: number) => {
    const { data: tier } = await service
      .from("tiers")
      .insert({ org_id: orgId, name, price_cents: price, currency: "usd" })
      .select("id")
      .single();
    const { data: client } = await service
      .from("clients")
      .insert({ org_id: orgId, source: "invite", status: "active", intake: { name } })
      .select("id")
      .single();
    await service.from("subscriptions").insert({
      org_id: orgId,
      client_id: client!.id,
      tier_id: tier!.id,
      status: "active",
    });
  };
  await mk("Pro", 10000);
  await mk("Elite", 25000);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/analytics`);

  await expect(page.getByTestId("analytics-title")).toBeVisible();
  await expect(page.getByTestId("revenue-donut")).toBeVisible();
  // MRR = $100 + $250 = $350.
  await expect(page.getByText("$350", { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("revenue-donut").getByText("Elite")).toBeVisible();

  // The donut slices actually painted (Recharts async render).
  await expect(
    page.locator('[data-testid="revenue-donut"] .recharts-pie-sector').first(),
  ).toBeAttached({ timeout: 15_000 });

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: "test-results/revenue-ui/analytics-revenue.png", fullPage: true });
});
