import { expect, test } from "@playwright/test";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

const DESKTOP = { width: 1280, height: 900 };
const SHOTS = "test-results/trainer-profile";

function dayStr(offset: number): string {
  return new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("trainer profile: forensic grid + weight chart, a11y", async ({ page }) => {
  const { orgId, tokenHash } = await seedTrainer(uniqueEmail("profile-trainer"));
  const service = serviceClient();

  const { data: client } = await service
    .from("clients")
    .insert({
      org_id: orgId,
      source: "invite",
      status: "active",
      consent_signed_at: new Date().toISOString(),
      intake: { name: "Ava Reyes" },
    })
    .select("id")
    .single();
  const id = client!.id as string;

  // 40 days of ledger with variety: some missed, some late.
  const ledger = Array.from({ length: 40 }, (_, i) => {
    const missMeals = i % 5 === 0;
    const missTraining = i % 7 === 0;
    const late = i % 6 === 0;
    return {
      org_id: orgId,
      client_id: id,
      tz_date: dayStr(i),
      late,
      expected: { mode: "generic", mealSlots: [], minMeals: 2, weighIn: true, checkin: false, sets: true },
      misses: {
        mealSlots: [],
        meals: missMeals ? 2 : 0,
        weighIn: false,
        checkin: false,
        sets: missTraining,
        total: (missMeals ? 2 : 0) + (missTraining ? 1 : 0),
      },
    };
  });
  await service.from("ledger_days").insert(ledger);

  // A downward weight trend.
  const weighs = Array.from({ length: 8 }, (_, i) => ({
    org_id: orgId,
    client_id: id,
    tz_date: dayStr(35 - i * 5),
    weight_kg: 73.6 - i * 0.25,
  }));
  await service.from("weigh_ins").insert(weighs);

  await page.setViewportSize(DESKTOP);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/clients/${id}`);
  await expect(page.getByTestId("profile-title")).toBeVisible();

  await expect(page.getByTestId("forensic-grid")).toBeVisible();
  await expect(page.getByTestId("weight-chart")).toBeVisible();

  // The Recharts weight line actually painted (CSS-var stroke resolved).
  const strokeOk = await page.evaluate(() => {
    const path = document.querySelector(
      '[data-testid="weight-chart"] path.recharts-line-curve',
    ) as SVGPathElement | null;
    if (!path) return false;
    const stroke = getComputedStyle(path).stroke;
    return stroke !== "" && stroke !== "none" && !stroke.includes("rgba(0, 0, 0, 0)");
  });
  expect(strokeOk).toBe(true);

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/profile-desktop-light.png`, fullPage: true });

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByTestId("profile-title")).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/profile-desktop-dark.png`, fullPage: true });
});
