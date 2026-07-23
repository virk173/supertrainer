import { expect, test } from "@playwright/test";

import { type DietPlanDeps, type RecipeAgentInput } from "@supertrainer/ai";
import { assembleMeals, type FoodMacroRow } from "@supertrainer/nutrition-engine";

import { runDietPipeline } from "@/lib/plans/run";
import { serviceClient, uniqueEmail } from "./helpers";

// Phase 4.2 — runDietPipeline DB path (CI-safe: injected deterministic filler).
// Proves the request→draft write path end-to-end: reads the queued plan_request,
// builds the pool from the DB, writes a draft plans row, and advances the
// request. Tenancy is enforced in code (service role bypasses RLS).

const fullIntake = {
  age: 30, sex: "male", heightCm: 180, weightKg: 80,
  goal: "lose_fat", activity: "moderate", trainingDaysPerWeek: 4, diet: "non_veg",
  stage_b: { nutrition: { mealsPerDay: 3, mealTimes: ["08:00", "13:00", "20:00"] } },
};

// Filler deps: reconstruct macro rows from the injected candidates so the
// deterministic assembler can hit each target.
const fillerDeps: DietPlanDeps = {
  structure: async ({ targets, constraints }) =>
    targets.dayTypes.map((dt) => ({
      dayType: dt.name,
      slots: Array.from({ length: constraints.mealsPerDay }, (_, i) => ({ slot: `meal${i + 1}` })),
    })),
  recipe: async (input: RecipeAgentInput) => {
    const rows: FoodMacroRow[] = input.candidates.map((c) => ({
      id: c.id, kcal_per_100g: c.kcalPer100g, protein_per_100g: c.proteinPer100g,
      carbs_per_100g: c.carbsPer100g, fat_per_100g: c.fatPer100g, fiber_per_100g: 0, allergen_tags: [],
    }));
    const build = (label: string) => ({
      label,
      dayTypes: input.targets.map((t) => ({
        name: t.name,
        meals: assembleMeals(rows, { kcal: t.kcal, protein_g: t.protein_g }, ["breakfast", "lunch", "dinner"]),
      })),
    });
    return [build("A"), build("B")];
  },
  review: async () => ({ styleMatchScore: 80, practicalityFlags: [], varietyNotes: "ok" }),
};

async function seedClientWithIntake(intake: unknown): Promise<{ orgId: string; clientId: string }> {
  const service = serviceClient();
  const { data: user } = await service.auth.admin.createUser({ email: uniqueEmail("diet"), email_confirm: true });
  const userId = user!.user!.id;
  const { data: org } = await service
    .from("orgs")
    .insert({ name: "Diet Org", slug: `diet-${userId.slice(0, 8)}` })
    .select("id")
    .single();
  await service.from("profiles").insert({ id: userId, org_id: org!.id, role: "client" });
  const { data: client } = await service
    .from("clients")
    .insert({ org_id: org!.id, profile_id: userId, status: "active", source: "invite", intake: intake as never })
    .select("id")
    .single();
  return { orgId: org!.id, clientId: client!.id };
}

test("runDietPipeline drafts a plan and advances the request", async () => {
  const service = serviceClient();
  const { orgId, clientId } = await seedClientWithIntake(fullIntake);
  const { data: reqRow } = await service
    .from("plan_requests")
    .insert({ org_id: orgId, client_id: clientId, kind: "diet", trigger: "onboarding", status: "queued" })
    .select("id")
    .single();

  const result = await runDietPipeline(service, reqRow!.id, { deps: fillerDeps });
  expect(result.status).toBe("drafted");
  expect(result.planId).toBeTruthy();

  const { data: plan } = await service
    .from("plans")
    .select("status, version, source, content")
    .eq("id", result.planId!)
    .single();
  expect(plan!.status).toBe("draft");
  expect(plan!.version).toBe(1);
  expect(plan!.source).toBe("onboarding");
  const content = plan!.content as { versions: unknown[]; needsAttention: boolean };
  expect(content.versions).toHaveLength(2);
  expect(content.needsAttention).toBe(false);

  const { data: after } = await service.from("plan_requests").select("status").eq("id", reqRow!.id).single();
  expect(after!.status).toBe("drafted");
});

test("runDietPipeline marks the request failed when intake is incomplete", async () => {
  const service = serviceClient();
  const { orgId, clientId } = await seedClientWithIntake({ email: "only@example.com" }); // no biometrics
  const { data: reqRow } = await service
    .from("plan_requests")
    .insert({ org_id: orgId, client_id: clientId, kind: "diet", trigger: "onboarding", status: "queued" })
    .select("id")
    .single();

  const result = await runDietPipeline(service, reqRow!.id, { deps: fillerDeps });
  expect(result.status).toBe("failed");

  const { data: after } = await service.from("plan_requests").select("status").eq("id", reqRow!.id).single();
  expect(after!.status).toBe("failed");
});
