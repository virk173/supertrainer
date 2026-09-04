import { expect, test } from "@playwright/test";

import { expectAxeAAClean, expectNoHorizontalOverflow, settlePaint } from "./axe";
import { COMPETITORS } from "@/lib/marketing/competitors";
import { PLANS } from "@/lib/marketing/pricing";

// Phase 9.5 — the public site. Every page a stranger can reach has to be
// accessible and honest: the comparison figures carry their source and date, the
// legal drafts say they're drafts, and nothing behind auth is in the sitemap.

const PAGES = [
  { path: "/", name: "landing" },
  { path: "/pricing", name: "pricing" },
  { path: "/switch", name: "switching" },
  { path: "/security", name: "security" },
  { path: "/docs/data", name: "data promise" },
  { path: "/compare/trainerize", name: "comparison" },
  { path: "/legal/terms", name: "terms" },
  { path: "/legal/privacy", name: "privacy" },
];

for (const { path, name } of PAGES) {
  test(`${name} is accessible and fits every screen`, async ({ page }) => {
    for (const width of [1280, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await settlePaint(page);
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(path);
    await settlePaint(page);
    await expectAxeAAClean(page);

    // …and in dark.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await settlePaint(page);
    await expectNoHorizontalOverflow(page);
    await expectAxeAAClean(page);
  });
}

test("the hero calculator does the coach's own math", async ({ page }) => {
  await page.goto("/");
  const calc = page.getByTestId("capacity-calculator");
  await expect(calc).toBeVisible();

  // 35 clients × 25 min = 875 min = 14.6 h; 60% of it is 8.8 h.
  await expect(calc).toContainText("14.6 h");
  await expect(calc).toContainText("8.8 h");

  // Drag the share to zero: no hours returned, and no invented benefit.
  await page.getByLabel(/Share of that/).fill("0");
  await expect(calc).toContainText("0 min");
  await expect(calc).toContainText("the same book, earlier evenings");

  // A bigger share returns more — stated as message hours, never as a promise
  // that the whole book scales with it.
  await page.getByLabel(/Share of that/).fill("80");
  await expect(calc).toContainText("the same message hours would cover");
  await expect(calc).toContainText("counts message time and nothing else");
});

test("the comparison names its source and the date it was read", async ({ page }) => {
  for (const c of COMPETITORS) {
    await page.goto(`/compare/${c.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(c.name);
    // The vendor's own page, linked, and the date the figures came from.
    await expect(page.locator(`a[href="${c.source}"]`).first()).toBeVisible();
    await expect(page.getByText("September 4, 2026").first()).toBeVisible();
    // And it says where the competitor is the better choice — a comparison that
    // only flatters its author is worth nothing.
    await expect(page.getByText(`Where ${c.name} is the better choice`)).toBeVisible();
  }
});

test("every published price comes from one place", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByTestId("plan-card")).toHaveCount(PLANS.length);
  for (const plan of PLANS) {
    await expect(page.getByText(`$${Math.round(plan.annualMonthlyCents / 100)}`).first()).toBeVisible();
  }
});

test("the legal drafts say they are drafts, and are not indexed", async ({ page }) => {
  for (const path of ["/legal/terms", "/legal/privacy"]) {
    await page.goto(path);
    await expect(page.getByTestId("legal-draft-banner")).toContainText("pending legal review");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots, `${path} must not be indexed while it is a draft`).toContain("noindex");
  }
});

test("robots and the sitemap keep private routes out of search", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const robotsText = await robots.text();
  for (const path of ["/portal", "/trainer", "/admin", "/api/", "/legal/"]) {
    expect(robotsText, `${path} must be disallowed`).toContain(path);
  }

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  // Compare whole paths, not substrings: "/compare/trainerize" contains
  // "/trainer", and a naive check would pass for the wrong reason.
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  expect(paths).toContain("/pricing");
  expect(paths).toContain("/compare/trainerize");
  for (const listed of paths) {
    for (const secret of ["/portal", "/trainer", "/admin", "/onboarding", "/legal"]) {
      expect(
        listed === secret || listed.startsWith(`${secret}/`),
        `${listed} must not be in the sitemap`,
      ).toBe(false);
    }
  }
});

test("the social card renders", async ({ page, request }) => {
  await page.goto("/");
  // Next hashes the generated image's URL, so read it off the page rather than
  // guessing a path that will change on the next build.
  const url = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(url, "the landing page must advertise a social card").toBeTruthy();
  const res = await request.get(url!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});
