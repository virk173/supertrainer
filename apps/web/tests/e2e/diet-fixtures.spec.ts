import { expect, test } from "@playwright/test";

import {
  generateDietPlan,
  GOLDEN_INTAKES,
  type DietPlanContext,
  type DietPlanDeps,
} from "@supertrainer/ai";
import { assembleMeals, calculateTargets, compileConstraints } from "@supertrainer/nutrition-engine";

import { buildSafePool, poolExcludedTags, POOL_FOOD_COLUMNS, type PoolFoodRow } from "@/lib/plans/pool";
import { serviceClient } from "./helpers";

// Phase 4.2 — the golden-fixture merge gate (CI-safe: deterministic filler, no
// model). For all 12 intakes, over the FULL seeded food taxonomy: the safe pool
// carries zero excluded-allergen foods, and a plan assembled from it validates
// with zero allergen hits and every food_id in the pool. This is the §⑥ DoD —
// "property-test the filter against the full taxonomy, macros within tolerance,
// all in CI." The live LLM agents are exercised by `npm run eval:diet`.

let foodsCache: PoolFoodRow[] | null = null;
async function loadGlobalFoods(): Promise<PoolFoodRow[]> {
  if (foodsCache) return foodsCache;
  const { data, error } = await serviceClient().from("foods").select(POOL_FOOD_COLUMNS).is("org_id", null);
  if (error) throw error;
  foodsCache = (data ?? []) as PoolFoodRow[];
  return foodsCache;
}

// Deterministic stand-in agents: structure = N slots per day type; recipe =
// filler that hits each day-type target from the pool; review = canned.
function fillerDeps(pool: Parameters<typeof generateDietPlan>[0]["pool"]): DietPlanDeps {
  return {
    structure: async ({ targets, constraints }) =>
      targets.dayTypes.map((dt) => ({
        dayType: dt.name,
        slots: Array.from({ length: constraints.mealsPerDay }, (_, i) => ({ slot: `meal${i + 1}` })),
      })),
    recipe: async ({ targets }) => {
      const build = (label: string) => ({
        label,
        dayTypes: targets.map((t) => ({
          name: t.name,
          meals: assembleMeals(pool, { kcal: t.kcal, protein_g: t.protein_g }, ["breakfast", "lunch", "dinner"]),
        })),
      });
      return [build("A"), build("B")];
    },
    review: async () => ({ styleMatchScore: 75, practicalityFlags: [], varietyNotes: "ok" }),
  };
}

for (const fx of GOLDEN_INTAKES) {
  test(`golden: ${fx.name}`, async () => {
    const foods = await loadGlobalFoods();
    const diet = fx.intake.diet ?? "non_veg";
    const allergens = fx.intake.allergens ?? [];
    const pool = buildSafePool(foods, allergens, diet);
    const excluded = poolExcludedTags(allergens);

    // Property: the pool is allergen-safe by construction (full-taxonomy check).
    expect(pool.length).toBeGreaterThan(0);
    for (const f of pool) {
      for (const t of excluded) expect(f.allergen_tags).not.toContain(t);
    }

    const targets = calculateTargets(fx.intake, fx.style);
    expect(targets.status).toBe("ok");

    const ctx: DietPlanContext = {
      targets,
      constraints: compileConstraints(fx.intake, { cuisineBias: fx.cuisineBias }),
      pool,
      excludedAllergenTags: excluded,
    };
    const res = await generateDietPlan(ctx, fillerDeps(pool));

    expect(res.status).toBe("draft");
    const validated = res.versions.filter((v) => v.validation.ok);
    expect(validated.length).toBeGreaterThan(0);
    const poolIds = new Set(pool.map((p) => p.id));
    for (const v of validated) {
      for (const d of v.validation.dayTypes) expect(d.allergenHits).toHaveLength(0);
      for (const dt of v.dayTypes)
        for (const m of dt.meals) for (const it of m.items) expect(poolIds.has(it.food_id)).toBe(true);
    }
  });
}
