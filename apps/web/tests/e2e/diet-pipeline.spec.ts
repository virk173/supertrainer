import { expect, test } from "@playwright/test";

import {
  generateDietPlan,
  type DietPlanContext,
  type DietPlanDeps,
  type PlanVersion,
  type RecipeAgentInput,
} from "@supertrainer/ai";
import {
  assembleMeals,
  calculateTargets,
  type FoodMacroRow,
  type IntakeInput,
} from "@supertrainer/nutrition-engine";

// Phase 4.2 — orchestrator control flow (CI-safe: mock agents, no model). Proves
// the coded parts the merge gate must guarantee: sanitize (drop ids outside the
// safe pool), validate every version, retry the recipe ONCE on failure, and mark
// needs_attention when no version can be made valid.

const POOL: (FoodMacroRow & { name: string })[] = [
  { id: "chicken", name: "Chicken breast", kcal_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6, fiber_per_100g: 0, allergen_tags: [] },
  { id: "rice", name: "Rice", kcal_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3, fiber_per_100g: 0.4, allergen_tags: [] },
  { id: "oil", name: "Oil", kcal_per_100g: 884, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 100, fiber_per_100g: 0, allergen_tags: [] },
  { id: "peanuts", name: "Peanuts", kcal_per_100g: 567, protein_per_100g: 26, carbs_per_100g: 16, fat_per_100g: 49, fiber_per_100g: 8, allergen_tags: ["peanut"] },
];

const intake: IntakeInput = {
  age: 30, sex: "male", heightCm: 180, weightKg: 80,
  goal: "lose_fat", activity: "moderate", trainingDaysPerWeek: 4,
};
const targets = calculateTargets(intake);

const baseCtx = (): DietPlanContext => ({
  targets,
  constraints: {
    allergens: [], dietPattern: "non_veg", dietaryNotes: null, mealsPerDay: 3,
    mealTimes: [], cooksAtHome: null, cuisineWeights: {}, dislikes: [],
  },
  pool: POOL,
  excludedAllergenTags: [],
});

// A recipe that hits targets via the deterministic filler → always validates.
function goodVersions(input: RecipeAgentInput): PlanVersion[] {
  const build = (label: string): PlanVersion => ({
    label,
    dayTypes: input.targets.map((t) => ({
      name: t.name,
      meals: assembleMeals(POOL, { kcal: t.kcal, protein_g: t.protein_g }, ["breakfast", "lunch", "dinner"]),
    })),
  });
  return [build("A"), build("B")];
}

const mockDeps = (recipe: DietPlanDeps["recipe"]): DietPlanDeps => ({
  structure: async ({ targets: t, constraints }) =>
    t.dayTypes.map((dt) => ({
      dayType: dt.name,
      slots: Array.from({ length: constraints.mealsPerDay }, (_, i) => ({ slot: `meal${i + 1}` })),
    })),
  recipe,
  review: async () => ({ styleMatchScore: 80, practicalityFlags: [], varietyNotes: "varied" }),
});

test("happy path — two valid versions, status draft, critique attached", async () => {
  const res = await generateDietPlan(baseCtx(), mockDeps(async (i) => goodVersions(i)));
  expect(res.status).toBe("draft");
  expect(res.versions).toHaveLength(2);
  for (const v of res.versions) expect(v.validation.ok).toBe(true);
  expect(res.critique?.styleMatchScore).toBe(80);
});

test("sanitize — a food_id outside the pool is stripped before validation", async () => {
  const withGhost = async (i: RecipeAgentInput): Promise<PlanVersion[]> => {
    const vs = goodVersions(i);
    vs[0].dayTypes[0].meals[0].items.push({ food_id: "ghost-not-in-pool", grams: 50 });
    return vs;
  };
  const res = await generateDietPlan(baseCtx(), mockDeps(withGhost));
  const ids = res.versions[0].dayTypes.flatMap((d) => d.meals.flatMap((m) => m.items.map((it) => it.food_id)));
  expect(ids).not.toContain("ghost-not-in-pool");
});

test("retry — a bad first pass is re-invoked once with feedback, then succeeds", async () => {
  let calls = 0;
  const flaky = async (i: RecipeAgentInput): Promise<PlanVersion[]> => {
    calls += 1;
    if (calls === 1) {
      // wildly under target → fails the kcal tolerance
      return [
        { label: "A", dayTypes: i.targets.map((t) => ({ name: t.name, meals: [{ slot: "b", items: [{ food_id: "rice", grams: 50 }] }] })) },
        { label: "B", dayTypes: i.targets.map((t) => ({ name: t.name, meals: [{ slot: "b", items: [{ food_id: "rice", grams: 50 }] }] })) },
      ];
    }
    expect(i.feedback && i.feedback.length).toBeTruthy(); // retry carries validator feedback
    return goodVersions(i);
  };
  const res = await generateDietPlan(baseCtx(), mockDeps(flaky));
  expect(calls).toBe(2);
  expect(res.status).toBe("draft");
});

test("needs_attention — the pool genuinely can't meet the targets (even the fallback fails)", async () => {
  // Only a low-protein vegetable in the pool → no plan can reach the protein
  // target, and even the deterministic fallback can't hit it.
  const ctx: DietPlanContext = {
    ...baseCtx(),
    pool: [
      { id: "broccoli", name: "Broccoli", kcal_per_100g: 34, protein_per_100g: 2.8, carbs_per_100g: 7, fat_per_100g: 0.4, fiber_per_100g: 2.6, allergen_tags: [] },
    ],
  };
  const bad = async (i: RecipeAgentInput): Promise<PlanVersion[]> => {
    const v = (label: string): PlanVersion => ({
      label,
      dayTypes: i.targets.map((t) => ({ name: t.name, meals: [{ slot: "b", items: [{ food_id: "broccoli", grams: 100 }] }] })),
    });
    return [v("A"), v("B")];
  };
  const res = await generateDietPlan(ctx, mockDeps(bad));
  expect(res.status).toBe("needs_attention");
  expect(res.report.length).toBeGreaterThan(0);
});

test("allergen backstop — an excluded-tag food is never in a validated draft", async () => {
  const sneaky = async (i: RecipeAgentInput): Promise<PlanVersion[]> => {
    const vs = goodVersions(i);
    vs[0].dayTypes[0].meals[0].items.push({ food_id: "peanuts", grams: 100 });
    return vs;
  };
  const ctx = { ...baseCtx(), excludedAllergenTags: ["peanut"] };
  const res = await generateDietPlan(ctx, mockDeps(sneaky));
  // version A carried peanuts → it must not validate; the clean version B still can.
  const validated = res.versions.filter((v) => v.validation.ok);
  for (const v of validated) {
    const ids = v.dayTypes.flatMap((d) => d.meals.flatMap((m) => m.items.map((it) => it.food_id)));
    expect(ids).not.toContain("peanuts");
  }
});
