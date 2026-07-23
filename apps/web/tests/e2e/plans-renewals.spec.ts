import { expect, test } from "@playwright/test";

import { type DietPlanDeps, type RecipeAgentInput } from "@supertrainer/ai";
import type { Json } from "@supertrainer/db/types";
import { assembleMeals, type FoodMacroRow } from "@supertrainer/nutrition-engine";

import { runDietPipeline } from "@/lib/plans/run";
import { enqueueRenewals } from "@/lib/plans/renewals";
import { serviceClient, uniqueEmail } from "./helpers";

// Phase 4.4 — renewal scheduler + the monthly adjustment pipeline (CI-safe:
// injected filler). A stalled cut at high adherence must draft a reduced-kcal
// plan with a plain-English reason.

const fillerDeps: DietPlanDeps = {
  structure: async ({ targets, constraints }) =>
    targets.dayTypes.map((dt) => ({ dayType: dt.name, slots: Array.from({ length: constraints.mealsPerDay }, (_, i) => ({ slot: `m${i}` })) })),
  recipe: async (i: RecipeAgentInput) => {
    const rows: FoodMacroRow[] = i.candidates.map((c) => ({ id: c.id, kcal_per_100g: c.kcalPer100g, protein_per_100g: c.proteinPer100g, carbs_per_100g: c.carbsPer100g, fat_per_100g: c.fatPer100g, fiber_per_100g: 0, allergen_tags: [] }));
    const build = (label: string) => ({ label, dayTypes: i.targets.map((t) => ({ name: t.name, meals: assembleMeals(rows, { kcal: t.kcal, protein_g: t.protein_g }, ["b", "l", "d"]) })) });
    return [build("A"), build("B")];
  },
  review: async () => ({ styleMatchScore: 80, practicalityFlags: [], varietyNotes: "ok" }),
};

async function seedClient() {
  const service = serviceClient();
  const { data: user } = await service.auth.admin.createUser({ email: uniqueEmail("ren"), email_confirm: true });
  const uid = user!.user!.id;
  const { data: org } = await service.from("orgs").insert({ name: "Ren", slug: `ren-${uid.slice(0, 8)}` }).select("id").single();
  await service.from("profiles").insert({ id: uid, org_id: org!.id, role: "client" });
  const { data: client } = await service
    .from("clients")
    .insert({ org_id: org!.id, profile_id: uid, status: "active", source: "invite", intake: { age: 30, sex: "male", heightCm: 180, weightKg: 90, goal: "lose_fat", activity: "moderate", trainingDaysPerWeek: 4, diet: "non_veg" } as never })
    .select("id")
    .single();
  return { service, orgId: org!.id, clientId: client!.id };
}

test("renewal scheduler queues a monthly request for an aged plan, idempotently", async () => {
  const { service, orgId, clientId } = await seedClient();
  const old = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
  await service.from("plans_active").insert({ client_id: clientId, org_id: orgId, effective_from: old, targets: {} as Json });

  const first = await enqueueRenewals(service, new Date());
  expect(first.queued).toBeGreaterThanOrEqual(1);
  const { count: after1 } = await service.from("plan_requests").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("trigger", "monthly");
  expect(after1).toBe(1);

  // Idempotent — the queued request is still in flight.
  await enqueueRenewals(service, new Date());
  const { count: after2 } = await service.from("plan_requests").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("trigger", "monthly");
  expect(after2).toBe(1);
});

test("monthly pipeline drafts a reduced-kcal adjustment when a cut has stalled at high adherence", async () => {
  const { service, orgId, clientId } = await seedClient();
  // an approved plan at 2200 kcal
  await service.from("plans").insert({
    org_id: orgId, client_id: clientId, status: "approved", source: "onboarding", approved_at: new Date().toISOString(),
    day_types: [{ name: "standard", kcal: 2200, protein_g: 150, carbs_g: 200, fat_g: 60 }] as unknown as Json,
  });
  // flat weigh-ins over two weeks (a stall) + high-adherence ledger days
  for (let d = 0; d < 14; d += 2) {
    const date = new Date(Date.now() - (14 - d) * 86400000).toISOString().slice(0, 10);
    await service.from("weigh_ins").insert({ org_id: orgId, client_id: clientId, tz_date: date, weight_kg: 90 });
    await service.from("ledger_days").insert({
      org_id: orgId, client_id: clientId, tz_date: date,
      expected: { mode: "generic", mealSlots: [], minMeals: 2, weighIn: false, checkin: false, sets: false } as Json,
      misses: { mealSlots: [], meals: 0, weighIn: false, checkin: false, sets: false, total: 0 } as Json,
    });
  }

  const { data: req } = await service.from("plan_requests").insert({ org_id: orgId, client_id: clientId, kind: "diet", trigger: "monthly", status: "queued" }).select("id").single();
  const res = await runDietPipeline(service, req!.id, { deps: fillerDeps });
  expect(res.status).toBe("drafted");

  const { data: plan } = await service.from("plans").select("day_types, content, rationale").eq("id", res.planId!).single();
  const kcal = (plan!.day_types as { kcal: number }[])[0].kcal;
  expect(kcal).toBeLessThan(2200); // adaptive TDEE trimmed intake
  const adjustment = (plan!.content as { adjustment: { changeKind: string; reason: string } | null }).adjustment;
  expect(adjustment?.changeKind).toBe("reduce_kcal");
  expect(plan!.rationale).toBeTruthy();
});
