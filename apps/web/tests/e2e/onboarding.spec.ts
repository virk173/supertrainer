import { expect, test } from "@playwright/test";

import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

// Signs the seeded trainer in through the real confirm route so the session
// carries owner org_id/user_role claims, then lands on the checklist.
async function signInAsTrainer(page: import("@playwright/test").Page) {
  const email = uniqueEmail("trainer");
  const { orgId, tokenHash } = await seedTrainer(email);
  await page.goto(
    `/auth/confirm?token_hash=${tokenHash}&type=email&next=/onboarding`,
  );
  await expect(page.getByTestId("org-ready")).toBeVisible();
  return { orgId };
}

test("activation checklist: out-of-order progress persists across reloads", async ({
  page,
}) => {
  const { orgId } = await signInAsTrainer(page);

  // All six steps start unresolved.
  await expect(page.getByTestId("onboarding-progress-count")).toHaveText("0 / 6");
  await expect(page.getByTestId("step-status-brand")).toHaveText("To do");

  // Complete a LATER step first (out of order) via its deep-link + stub flow.
  await page.getByTestId("step-tiers").locator('[data-slot="accordion-trigger"]').click();
  await page.getByTestId("open-tiers").click();
  await expect(page).toHaveURL(/\/onboarding\/tiers/);
  await page.getByTestId("complete-tiers").click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByTestId("step-status-tiers")).toHaveText("Done");

  // Skip an earlier, skippable step (brand is open by default).
  await page.getByTestId("skip-brand").click();
  await expect(page.getByTestId("step-status-brand")).toHaveText("Skipped");

  // Reload mid-flow: both the completion and the skip survive.
  await page.reload();
  await expect(page.getByTestId("onboarding-progress-count")).toHaveText("2 / 6");
  await expect(page.getByTestId("step-status-tiers")).toHaveText("Done");
  await expect(page.getByTestId("step-status-brand")).toHaveText("Skipped");

  // The funnel event fired for the completed step (not the skipped one).
  const service = serviceClient();
  const { data: events } = await service
    .from("events")
    .select("type, payload")
    .eq("org_id", orgId)
    .eq("type", "onboarding_step_completed");
  expect(events?.length).toBe(1);
  expect(events?.[0]?.payload).toMatchObject({ step: "tiers" });
});

test("resume banner shows while steps remain, clears on completion", async ({
  page,
}) => {
  await signInAsTrainer(page);

  // Steps remain → the trainer shell shows the resume banner.
  await page.goto("/trainer");
  await expect(page.getByTestId("trainer-home")).toBeVisible();
  await expect(page.getByTestId("resume-onboarding-banner")).toBeVisible();

  // Resolve every step: skip the skippables, complete the rest through stubs.
  await page.goto("/onboarding");
  for (const step of ["brand", "import"]) {
    await page
      .getByTestId(`step-${step}`)
      .locator('[data-slot="accordion-trigger"]')
      .click();
    await page.getByTestId(`skip-${step}`).click();
    await expect(page.getByTestId(`step-status-${step}`)).toHaveText("Skipped");
  }
  for (const step of ["style", "tiers", "demo", "invite"]) {
    await page.goto(`/onboarding/${step}`);
    await page.getByTestId(`complete-${step}`).click();
    await expect(page).toHaveURL(/\/onboarding$/);
  }

  // Everything resolved → celebratory completion state.
  await expect(page.getByTestId("onboarding-progress-count")).toHaveText("6 / 6");
  await expect(page.getByTestId("onboarding-complete")).toBeVisible();

  // With onboarding complete the server stops rendering the banner.
  await page.goto("/trainer");
  await expect(page.getByTestId("trainer-home")).toBeVisible();
  await expect(page.getByTestId("resume-onboarding-banner")).toHaveCount(0);
});

test("resume banner is dismissible while steps still remain", async ({
  page,
}) => {
  await signInAsTrainer(page);

  await page.goto("/trainer");
  await expect(page.getByTestId("resume-onboarding-banner")).toBeVisible();

  await page.getByTestId("dismiss-resume-banner").click();
  await expect(page.getByTestId("resume-onboarding-banner")).toHaveCount(0);

  // Dismissal persists across reloads (localStorage) even though steps remain.
  await page.reload();
  await expect(page.getByTestId("trainer-home")).toBeVisible();
  await expect(page.getByTestId("resume-onboarding-banner")).toHaveCount(0);
});
