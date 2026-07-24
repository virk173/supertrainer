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
  const service = serviceClient();

  // All seven steps start unresolved (Phase 8.1 added the 'payments' step).
  await expect(page.getByTestId("onboarding-progress-count")).toHaveText("0 / 7");
  await expect(page.getByTestId("step-status-brand")).toHaveText("To do");

  // Skip an earlier, skippable step through the UI (brand is open by default).
  await page.getByTestId("skip-brand").click();
  await expect(page.getByTestId("step-status-brand")).toHaveText("Skipped");

  // Complete a LATER step out of order at the data layer (its own real flow is
  // covered by that step's spec; here we exercise the engine's ordering).
  await service
    .from("org_onboarding_state")
    .upsert(
      { org_id: orgId, step: "invite", status: "done", completed_at: new Date().toISOString() },
      { onConflict: "org_id,step" },
    )
    .throwOnError();

  // Reload mid-flow: both the completion and the skip survive.
  await page.reload();
  await expect(page.getByTestId("onboarding-progress-count")).toHaveText("2 / 7");
  await expect(page.getByTestId("step-status-invite")).toHaveText("Done");
  await expect(page.getByTestId("step-status-brand")).toHaveText("Skipped");
});

test("resume banner shows while steps remain, clears on completion", async ({
  page,
}) => {
  const { orgId } = await signInAsTrainer(page);

  // Steps remain → the trainer shell shows the resume banner.
  await page.goto("/trainer");
  await expect(page.getByTestId("trainer-home")).toBeVisible();
  await expect(page.getByTestId("resume-onboarding-banner")).toBeVisible();

  // Every step now has a real flow (covered by its own spec); this test only
  // cares about banner logic, so resolve them all at the data layer.
  await serviceClient()
    .from("org_onboarding_state")
    .upsert(
      (["brand", "style", "tiers", "import", "demo", "invite", "payments"] as const).map(
        (step) => ({
          org_id: orgId,
          step,
          status: "done" as const,
          completed_at: new Date().toISOString(),
        }),
      ),
      { onConflict: "org_id,step" },
    )
    .throwOnError();

  // Everything resolved → celebratory completion state.
  await page.goto("/onboarding");
  await expect(page.getByTestId("onboarding-progress-count")).toHaveText("7 / 7");
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
