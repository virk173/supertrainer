import { expect, test } from "@playwright/test";

import {
  confirmLinkFromEmail,
  serviceClient,
  seedClient,
  uniqueEmail,
} from "./helpers";

test("signup → org created → lands on /onboarding → owner reaches /trainer", async ({
  page,
}) => {
  const email = uniqueEmail("trainer");

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByTestId("otp-sent")).toBeVisible();

  const link = await confirmLinkFromEmail(email);
  await page.goto(link);

  // Post-signup bootstrap created the org and landed us on /onboarding.
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByTestId("org-ready")).toBeVisible();

  // The org + owner profile really exist in the database.
  const service = serviceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("role, org_id")
    .eq("display_name", email.split("@")[0])
    .single();
  expect(profile?.role).toBe("owner");
  expect(profile?.org_id).toBeTruthy();

  // The refreshed JWT carries owner claims — /trainer is reachable.
  await page.goto("/trainer");
  await expect(page.getByTestId("trainer-home")).toBeVisible();
});

test("client role is blocked from /trainer routes", async ({ page }) => {
  const { tokenHash } = await seedClient(uniqueEmail("client"));

  // Sign in through the real confirm route using an admin-generated token.
  await page.goto(
    `/auth/confirm?token_hash=${tokenHash}&type=email&next=/portal`,
  );
  await expect(page.getByTestId("portal-home")).toBeVisible();

  // The role guard bounces clients from /trainer back to /portal.
  await page.goto("/trainer");
  await expect(page).toHaveURL(/\/portal/);
  await expect(page.getByTestId("portal-home")).toBeVisible();
});
