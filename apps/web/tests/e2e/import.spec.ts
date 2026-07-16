import { expect, test, type Page } from "@playwright/test";

import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

async function signInAsTrainer(page: Page) {
  const email = uniqueEmail("import-trainer");
  const { orgId, tokenHash } = await seedTrainer(email);
  await page.goto(
    `/auth/confirm?token_hash=${tokenHash}&type=email&next=/onboarding/import`,
  );
  await expect(page.getByText("Upload your client export")).toBeVisible();
  return { orgId };
}

// Messy export: extra column, unicode names, a missing-contact row, an invalid
// email, and a duplicate email.
const MESSY_CSV = `Full Name,E-mail,Mobile,Allergies,CRM Tag,Notes
José García,jose@example.com,555-0101,"Peanuts, Shellfish",vip,Returning
Анна Иванова,,,,cold,
Bob Stone,not-an-email,555-0103,,,New lead
José García,jose@example.com,555-0104,,dup,Second sheet row`;

async function uploadAndMap(page: Page, mapAllergies: boolean) {
  await page.getByTestId("roster-input").setInputFiles({
    name: "roster.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(MESSY_CSV, "utf8"),
  });
  await expect(page.getByTestId("import-map")).toBeVisible();
  // Wait for the AI proposal to settle (or fail) so it can't overwrite our
  // manual selections mid-test.
  await expect(page.getByText("We proposed a mapping")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("map-name").selectOption("Full Name");
  await page.getByTestId("map-email").selectOption("E-mail");
  await page.getByTestId("map-phone").selectOption("Mobile");
  // Set allergies explicitly either way, overriding any AI proposal, so the
  // mapped/unmapped state is deterministic.
  await page
    .getByTestId("map-allergies")
    .selectOption(mapAllergies ? "Allergies" : "");

  await page.getByTestId("import-continue").click();
  await expect(page.getByTestId("import-review")).toBeVisible();
}

test("import wizard: messy CSV → validate → import → draft invites → undo", async ({
  page,
}) => {
  const { orgId } = await signInAsTrainer(page);
  await uploadAndMap(page, true);

  // Validation flags the three bad rows; all four still import as leads.
  const issues = page.getByTestId("row-issues");
  await expect(issues).toContainText("Row 2");
  await expect(issues).toContainText("No email or phone");
  await expect(issues).toContainText("Row 3");
  await expect(issues).toContainText("Invalid email");
  await expect(issues).toContainText("Row 4");
  await expect(issues).toContainText("Duplicate email");
  await expect(page.getByTestId("allergies-warning")).toHaveCount(0);

  await page.getByTestId("import-confirm").click();
  await expect(page.getByTestId("import-done")).toBeVisible();

  // Four lead clients imported; allergies parsed into health_flags.
  const service = serviceClient();
  const { data: clients } = await service
    .from("clients")
    .select("status, source, intake, health_flags")
    .eq("org_id", orgId);
  expect(clients?.length).toBe(4);
  expect(clients?.every((c) => c.status === "lead" && c.source === "import")).toBe(true);
  const jose = clients?.find(
    (c) => (c.intake as { name?: string }).name === "José García",
  );
  expect((jose?.health_flags as { allergies?: string[] }).allergies).toContain("Peanuts");

  // Draft invites for all imported clients.
  await page.getByTestId("draft-invites").click();
  await expect(page.getByTestId("import-notice")).toContainText("queued");
  const { count: inviteCount } = await service
    .from("invites")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  expect(inviteCount).toBe(4);

  // Undo removes the imported clients.
  await page.getByTestId("undo-import").click();
  await expect(page.getByText("Upload your client export")).toBeVisible();
  const { count: after } = await service
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  expect(after).toBe(0);
});

test("import wizard: warns when the allergies column is unmapped", async ({
  page,
}) => {
  await signInAsTrainer(page);
  await uploadAndMap(page, false);
  await expect(page.getByTestId("allergies-warning")).toBeVisible();
});
