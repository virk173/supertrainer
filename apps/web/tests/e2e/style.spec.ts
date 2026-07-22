import { expect, test, type Page } from "@playwright/test";

import { seedTrainer, serviceClient, uniqueEmail } from "./helpers";

async function signInAsTrainer(page: Page, next = "/onboarding/style") {
  const email = uniqueEmail("style-trainer");
  const { orgId, tokenHash } = await seedTrainer(email);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=${next}`);
  return { orgId };
}

// CI-safe: seeds draft profiles directly (no Claude) and drives the
// confirmation UX + checklist-step completion.
test("style confirmation: edit drafts, confirm all, complete the step", async ({
  page,
}) => {
  const { orgId } = await signInAsTrainer(page);
  const service = serviceClient();
  await service
    .from("style_profiles")
    .insert([
      {
        org_id: orgId,
        domain: "diet",
        version: 1,
        status: "draft",
        confidence: 1,
        profile: { mealsPerDay: 4, foodRotationPool: ["rice", "chicken"] },
      },
      {
        org_id: orgId,
        domain: "training",
        version: 1,
        status: "draft",
        confidence: 1,
        profile: { daysPerWeek: 4, splitArchetypes: ["upper/lower"] },
      },
      {
        org_id: orgId,
        domain: "voice",
        version: 1,
        status: "draft",
        confidence: 1,
        profile: { emojiRate: "high", greeting: "Yo!" },
      },
    ])
    .throwOnError();

  await page.reload();
  await expect(page.getByTestId("style-confirm")).toBeVisible();

  // PO-2: every draft card shows a code-computed strength meter.
  await expect(page.getByTestId("style-meter")).toHaveCount(3);

  // Confirming the first two shows their badges; confirming the LAST flips the
  // whole view to the completion card, so assert that instead of a badge.
  await page.getByTestId("confirm-diet").click();
  await expect(page.getByTestId("confirmed-diet")).toBeVisible();
  await page.getByTestId("confirm-training").click();
  await expect(page.getByTestId("confirmed-training")).toBeVisible();
  await page.getByTestId("confirm-voice").click();

  await expect(page.getByTestId("style-confirmed")).toBeVisible();

  // PO-2: the summary keeps the meters + a persistent "add more examples"
  // affordance to re-run extraction.
  await expect(page.getByTestId("style-meter")).toHaveCount(3);
  await expect(page.getByTestId("sharpen-affordance")).toBeVisible();

  // Profiles are confirmed in the DB and the checklist step is done.
  const { data: rows } = await service
    .from("style_profiles")
    .select("status")
    .eq("org_id", orgId);
  expect(rows?.every((r) => r.status === "confirmed")).toBe(true);

  await page.goto("/onboarding");
  await expect(page.getByTestId("step-status-style")).toHaveText("Done");
});

// PO-2: loading the page already-confirmed shows the per-domain strength meters
// (from the confirmed profiles) and the add-more affordance re-opens the upload
// flow. A thin profile reads "Thin" with a weak-spot hint.
test("style meter: confirmed load surfaces strength and re-opens the upload flow", async ({
  page,
}) => {
  const { orgId } = await signInAsTrainer(page);
  const at = new Date().toISOString();
  await serviceClient()
    .from("style_profiles")
    .insert([
      {
        org_id: orgId,
        domain: "diet",
        version: 1,
        status: "confirmed",
        confirmed_at: at,
        confidence: 0.1,
        // Mostly unknown/empty → thin.
        profile: {
          mealsPerDay: 3,
          mealStructure: "unknown",
          carbTiming: "unknown",
          portionStyle: "unknown",
          protocols: [],
          cuisineBias: [],
          foodRotationPool: [],
          lovedFoods: [],
          bannedFoods: [],
          supplementPlacement: [],
        },
      },
      {
        org_id: orgId,
        domain: "training",
        version: 1,
        status: "confirmed",
        confirmed_at: at,
        confidence: 1,
        profile: {
          daysPerWeek: 4,
          splitArchetypes: ["ppl"],
          exercisePool: ["squat", "bench", "deadlift"],
          progressionStyle: "load",
          volumeRepHabits: "3x8-12",
          warmupPatterns: "ramp sets",
        },
      },
      {
        org_id: orgId,
        domain: "voice",
        version: 1,
        status: "confirmed",
        confirmed_at: at,
        confidence: 0.85,
        profile: {
          toneMarkers: ["warm"],
          greeting: "Yo!",
          signoff: "Keep going",
          emojiRate: "high",
          languageMix: "english",
          avgMessageLength: "short",
          phraseBank: ["let's get it"],
        },
      },
    ])
    .throwOnError();

  await page.reload();
  await expect(page.getByTestId("style-confirmed")).toBeVisible();
  await expect(page.getByTestId("style-meter")).toHaveCount(3);

  // The mostly-empty diet profile reads thin and names weak spots to fill.
  const dietCard = page.getByTestId("style-summary-diet");
  await expect(dietCard.getByTestId("style-meter-band")).toHaveText("Thin");
  await expect(dietCard.getByTestId("style-meter-weak")).toBeVisible();
  // The richly-extracted training profile reads strong.
  await expect(
    page.getByTestId("style-summary-training").getByTestId("style-meter-band"),
  ).toHaveText("Strong");

  // The affordance re-opens the upload flow to re-run extraction.
  await page.getByTestId("add-more-examples").click();
  await expect(page.getByTestId("style-upload")).toBeVisible();
});

// Live end-to-end through the real extraction agents. Runs only when a Claude
// key is present (loaded from .env.local by playwright.config); skipped in CI.
test("style ingestion: upload → real extraction → draft profiles", async ({
  page,
}) => {
  test.skip(
    !process.env.ANTHROPIC_API_KEY,
    "needs ANTHROPIC_API_KEY for live extraction",
  );
  test.setTimeout(150_000);

  await signInAsTrainer(page);
  await expect(page.getByTestId("style-upload")).toBeVisible();

  const plan = `DIET PLAN — 5 meals a day, all weighed in grams.
Meal 1: eggs + oats. Meal 3: chicken, rice, dal. Loves paneer. No sugar, no fried food.
Carbs around training. Supplements: whey post-workout, creatine daily.

TRAINING: 4-day upper/lower split. Bench, squat, deadlift, rows. Add weight at the top of the rep range.

CHECK-IN VOICE: "Yo! 🔥 Amazing work this week 💪 keep that momentum! You've got this."`;

  await page.getByTestId("style-file-input").setInputFiles({
    name: "coaching.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(plan),
  });
  await expect(page.getByTestId("style-file-list")).toContainText("coaching.txt");

  await page.getByTestId("analyze-style").click();

  // Real Opus extraction for all three domains — allow generous time.
  await expect(page.getByTestId("style-confirm")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("style-domain-diet")).toBeVisible();
  await expect(page.getByTestId("style-domain-training")).toBeVisible();
  await expect(page.getByTestId("style-domain-voice")).toBeVisible();

  await page.getByTestId("confirm-diet").click();
  await expect(page.getByTestId("confirmed-diet")).toBeVisible();
});
