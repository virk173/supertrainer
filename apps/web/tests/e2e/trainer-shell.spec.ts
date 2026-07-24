import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { seedTrainer, uniqueEmail } from "./helpers";

const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 768, height: 1024 };
const MOBILE = { width: 375, height: 812 };
const SHOTS = "test-results/trainer-shell";

const PRIMARY_NAV = [
  "Home",
  "Inbox",
  "Queue",
  "Clients",
  "Plans",
  "Analytics",
  "Library",
];

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
    .exclude("nextjs-portal")
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
}

// Let style recalc + paint settle before axe reads computed colors (a theme flip
// scanned in the same frame reads stale foreground/background pairs).
async function settlePaint(page: Page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.waitForTimeout(100);
}

async function signInTrainer(page: Page, next = "/trainer") {
  const { tokenHash } = await seedTrainer(uniqueEmail("shell-trainer"));
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=${next}`);
  await expect(page.getByTestId("trainer-home")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.describe("trainer shell", () => {
  test("primary nav, ⌘K palette, theme switch, collapse persistence", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInTrainer(page);

    // Every primary destination is reachable from the sidebar.
    const primary = page.getByRole("navigation", { name: "Primary" });
    for (const label of PRIMARY_NAV) {
      await expect(primary.getByRole("link", { name: label })).toBeVisible();
    }

    // ⌘K opens the palette and focuses the input; Escape closes it.
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Command menu" });
    await expect(palette).toBeVisible();
    await expect(page.getByPlaceholder("Search or jump to…")).toBeFocused();
    await page.screenshot({ path: `${SHOTS}/shell-palette-open.png` });
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();

    // A palette action switches the theme end-to-end.
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("option", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Collapsing the rail persists across a reload (cookie → server render).
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await page.reload();
    await expect(page.getByTestId("trainer-home")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Expand sidebar" }),
    ).toBeVisible();

    // ⌘K search filters and jumps into a page, proving router + filter wiring.
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette).toBeVisible();
    await palette.getByPlaceholder("Search or jump to…").fill("Analytics");
    await palette.getByRole("option", { name: "Analytics", exact: true }).click();
    await expect(page).toHaveURL(/\/trainer\/analytics$/);
  });

  test("axe AA + no overflow: desktop light, desktop dark, tablet, mobile", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInTrainer(page);

    await expectNoHorizontalOverflow(page);
    await expectAxeAAClean(page);
    await page.screenshot({ path: `${SHOTS}/shell-desktop-light.png`, fullPage: true });

    // Desktop dark.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await settlePaint(page);
    await expectNoHorizontalOverflow(page);
    await expectAxeAAClean(page);
    await page.screenshot({ path: `${SHOTS}/shell-desktop-dark.png`, fullPage: true });

    // Back to light for the smaller viewports.
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await page.emulateMedia({ colorScheme: "light" });

    await page.setViewportSize(TABLET);
    await settlePaint(page);
    await expectNoHorizontalOverflow(page);
    await expectAxeAAClean(page);
    await page.screenshot({ path: `${SHOTS}/shell-tablet-light.png` });

    await page.setViewportSize(MOBILE);
    await settlePaint(page);
    await expectNoHorizontalOverflow(page);
    await expectAxeAAClean(page);
    await page.screenshot({ path: `${SHOTS}/shell-mobile-light.png` });
  });
});
