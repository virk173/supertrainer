import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@supertrainer/db/types";

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

async function toggleDark(page: Page) {
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  // Let style recalc + paint settle before axe reads computed colors —
  // scanning in the same frame as the class flip reads stale values.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.waitForTimeout(100);
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
    // Seed a client the same way auth.spec.ts does — service role only.
    const service = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const email = `styleguide-client-${Date.now()}@test.local`;

    const { data: created, error: createError } =
      await service.auth.admin.createUser({ email, email_confirm: true });
    expect(createError).toBeNull();
    const userId = created!.user!.id;

    const { data: org, error: orgError } = await service
      .from("orgs")
      .insert({ name: "Styleguide Org", slug: `styleguide-${Date.now()}` })
      .select("id")
      .single();
    expect(orgError).toBeNull();

    await service.from("profiles").insert({
      id: userId,
      org_id: org!.id,
      role: "client",
      display_name: "Styleguide Client",
    });
    await service.from("clients").insert({
      org_id: org!.id,
      profile_id: userId,
      status: "active",
      source: "invite",
    });

    const { data: linkData, error: linkError } =
      await service.auth.admin.generateLink({ type: "magiclink", email });
    expect(linkError).toBeNull();

    await page.setViewportSize(MOBILE);
    await page.goto(
      `/auth/confirm?token_hash=${linkData!.properties!.hashed_token}&type=email&next=/portal`,
    );
    await expect(page.getByTestId("portal-home")).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectAxeAAClean(page);
    await page.screenshot({ path: `${SHOTS}/portal-mobile-light.png` });

    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expectNoHorizontalOverflow(page);
    await expectAxeAAClean(page);
    await page.screenshot({ path: `${SHOTS}/portal-mobile-dark.png` });

    await page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );
    await page.setViewportSize(DESKTOP);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/portal-desktop-light.png` });
  });
});
