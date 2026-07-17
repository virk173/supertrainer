import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { serviceClient } from "./helpers";

// DoD: the client funnel is verified on a phone viewport (mobile-first).
test.use({ viewport: { width: 390, height: 844 } });

async function seedOrgWithTier(): Promise<{ orgId: string; slug: string; tierId: string }> {
  const service = serviceClient();
  const slug = `preview-${randomUUID().slice(0, 8)}`;
  const { data: org, error: oErr } = await service
    .from("orgs")
    .insert({ name: "Preview Coach", slug, brand: { primaryColor: "#0ea5e9" } })
    .select("id")
    .single();
  if (oErr || !org) throw oErr ?? new Error("org seed failed");

  const { data: tier, error: tErr } = await service
    .from("tiers")
    .insert({
      org_id: org.id,
      name: "Gold",
      price_cents: 14900,
      position: 0,
      is_active: true,
      features: { checkin_frequency: "weekly", video_calls_per_month: 2, response_priority: true, custom_lines: [] },
    })
    .select("id")
    .single();
  if (tErr || !tier) throw tErr ?? new Error("tier seed failed");

  return { orgId: org.id, slug, tierId: tier.id };
}

// A pre-computed preview in the stored shape, so the page renders it WITHOUT
// calling the model (CI-safe). Macros are illustrative.
function samplePreview() {
  const m = (kcal: number) => ({ kcal, protein: 20, carbs: 40, fat: 8, fiber: 5 });
  return {
    diet: {
      breakfast: {
        title: "Breakfast",
        items: [{ foodId: "seed-oats", name: "Rolled oats, dry", grams: 80, macros: m(311) }],
        macros: m(311),
      },
      lunch: {
        title: "Lunch",
        items: [{ foodId: "seed-chicken", name: "Chicken breast, cooked", grams: 150, macros: m(248) }],
        macros: m(248),
      },
    },
    training: {
      focus: "Upper body",
      exercises: [
        { name: "Bench press", sets: 4, reps: "8-10" },
        { name: "Row", sets: 4, reps: "10-12" },
        { name: "Overhead press", sets: 3, reps: "8-10" },
        { name: "Lat pulldown", sets: 3, reps: "12" },
      ],
    },
    coachNote: "Great starting point — we build from here together.",
    generatedAt: new Date().toISOString(),
  };
}

