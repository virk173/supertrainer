import { expect, test, type Page } from "@playwright/test";

import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

async function signInAsTrainer(page: Page) {
  const email = uniqueEmail("invite-trainer");
  const { orgId, tokenHash } = await seedTrainer(email);
  await page.goto(
    `/auth/confirm?token_hash=${tokenHash}&type=email&next=/onboarding/invite`,
  );
  return { orgId };
}

test("invite loop: issue → join creates the client account → lands on portal", async ({
  page,
  browser,
}) => {
  const { orgId } = await signInAsTrainer(page);
  const service = serviceClient();

  // A previously imported lead with an email.
  const clientEmail = uniqueEmail("lead");
  const { data: lead } = await service
    .from("clients")
    .insert({
      org_id: orgId,
      status: "lead",
      source: "import",
      intake: { email: clientEmail, name: "Imported Lead" },
    })
    .select("id")
    .single()
    .throwOnError();

  // Trainer generates a copy-link invite for that lead.
  await page.goto("/onboarding/invite");
  await page.getByTestId("invite-lead").selectOption(lead!.id);
  await page.getByTestId("generate-invite").click();
  await expect(page.getByTestId("issued-invite")).toBeVisible();
  const link = (await page.getByTestId("invite-link").innerText()).trim();
  expect(link).toContain("/join/");

  // The invite step completed.
  await page.goto("/onboarding");
  await expect(page.getByTestId("step-status-invite")).toHaveText("Done");

  // A second browser context = the invited client opening the link.
  const clientCtx = await browser.newContext();
  const clientPage = await clientCtx.newPage();
  await clientPage.goto(link);
  await expect(clientPage.getByTestId("join-valid")).toBeVisible();
  await clientPage.getByTestId("accept-invite").click();

  // Accepting creates the account, logs them in, and lands on the portal.
  await expect(clientPage.getByTestId("portal-home")).toBeVisible();
  await expect(clientPage).toHaveURL(/\/portal/);

  // The lead is now a claimed client with a linked profile.
  const { data: claimed } = await service
    .from("clients")
    .select("profile_id, status")
    .eq("id", lead!.id)
    .single();
  expect(claimed?.profile_id).toBeTruthy();
  expect(claimed?.status).toBe("onboarding");

  // The whole funnel fired.
  const { data: events } = await service
    .from("events")
    .select("type")
    .eq("org_id", orgId)
    .in("type", ["invite_sent", "invite_opened", "invite_accepted"]);
  const types = new Set((events ?? []).map((e) => e.type));
  expect(types.has("invite_sent")).toBe(true);
  expect(types.has("invite_opened")).toBe(true);
  expect(types.has("invite_accepted")).toBe(true);

  await clientCtx.close();
});

test("invite: an invalid token shows the expired state", async ({ page }) => {
  await page.goto("/join/not-a-real-token");
  await expect(page.getByText("Invite invalid or expired")).toBeVisible();
});

test("invite: rejects an invalid email address", async ({ page }) => {
  await signInAsTrainer(page);
  await page.goto("/onboarding/invite");
  // No leads seeded → the email field is shown.
  await page.getByTestId("invite-email").fill("not-an-email");
  await page.getByTestId("generate-invite").click();
  await expect(page.getByText("Enter a valid email.")).toBeVisible();
});
