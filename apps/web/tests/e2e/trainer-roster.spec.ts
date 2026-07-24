import { expect, test } from "@playwright/test";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

const DESKTOP = { width: 1280, height: 900 };
const SHOTS = "test-results/trainer-roster";

function dayStr(offset: number): string {
  return new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
}

async function seedClient(
  orgId: string,
  name: string,
  opts: {
    status?: "active" | "onboarding" | "paused";
    days?: number;
    gap?: number;
    missy?: boolean;
  } = {},
): Promise<void> {
  const service = serviceClient();
  const { data } = await service
    .from("clients")
    .insert({ org_id: orgId, source: "invite", status: opts.status ?? "active", intake: { name } })
    .select("id")
    .single();
  const id = data!.id as string;
  const days = opts.days ?? 10;
  const start = opts.gap ?? 0;
  if (days > 0) {
    await service.from("ledger_days").insert(
      Array.from({ length: days }, (_, i) => ({
        org_id: orgId,
        client_id: id,
        tz_date: dayStr(start + i),
        expected: { mode: "generic", mealSlots: [], minMeals: 2, weighIn: true, checkin: false, sets: true },
        misses: opts.missy
          ? { mealSlots: [], meals: 2, weighIn: true, checkin: false, sets: true, total: 4 }
          : { mealSlots: [], meals: 0, weighIn: false, checkin: false, sets: false, total: 0 },
      })),
    );
  }
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("trainer roster: table, filters, bulk select, a11y", async ({ page }) => {
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("roster-trainer"));

  await seedClient(orgId, "Ava Reyes");
  await seedClient(orgId, "Ben Okafor");
  await seedClient(orgId, "Chloe Tan");
  await seedClient(orgId, "Marcus Bell", { days: 6, gap: 5, missy: true }); // at-risk (gap)
  await seedClient(orgId, "Priya Nair", { status: "onboarding", days: 0 });

  await page.setViewportSize(DESKTOP);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/clients`);
  await expect(page.getByTestId("roster-title")).toBeVisible();
  await expect(page.getByTestId("roster-row")).toHaveCount(5);

  // a11y on the fresh table.
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/roster-desktop-light.png`, fullPage: true });

  // Search filters + reflects in the URL.
  await page.getByTestId("roster-search").fill("Ava");
  await expect(page.getByTestId("roster-row")).toHaveCount(1);
  await expect(page).toHaveURL(/q=Ava/);
  await page.getByTestId("roster-search").fill("");

  // Status filter.
  await page.getByRole("button", { name: "onboarding" }).click();
  await expect(page.getByTestId("roster-row")).toHaveCount(1);
  await expect(page).toHaveURL(/status=onboarding/);
  await page.getByRole("button", { name: "All", exact: true }).click();

  // At-risk filter finds Marcus (logging gap).
  await page.getByTestId("filter-at-risk").click();
  await expect(page.getByTestId("roster-row")).toHaveCount(1);
  await expect(page.getByText("Marcus Bell")).toBeVisible();
  await page.getByTestId("filter-at-risk").click();

  // Bulk selection → export appears.
  await page.getByRole("checkbox", { name: "Select all" }).check();
  await expect(page.getByTestId("bulk-bar")).toBeVisible();
  await expect(page.getByTestId("bulk-export")).toBeVisible();

  // Dark, fresh render.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByTestId("roster-title")).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/roster-desktop-dark.png`, fullPage: true });
});