async function seedLead(
  orgId: string,
  opts: { allergens?: string[]; diet?: string; withPreview?: boolean; email?: string } = {},
): Promise<{ leadId: string; email: string }> {
  const service = serviceClient();
  const email = opts.email ?? `lead-${randomUUID().slice(0, 8)}@test.local`;
  const { data, error } = await service
    .from("leads")
    .insert({
      org_id: orgId,
      email,
      allergens: opts.allergens ?? [],
      answers: {
        name: "Prospect",
        age: 30,
        sex: "male",
        goal: "build_muscle",
        experience: "intermediate",
        trainingDaysPerWeek: 4,
        diet: opts.diet ?? "non_veg",
      },
      status: "started",
      preview: opts.withPreview ? samplePreview() : null,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("lead seed failed");
  return { leadId: data.id, email };
}

test("preview renders the visible plan + blurred remainder + tiers (cached, no model)", async ({
  page,
}) => {
  const { orgId, slug, tierId } = await seedOrgWithTier();
  const { leadId } = await seedLead(orgId, { withPreview: true });

  await page.goto(`/c/${slug}/preview/${leadId}`);

  await expect(page.getByTestId("preview-card")).toBeVisible();
  await expect(page.getByTestId("preview-meal-breakfast")).toContainText("Rolled oats");
  await expect(page.getByTestId("preview-meal-lunch")).toContainText("Chicken breast");
  await expect(page.getByTestId("preview-exercise").first()).toContainText("Bench press");
  await expect(page.getByTestId("preview-blur")).toBeVisible();
  await expect(page.getByTestId("preview-disclaimer")).toContainText("review and finalize");
  await expect(page.getByTestId(`unlock-${tierId}`)).toBeVisible();

  // Cache: the stored preview is untouched on revisit (no regeneration).
  const service = serviceClient();
  const before = await service.from("leads").select("preview_generated_at").eq("id", leadId).single();
  await page.reload();
  await expect(page.getByTestId("preview-card")).toBeVisible();
  const after = await service.from("leads").select("preview_generated_at").eq("id", leadId).single();
  expect(after.data?.preview_generated_at).toBe(before.data?.preview_generated_at);
});

async function pollForClient(orgId: string): Promise<Record<string, unknown> | null> {
  const service = serviceClient();
  for (let i = 0; i < 20; i++) {
    const { data } = await service
      .from("clients")
      .select("id, status, source, intake, profile_id, health_flags")
      .eq("org_id", orgId)
      .maybeSingle();
    if (data) return data as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

test("conversion: choosing a tier creates the correct client + links the lead", async ({
  page,
}) => {
  const { orgId, slug, tierId } = await seedOrgWithTier();
  const { leadId, email } = await seedLead(orgId, { withPreview: true, allergens: ["peanuts"] });

  await page.goto(`/c/${slug}/preview/${leadId}`);
  await expect(page.getByTestId(`unlock-${tierId}`)).toBeVisible();
  await page.getByTestId(`unlock-${tierId}`).click();

  const client = await pollForClient(orgId);
  expect(client, "conversion should create a client row").not.toBeNull();
  expect(client?.status).toBe("onboarding");
  expect(client?.source).toBe("teaser");
  expect(client?.profile_id).toBeTruthy();
  expect((client?.intake as { email?: string })?.email).toBe(email);
  expect((client?.intake as { selected_tier_id?: string })?.selected_tier_id).toBe(tierId);
  // convert writes health_flags.allergies (matching the Phase 1 import/demo key).
  expect((client?.health_flags as { allergies?: string[] })?.allergies).toEqual(["peanuts"]);

  const service = serviceClient();
  const { data: lead } = await service
    .from("leads")
    .select("status, converted_client_id")
    .eq("id", leadId)
    .single();
  expect(lead?.status).toBe("converted");
  expect(lead?.converted_client_id).toBe(client?.id);
});

// LIVE: real generation must never surface an allergen the lead declared.
test("live: generated preview never contains a declared allergen (veg + dairy/peanut-free)", async ({
  page,
}) => {
  test.skip(!process.env.ANTHROPIC_API_KEY, "needs ANTHROPIC_API_KEY for live generation");
  test.setTimeout(150_000);

  const { orgId, slug } = await seedOrgWithTier();
  const { leadId } = await seedLead(orgId, {
    allergens: ["dairy", "peanuts"],
    diet: "veg",
  });

  await page.goto(`/c/${slug}/preview/${leadId}`);
  await expect(page.getByTestId("preview-card")).toBeVisible({ timeout: 120_000 });

  // Inspect the cached preview against the foods DB: every chosen food must be
  // free of dairy/peanut tags and not an animal food (veg).
  const service = serviceClient();
  const { data: lead } = await service.from("leads").select("preview").eq("id", leadId).single();
  const preview = lead?.preview as {
    diet: { breakfast: { items: { foodId: string; name: string }[] }; lunch: { items: { foodId: string; name: string }[] } };
  };
  const ids = [
    ...preview.diet.breakfast.items.map((i) => i.foodId),
    ...preview.diet.lunch.items.map((i) => i.foodId),
  ];
  expect(ids.length).toBeGreaterThan(0);

  const { data: foods } = await service
    .from("foods")
    .select("id, name_normalized, allergen_tags")
    .in("id", ids);

  // Dairy/peanut are covered by the allergen-tag assertions above. This net only
  // guards the veg preference — animal foods (word-boundaried so plant "soy milk"
  // and "eggplant" don't false-positive).
  const animal = /\bchicken|\bmutton|\bbeef|\blamb|\bfish|\bprawn|\bshrimp|\bcrab|\begg\b|\bsalmon|\btuna|\bturkey|\bduck|\brohu|\btilapia/;
  for (const food of foods ?? []) {
    expect(food.allergen_tags).not.toContain("dairy");
    expect(food.allergen_tags).not.toContain("peanut");
    expect(food.name_normalized, `unsafe food surfaced: ${food.name_normalized}`).not.toMatch(animal);
  }
});
