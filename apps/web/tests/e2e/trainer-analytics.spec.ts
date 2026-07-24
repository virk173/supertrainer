import { expect, test } from "@playwright/test";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

const DESKTOP = { width: 1280, height: 900 };
const SHOTS = "test-results/trainer-analytics";

function dayStr(offset: number): string {
  return new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
}

async function seedClient(
  orgId: string,
  name: string,
  opts: { days?: number; gap?: number; missy?: boolean } = {},
): Promise<string> {
  const service = serviceClient();
  const { data } = await service
    .from("clients")
    .insert({ org_id: orgId, source: "invite", status: "active", intake: { name } })
    .select("id")
    .single();
  const id = data!.id as string;
  const days = opts.days ?? 10;
  const start = opts.gap ?? 0;
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
  return id;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("trainer analytics: churn radar, histogram, zero-edit, a11y", async ({ page }) => {
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("analytics-trainer"));
  const service = serviceClient();

  const ava = await seedClient(orgId, "Ava Reyes");
  await seedClient(orgId, "Ben Okafor");
  await seedClient(orgId, "Marcus Bell", { days: 6, gap: 5, missy: true }); // churn: gap
  await seedClient(orgId, "Sara Lund", { missy: true }); // churn: low adherence

  // Zero-edit rate: 3 approved, 1 edited → 75%.
  await service.from("drafts").insert([
    { org_id: orgId, client_id: ava, category: "conversational", draft_text: "a", status: "approved" },
    { org_id: orgId, client_id: ava, category: "conversational", draft_text: "b", status: "approved" },
    { org_id: orgId, client_id: ava, category: "conversational", draft_text: "c", status: "approved" },
    { org_id: orgId, client_id: ava, category: "conversational", draft_text: "d", status: "edited" },
  ]);

  await page.setViewportSize(DESKTOP);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/analytics`);
  await expect(page.getByTestId("analytics-title")).toBeVisible();

  await expect(page.getByTestId("churn-radar")).toBeVisible();
  await expect(page.getByTestId("adherence-histogram")).toBeVisible();
  await expect(page.getByTestId("churn-radar").getByText("Marcus Bell")).toBeVisible();
  await expect(page.getByText("Logging stopped", { exact: false })).toBeVisible();
  await expect(page.getByText("75%")).toBeVisible();

  // The histogram bars actually painted.
  const barsOk = await page.evaluate(() => {
    const bars = document.querySelectorAll('[data-testid="adherence-histogram"] .recharts-bar-rectangle');
    return bars.length > 0;
  });
  expect(barsOk).toBe(true);

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/analytics-desktop-light.png`, fullPage: true });

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByTestId("analytics-title")).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/analytics-desktop-dark.png`, fullPage: true });
});
