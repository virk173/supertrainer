import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

async function signInAsTrainer(page: Page) {
  const email = uniqueEmail("brand-trainer");
  const { orgId, tokenHash } = await seedTrainer(email);
  await page.goto(
    `/auth/confirm?token_hash=${tokenHash}&type=email&next=/onboarding/brand`,
  );
  await expect(page.getByTestId("brand-form")).toBeVisible();
  return { orgId };
}

test("brand setup saves, completes the step, and powers /c/{slug}", async ({
  page,
}) => {
  const { orgId } = await signInAsTrainer(page);
  const slug = `peak-${randomUUID().slice(0, 8)}`;

  await page.getByLabel("Display name").fill("Peak Performance");
  await page.getByTestId("slug-input").fill(slug);
  await page.getByLabel("Primary color picker").fill("#4f46e5");
  await page.getByLabel("instagram").fill("@peakcoach");
  await page.getByTestId("save-brand").click();

  await expect(page.getByTestId("brand-saved")).toBeVisible();

  // Persisted to orgs.brand + orgs.slug.
  const service = serviceClient();
  const { data: org } = await service
    .from("orgs")
    .select("slug, brand")
    .eq("id", orgId)
    .single();
  expect(org?.slug).toBe(slug);
  expect((org?.brand as { displayName?: string })?.displayName).toBe(
    "Peak Performance",
  );

  // The branded client-facing page resolves by slug and renders the name.
  await page.goto(`/c/${slug}`);
  await expect(page.getByTestId("branded-name")).toHaveText("Peak Performance");

  // The checklist now shows the brand step done.
  await page.goto("/onboarding");
  await expect(page.getByTestId("step-status-brand")).toHaveText("Done");
});

test("brand setup rejects a handle already taken by another org", async ({
  page,
}) => {
  const takenSlug = `taken-${randomUUID().slice(0, 8)}`;
  const service = serviceClient();
  await service
    .from("orgs")
    .insert({ name: "Existing Org", slug: takenSlug })
    .throwOnError();

  await signInAsTrainer(page);
  await page.getByLabel("Display name").fill("Late Comer");
  await page.getByTestId("slug-input").fill(takenSlug);
  await page.getByTestId("save-brand").click();

  await expect(page.getByText("That handle is already taken.")).toBeVisible();
});

test("brand setup warns on a low-contrast primary color", async ({ page }) => {
  await signInAsTrainer(page);

  // A good color: no warning.
  await page.getByLabel("Primary color picker").fill("#4f46e5");
  await expect(page.getByTestId("contrast-warning")).toHaveCount(0);

  // Mid-gray (~4.3:1 best): neither white nor near-black text clears AA 4.5:1.
  await page.getByLabel("Primary color picker").fill("#7a7a7a");
  await expect(page.getByTestId("contrast-warning")).toBeVisible();
});

test("brand setup rejects a non-image logo before upload", async ({ page }) => {
  await signInAsTrainer(page);

  await page.getByTestId("logo-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });

  await expect(page.getByTestId("logo-error")).toContainText(
    "Use a PNG, JPG, WebP, or GIF image.",
  );
});
