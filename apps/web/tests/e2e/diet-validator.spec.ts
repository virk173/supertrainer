import { expect, test } from "@playwright/test";

import {
  assembleMeals,
  fitPortions,
  KCAL_TOLERANCE_PCT,
  macrosForGrams,
  PROTEIN_TOLERANCE_G,
  validatePlanVersion,
  type DayTypeTarget,
  type FoodMacroRow,
  type PlanVersionInput,
  type PlannedMeal,
} from "@supertrainer/nutrition-engine";

// Phase 4.2 — the coded validator + deterministic filler (TDD, before impl).
// The validator recomputes every macro from the food rows (never trusts the
// model's numbers — rule 4), and enforces §④: |target−actual| ≤3% kcal & ≤5g
// protein, every food_id in the safe pool, zero excluded allergen tags. The
// filler is the deterministic recipe used by the CI orchestrator test (and as a
// fallback) — its output must itself pass the validator.

const FOODS: FoodMacroRow[] = [
  { id: "chicken", kcal_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6, fiber_per_100g: 0, allergen_tags: [] },
  { id: "rice", kcal_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3, fiber_per_100g: 0.4, allergen_tags: [] },
  { id: "oil", kcal_per_100g: 884, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 100, fiber_per_100g: 0, allergen_tags: [] },
  { id: "paneer", kcal_per_100g: 265, protein_per_100g: 18, carbs_per_100g: 3, fat_per_100g: 21, fiber_per_100g: 0, allergen_tags: ["dairy"] },
  { id: "peanuts", kcal_per_100g: 567, protein_per_100g: 26, carbs_per_100g: 16, fat_per_100g: 49, fiber_per_100g: 8, allergen_tags: ["peanut"] },
  { id: "broccoli", kcal_per_100g: 34, protein_per_100g: 2.8, carbs_per_100g: 7, fat_per_100g: 0.4, fiber_per_100g: 2.6, allergen_tags: [] },
];
const POOL = new Map(FOODS.map((f) => [f.id, f]));

// ── macrosForGrams ────────────────────────────────────────────────────────────
test("macrosForGrams scales per-100g by weight", () => {
  const m = macrosForGrams(POOL.get("chicken")!, 200);
  expect(m.kcal).toBe(330); // 165 * 2
  expect(m.protein).toBe(62); // 31 * 2
});

// ── validatePlanVersion ───────────────────────────────────────────────────────
const standardTarget: DayTypeTarget = { name: "standard", kcal: 2030, protein_g: 107, carbs_g: 140, fat_g: 112 };

// chicken 300g (kcal 495, p 93) + rice 500g (kcal 650, p 13.5) + oil 100g (kcal 884, p 0)
// → kcal 2029, protein 106.5 → 107
const onTargetVersion: PlanVersionInput = {
  label: "A",
  dayTypes: [
    {
      name: "standard",
      meals: [
        { slot: "breakfast", items: [{ food_id: "chicken", grams: 300 }] },
        { slot: "lunch", items: [{ food_id: "rice", grams: 500 }] },
        { slot: "dinner", items: [{ food_id: "oil", grams: 100 }] },
      ],
    },
  ],
};

test("a plan within tolerance validates ok with recomputed actuals", () => {
  const r = validatePlanVersion(onTargetVersion, [standardTarget], POOL, []);
  expect(r.ok).toBe(true);
  expect(r.dayTypes[0].actual.kcal).toBe(2029);
  expect(r.dayTypes[0].actual.protein_g).toBe(107);
  expect(r.dayTypes[0].kcalDeltaPct).toBeLessThanOrEqual(KCAL_TOLERANCE_PCT);
  expect(r.dayTypes[0].proteinDeltaG).toBeLessThanOrEqual(PROTEIN_TOLERANCE_G);
});

test("protein out of tolerance fails and the feedback names the day + protein gap", () => {
  const r = validatePlanVersion(onTargetVersion, [{ ...standardTarget, protein_g: 150 }], POOL, []);
  expect(r.ok).toBe(false);
  expect(r.dayTypes[0].proteinDeltaG).toBeGreaterThan(PROTEIN_TOLERANCE_G);
  expect(r.feedback.toLowerCase()).toContain("protein");
  expect(r.feedback).toContain("standard");
});

test("kcal out of tolerance fails", () => {
  const r = validatePlanVersion(onTargetVersion, [{ ...standardTarget, kcal: 2600 }], POOL, []);
  expect(r.ok).toBe(false);
  expect(r.dayTypes[0].kcalDeltaPct).toBeGreaterThan(KCAL_TOLERANCE_PCT);
});

test("a food_id outside the pool is flagged and fails", () => {
  const v: PlanVersionInput = {
    label: "A",
    dayTypes: [{ name: "standard", meals: [{ slot: "b", items: [{ food_id: "ghost", grams: 100 }] }] }],
  };
  const r = validatePlanVersion(v, [standardTarget], POOL, []);
  expect(r.ok).toBe(false);
  expect(r.dayTypes[0].unknownFoodIds).toContain("ghost");
});

