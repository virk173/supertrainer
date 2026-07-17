import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { consentClient, seedClient, uniqueEmail } from "./helpers";

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 375, height: 812 };
const SHOTS = "test-results/styleguide";

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);
}

async function expectAxeAAClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .exclude("nextjs-portal") // Next dev overlay, not our UI
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
}

// Let style recalc + paint settle before axe reads computed colors — scanning
// in the same frame as a theme-class flip reads stale values (a dark surface
// with a not-yet-updated light foreground → false contrast failures, seen only
// on slower CI runners).
async function settlePaint(page: Page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.waitForTimeout(100);
}

async function toggleDark(page: Page) {
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await settlePaint(page);
}

// Color transitions run ~150ms after a theme flip; axe must not scan
// mid-transition. Reduced motion (honored by the design system) makes theme
// changes effectively instant.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.describe("styleguide", () => {
  test("desktop light + dark: overflow-free, axe AA clean", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/styleguide");
    await expect(
      page.getByRole("heading", { name: "Portal shell" }),
    ).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectAxeAAClean(page);
    await page.screenshot({
      path: `${SHOTS}/styleguide-desktop-light.png`,
      fullPage: true,
    });

    await toggleDark(page);
    await expectNoHorizontalOverflow(page);
    await expectAxeAAClean(page);
    await page.screenshot({
      path: `${SHOTS}/styleguide-desktop-dark.png`,
      fullPage: true,
    });
  });

  test("mobile light + dark: overflow-free", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/styleguide");
    await expect(
      page.getByRole("heading", { name: "Portal shell" }),
    ).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: `${SHOTS}/styleguide-mobile-light.png`,
      fullPage: true,
    });

    await toggleDark(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: `${SHOTS}/styleguide-mobile-dark.png`,
      fullPage: true,
    });
  });
});

test.describe("portal shell on the real route", () => {
  test("mobile + desktop, light + dark: overflow-free, axe AA clean", async ({
    page,
  }) => {
    // Seed a client (service role) and sign in through the real confirm route.
    const { userId, tokenHash } = await seedClient(uniqueEmail("styleguide-client"));
    // Past the consent gate so the portal shell renders for this QA pass.
    await consentClient(userId);

    await page.setViewportSize(MOBILE);
    await page.goto(
      `/auth/confirm?token_hash=${tokenHash}&type=email&next=/portal`,
    );
    await expect(page.getByTestId("portal-home")).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectAxeAAClean(page);
    await page.screenshot({ path: `${SHOTS}/portal-mobile-light.png` });

    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await settlePaint(page);
    await expectNoHorizontalOverflow(page);
    await expectAxeAAClean(page);
    await page.screenshot({ path: `${SHOTS}/portal-mobile-dark.png` });

    // Reset BOTH the class and the emulated media, or the "light" desktop shot
    // is captured while prefers-color-scheme:dark is still emulated.
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize(DESKTOP);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/portal-desktop-light.png` });
  });
});
