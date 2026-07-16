import { expect, test, type Page } from "@playwright/test";

import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

async function signInAsTrainer(page: Page) {
  const email = uniqueEmail("tier-trainer");
  const { orgId, tokenHash } = await seedTrainer(email);
  await page.goto(
    `/auth/confirm?token_hash=${tokenHash}&type=email&next=/onboarding/tiers`,
  );
  await expect(page.getByTestId("tier-editors")).toBeVisible();
  return { orgId };
}

test("tier builder: rename + reorder saves, persists, completes the step", async ({
  page,
}) => {
  const { orgId } = await signInAsTrainer(page);

  // Template ladder pre-filled with 4 tiers.
  await expect(page.getByTestId("tier-name-0")).toHaveValue("Basic");
  await expect(page.getByTestId("tier-name-3")).toHaveValue("Platinum");

  // Rename Basic → Starter, then move it below Silver.
  await page.getByTestId("tier-name-0").fill("Starter");
  await page.getByTestId("tier-down-0").click();
  await expect(page.getByTestId("tier-name-0")).toHaveValue("Silver");
  await expect(page.getByTestId("tier-name-1")).toHaveValue("Starter");

  await page.getByTestId("save-tiers").click();
  await expect(page.getByTestId("tiers-saved")).toBeVisible();

  // Persisted in position order.
  const service = serviceClient();
  const { data: rows } = await service
    .from("tiers")
    .select("name, position")
    .eq("org_id", orgId)
    .order("position", { ascending: true });
  expect(rows?.map((r) => r.name)).toEqual([
    "Silver",
    "Starter",
    "Gold",
    "Platinum",
  ]);

  // Reorder survives a reload.
  await page.reload();
  await expect(page.getByTestId("tier-name-0")).toHaveValue("Silver");
  await expect(page.getByTestId("tier-name-1")).toHaveValue("Starter");

  // Step complete.
  await page.goto("/onboarding");
  await expect(page.getByTestId("step-status-tiers")).toHaveText("Done");
});

test("tier builder: min one tier and price validation", async ({ page }) => {
  await signInAsTrainer(page);

  // Remove down to a single tier; the last remove button is then disabled.
  await page.getByTestId("tier-remove-3").click();
  await page.getByTestId("tier-remove-2").click();
  await page.getByTestId("tier-remove-1").click();
  await expect(page.getByTestId("tier-remove-0")).toBeDisabled();

  // A negative price is rejected and blocks saving.
  await page.getByTestId("tier-price-0").fill("-5");
  await expect(page.getByTestId("tier-error")).toBeVisible();
  await expect(page.getByTestId("save-tiers")).toBeDisabled();
});