test("a planned food carrying an excluded allergen tag is caught (belt-and-suspenders)", () => {
  const v: PlanVersionInput = {
    label: "A",
    dayTypes: [{ name: "standard", meals: [{ slot: "b", items: [{ food_id: "peanuts", grams: 300 }] }] }],
  };
  const r = validatePlanVersion(v, [standardTarget], POOL, ["peanut"]);
  expect(r.ok).toBe(false);
  expect(r.dayTypes[0].allergenHits.map((h) => h.food_id)).toContain("peanuts");
});

test("carb-cycle: each day type is validated against its own target", () => {
  const v: PlanVersionInput = {
    label: "A",
    dayTypes: [
      { name: "high", meals: [{ slot: "b", items: [{ food_id: "chicken", grams: 300 }, { food_id: "rice", grams: 800 }, { food_id: "oil", grams: 100 }] }] },
      { name: "low", meals: [{ slot: "b", items: [{ food_id: "chicken", grams: 300 }, { food_id: "rice", grams: 300 }] }] },
    ],
  };
  const targets: DayTypeTarget[] = [
    { name: "high", kcal: 2419, protein_g: 115, carbs_g: 224, fat_g: 112 }, // 495+1040+884, p 93+21.6
    { name: "low", kcal: 885, protein_g: 101, carbs_g: 84, fat_g: 12 }, // 495+390, p 93+8.1
  ];
  const r = validatePlanVersion(v, targets, POOL, []);
  expect(r.dayTypes).toHaveLength(2);
  expect(r.dayTypes.map((d) => d.dayType)).toEqual(["high", "low"]);
});

// ── assembleMeals (deterministic filler) ──────────────────────────────────────
test("assembleMeals hits the target within tolerance and uses only pool foods", () => {
  const target = { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 };
  const meals = assembleMeals(FOODS, target, ["breakfast", "lunch", "dinner"]);
  const version: PlanVersionInput = { label: "gen", dayTypes: [{ name: "standard", meals }] };
  const r = validatePlanVersion(version, [{ name: "standard", ...target }], POOL, []);
  expect(r.ok).toBe(true);
  // every item is a real pool food
  for (const meal of meals) for (const it of meal.items) expect(POOL.has(it.food_id)).toBe(true);
});

test("assembleMeals hits a hard low-kcal high-protein target (1200 kcal, 90g protein)", () => {
  const target = { kcal: 1200, protein_g: 90, carbs_g: 120, fat_g: 33 };
  const meals = assembleMeals(FOODS, target, ["breakfast", "lunch"]);
  const version: PlanVersionInput = { label: "gen", dayTypes: [{ name: "standard", meals }] };
  const r = validatePlanVersion(version, [{ name: "standard", ...target }], POOL, []);
  expect(r.ok).toBe(true);
});

test("assembleMeals is deterministic — same inputs, same output", () => {
  const target = { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 };
  const a = assembleMeals(FOODS, target, ["breakfast", "lunch", "dinner"]);
  const b = assembleMeals(FOODS, target, ["breakfast", "lunch", "dinner"]);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

// ── fitPortions (code nails the grams on the model's food choices) ────────────
test("fitPortions adjusts grams so the model's foods hit the target", () => {
  // A model-style plan with plausible-but-wrong grams across two meals.
  const meals: PlannedMeal[] = [
    { slot: "breakfast", items: [{ food_id: "chicken", grams: 100 }, { food_id: "rice", grams: 100 }] },
    { slot: "lunch", items: [{ food_id: "oil", grams: 50 }, { food_id: "broccoli", grams: 200 }] },
  ];
  const target = { kcal: 2000, protein_g: 150 };
  const fitted = fitPortions(meals, target, POOL);
  const version: PlanVersionInput = { label: "x", dayTypes: [{ name: "standard", meals: fitted }] };
  const r = validatePlanVersion(version, [{ name: "standard", kcal: 2000, protein_g: 150, carbs_g: 0, fat_g: 0 }], POOL, []);
  expect(r.ok).toBe(true);
  // it keeps the model's food choices (same set of ids), only resizes
  const ids = fitted.flatMap((m) => m.items.map((i) => i.food_id)).sort();
  expect(ids).toEqual(["broccoli", "chicken", "oil", "rice"]);
});

test("fitPortions can't conjure protein from a single low-protein food (validator rejects)", () => {
  const meals: PlannedMeal[] = [{ slot: "b", items: [{ food_id: "rice", grams: 100 }] }];
  const fitted = fitPortions(meals, { kcal: 2000, protein_g: 150 }, POOL);
  for (const m of fitted) {
    for (const it of m.items) {
      expect(it.grams).toBeGreaterThanOrEqual(1);
      expect(it.grams).toBeLessThanOrEqual(1000);
    }
  }
  const version: PlanVersionInput = { label: "x", dayTypes: [{ name: "standard", meals: fitted }] };
  const r = validatePlanVersion(version, [{ name: "standard", kcal: 2000, protein_g: 150, carbs_g: 0, fat_g: 0 }], POOL, []);
  expect(r.ok).toBe(false); // protein can't be met from rice alone
});
