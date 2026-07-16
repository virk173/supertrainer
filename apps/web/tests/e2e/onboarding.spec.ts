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
  // 'demo' is still a generic stub (its real flow lands in 1.6).
  await page.getByTestId("step-demo").locator('[data-slot="accordion-trigger"]').click();
  await page.getByTestId("open-demo").click();
  await expect(page).toHaveURL(/\/onboarding\/demo/);
  await page.getByTestId("complete-demo").click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByTestId("step-status-demo")).toHaveText("Done");

  // Skip an earlier, skippable step (brand is open by default).
  await page.getByTestId("skip-brand").click();
  await expect(page.getByTestId("step-status-brand")).toHaveText("Skipped");

  // Reload mid-flow: both the completion and the skip survive.
  await page.reload();
  await expect(page.getByTestId("onboarding-progress-count")).toHaveText("2 / 6");
  await expect(page.getByTestId("step-status-demo")).toHaveText("Done");
  await expect(page.getByTestId("step-status-brand")).toHaveText("Skipped");

  // The funnel event fired for the completed step (not the skipped one).
  const service = serviceClient();
  const { data: events } = await service
    .from("events")
    .select("type, payload")
    .eq("org_id", orgId)
    .eq("type", "onboarding_step_completed");
  expect(events?.length).toBe(1);
  expect(events?.[0]?.payload).toMatchObject({ step: "demo" });
});

test("resume banner shows while steps remain, clears on completion", async ({
  page,
}) => {
  const { orgId } = await signInAsTrainer(page);

  // Steps remain → the trainer shell shows the resume banner.
  await page.goto("/trainer");
  await expect(page.getByTestId("trainer-home")).toBeVisible();
  await expect(page.getByTestId("resume-onboarding-banner")).toBeVisible();

  // Resolve every step. brand/style/tiers/import now have real flows (covered
  // by their own specs); this test only cares about banner logic, so mark them
  // done at the data layer and drive the remaining stub steps through the UI.
  await serviceClient()
    .from("org_onboarding_state")
    .upsert(
      ["brand", "style", "tiers", "import"].map((step) => ({
        org_id: orgId,
        step,
        status: "done",
        completed_at: new Date().toISOString(),
      })),
      { onConflict: "org_id,step" },
    )
    .throwOnError();

  for (const step of ["demo", "invite"]) {
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
