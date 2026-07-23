import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { computeConfirmedItems, resolveMealItems } from "../../lib/ledger/resolve";
import { consentClient, seedClient, serviceClient, uniqueEmail } from "./helpers";

// The core guarantee (DoD): every number a client sees or that gets stored is
// computed IN CODE from the foods table — the model only splits the text. This
// runs the real resolve + authoritative-recompute paths, no browser, no AI.
test("pipeline: parsed items resolve to verified DB macros; unknown foods stay unverified", async () => {
  const service = serviceClient();

  const resolved = await resolveMealItems(service, [
    { name: "roti", qty: 2, unit: "rotis" },
    { name: "moong dal", qty: 1, unit: "katori" },
    { name: "zzxqwv notafood", qty: 1, unit: null },
  ]);
  const [roti, dal, unknown] = resolved;

  // "2 rotis" -> Roti (whole wheat), 40 g/piece -> 80 g -> 238 kcal (297/100g).
  expect(roti.selection?.name).toBe("Roti (whole wheat)");
  expect(roti.selection?.grams).toBe(80);
  expect(roti.selection?.macros.kcal).toBe(238);
  expect(roti.unverified).toBe(false);

  // "1 katori" of a dal -> 150 g.
  expect(dal.selection).not.toBeNull();
  expect(dal.selection?.grams).toBe(150);

  // No DB match -> unverified freeform (no numbers, flagged for the trainer).
  expect(unknown.unverified).toBe(true);
  expect(unknown.selection).toBeNull();

  // The confirm-time recompute trusts only the DB, never the client's numbers.
  const { items, totals } = await computeConfirmedItems(service, randomUUID(), [
    { foodId: roti.selection!.id, name: "roti", qty: 2, unit: "rotis", grams: 80 },
    { foodId: null, name: "mystery snack", qty: 1, unit: null, grams: 50 },
  ]);
  expect(items[0].kcal).toBe(238);
  expect(items[0].verified).toBe(true);
  expect(items[1].verified).toBe(false);
  expect(items[1].kcal).toBeNull();
  expect(totals.kcal).toBe(238);
});

test("portal: the meal logger renders for a signed-in client (mobile, no overflow)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { userId, tokenHash } = await seedClient(uniqueEmail("meal-log-ui"));
  await consentClient(userId);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/portal/log`);

  await expect(page.getByTestId("meal-logger")).toBeVisible();
  await expect(page.getByTestId("meal-input")).toBeVisible();
  await expect(page.getByTestId("slot-lunch")).toBeVisible();
  await expect(page.getByTestId("meal-photo")).toBeVisible();
  await expect(page.getByTestId("meal-voice")).toBeVisible();

  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noOverflow).toBe(true);
});

// The ≤2-tap DoD (Add, then Confirm). Needs the live parse model; skipped in CI
// where no ANTHROPIC_API_KEY is present, like the other live-AI specs.
test("portal: text log is two taps and persists a verified log", async ({ page }) => {
  test.skip(!process.env.ANTHROPIC_API_KEY, "needs ANTHROPIC_API_KEY for the live parse");
  const { userId, orgId, tokenHash } = await seedClient(uniqueEmail("meal-log-live"));
  await consentClient(userId);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/portal/log`);

  await page.getByTestId("meal-input").fill("2 rotis, dal, salad");
  await page.getByTestId("meal-parse").click(); // tap 1
  await expect(page.getByTestId("meal-confirm-card")).toBeVisible();
  await expect(page.getByTestId("meal-item").first()).toBeVisible();
  await page.getByTestId("meal-confirm").click(); // tap 2
  await expect(page.getByTestId("meal-logged")).toBeVisible();

  const service = serviceClient();
  const { data } = await service.from("meal_logs").select("id, method, totals").eq("org_id", orgId);
  expect(data?.length).toBe(1);
  expect(data?.[0]?.method).toBe("text");
});
