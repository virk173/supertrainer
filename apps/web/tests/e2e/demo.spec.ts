import { expect, test, type Page } from "@playwright/test";

import { excludeDemoClients } from "@supertrainer/db/queries";

import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

async function signInAsTrainer(page: Page) {
  const email = uniqueEmail("demo-trainer");
  const { orgId, tokenHash } = await seedTrainer(email);
  await page.goto(
    `/auth/confirm?token_hash=${tokenHash}&type=email&next=/onboarding/demo`,
  );
  return { orgId };
}

test("demo client: create is idempotent, badged, completes the step", async ({
  page,
}) => {
  const { orgId } = await signInAsTrainer(page);
  const service = serviceClient();

  await page.getByTestId("create-demo").click();
  await expect(page.getByTestId("demo-client")).toBeVisible();
  await expect(page.getByTestId("demo-badge")).toHaveText("DEMO");

  // Exactly one demo client, active/invite, badged.
  const demoQuery = () =>
    service
      .from("clients")
      .select("id, status, source, is_demo, intake")
      .eq("org_id", orgId)
      .eq("is_demo", true);
  let { data: demos } = await demoQuery();
  expect(demos?.length).toBe(1);
  expect(demos?.[0]?.status).toBe("active");
  expect((demos?.[0]?.intake as { name?: string }).name).toBe("Alex Demo");

  // Reset re-runs the seeder — still exactly one demo client (idempotent).
  await page.getByTestId("reset-demo").click();
  await expect(page.getByTestId("demo-client")).toBeVisible();
  ({ data: demos } = await demoQuery());
  expect(demos?.length).toBe(1);

  // Teaser share renders the branded link.
  await expect(page.getByTestId("teaser-url")).toContainText("/c/");

  // Step complete, and the funnel event fired via completeStep.
  const { data: events } = await service
    .from("events")
    .select("payload")
    .eq("org_id", orgId)
    .eq("type", "onboarding_step_completed");
  expect(
    events?.some((e) => (e.payload as { step?: string }).step === "demo"),
  ).toBe(true);

  await page.goto("/onboarding");
  await expect(page.getByTestId("step-status-demo")).toHaveText("Done");
});

test("demo client: excluded from client aggregates", async ({ page }) => {
  const { orgId } = await signInAsTrainer(page);
  const service = serviceClient();

  // Seed one real lead + the demo client.
  await service
    .from("clients")
    .insert([
      { org_id: orgId, status: "lead", source: "import", is_demo: false },
      { org_id: orgId, status: "active", source: "invite", is_demo: true },
    ])
    .throwOnError();

  const all = await service
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  const real = await excludeDemoClients(
    service.from("clients").select("id", { count: "exact", head: true }),
  ).eq("org_id", orgId);

  expect(all.count).toBe(2);
  expect(real.count).toBe(1);
});
