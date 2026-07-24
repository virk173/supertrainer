import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// Shared a11y + layout gates for the dashboard specs (7.2–7.7).

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);
}

// Settle before axe reads computed colors. Two frames + a full computed-style
// read force every oklch→lab color to resolve up front; without this, axe can
// read a card background mid-resolution on a freshly-hydrated page and report a
// phantom contrast failure (the real colors are AA-clean — verified against
// getComputedStyle). reduced-motion (set per-spec) keeps theme flips instant.
export async function settlePaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const cs = getComputedStyle(el);
      void cs.color;
      void cs.backgroundColor;
    }
  });
  await page.waitForTimeout(100);
}

async function scanViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .exclude("nextjs-portal")
    .analyze();
  return results.violations;
}

export async function expectAxeAAClean(page: Page): Promise<void> {
  let violations = await scanViolations(page);
  // axe-core's computed-color read is intermittently wrong for oklch→lab card
  // backgrounds under CPU load, producing PHANTOM color-contrast failures (the
  // real colors are AA-clean — verified against getComputedStyle). When contrast
  // is the ONLY issue, re-settle and re-scan once: a genuine violation persists
  // across both reads; a phantom one clears.
  if (violations.length > 0 && violations.every((v) => v.id === "color-contrast")) {
    await settlePaint(page);
    await page.waitForTimeout(300);
    violations = await scanViolations(page);
  }
  expect(
    violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
}
