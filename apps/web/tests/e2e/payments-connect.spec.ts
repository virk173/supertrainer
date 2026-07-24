import { expect, test } from "@playwright/test";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { seedTrainer, uniqueEmail } from "./helpers";

// Phase 8.1 — the trainer payments settings surface. Stripe keys are unset in
// CI/dev (STRIPE_SECRET_KEY absent), so the page renders its gated state — the
// deterministic path the merge gate verifies. Full a11y floor: axe AA clean +
// zero horizontal overflow at desktop / tablet / mobile + dark.

const DESKTOP = { width: 1280, height: 900 };
const TABLET = { width: 768, height: 1024 };
const MOBILE = { width: 375, height: 812 };
const SHOTS = "test-results/payments-connect";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("settings index links to payments", async ({ page }) => {
  const { tokenHash } = await seedTrainer(uniqueEmail("settings-trainer"));
  await page.setViewportSize(DESKTOP);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/settings`);

  await expect(page.getByTestId("settings")).toBeVisible();
  const paymentsLink = page.getByRole("link", { name: /Payments/ });
  await expect(paymentsLink.first()).toBeVisible();

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
});

test("payments settings: gated state, a11y across breakpoints + dark", async ({ page }) => {
  const { tokenHash } = await seedTrainer(uniqueEmail("payments-trainer"));

  await page.setViewportSize(DESKTOP);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/trainer/settings/payments`);

  await expect(page.getByTestId("payments-title")).toBeVisible();
  // No Stripe keys in CI → the guided "not available yet" state, interface voice.
  await expect(page.getByText("Payments aren’t available yet")).toBeVisible();

  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/payments-desktop-light.png`, fullPage: true });

  // Tablet + mobile — zero horizontal overflow at each.
  await page.setViewportSize(TABLET);
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize(MOBILE);
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/payments-mobile-light.png`, fullPage: true });

  // Dark theme (a fresh reload, per the DESIGN.md a11y-scan convention).
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByTestId("payments-title")).toBeVisible();
  await settlePaint(page);
  await expectNoHorizontalOverflow(page);
  await expectAxeAAClean(page);
  await page.screenshot({ path: `${SHOTS}/payments-desktop-dark.png`, fullPage: true });
});
