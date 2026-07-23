// Golden intakes (Phase 4.2). Twelve diverse clients the pipeline must handle:
// both sexes, cut/bulk/recomp, sedentary→active, a vegan + nut-allergy case, an
// Indian-cuisine preference, IF and carb-cycle protocols, and the hardest case —
// a 1200-kcal small-female cut. Used by BOTH the CI property test (pool safety +
// deterministic-filler validation) and the live eval (real agents).

import type { IntakeInput, StyleDefaults } from "@supertrainer/nutrition-engine";

export interface GoldenIntake {
  name: string;
  intake: IntakeInput;
  style?: StyleDefaults;
  cuisineBias?: string[];
}

const base = {
  age: 30,
  heightCm: 175,
  weightKg: 75,
  trainingDaysPerWeek: 4,
  mealsPerDay: 3,
} as const;

export const GOLDEN_INTAKES: GoldenIntake[] = [
  {
    name: "male recomp, moderate, non-veg",
    intake: { ...base, sex: "male", goal: "recomp", activity: "moderate", diet: "non_veg" },
  },
  {
    name: "female cut, sedentary, non-veg",
    intake: { ...base, sex: "female", weightKg: 68, goal: "lose_fat", activity: "sedentary", trainingDaysPerWeek: 2, diet: "non_veg" },
  },
  {
    name: "male bulk, active, non-veg",
    intake: { ...base, sex: "male", weightKg: 80, goal: "build_muscle", activity: "active", trainingDaysPerWeek: 5, diet: "non_veg" },
  },
  {
    name: "VEGAN + peanut/tree-nut allergy, female cut, light",
    intake: { ...base, sex: "female", weightKg: 62, goal: "lose_fat", activity: "light", diet: "vegan", allergens: ["peanuts", "tree nuts", "cashew"] },
  },
  {
    name: "Indian-cuisine veg, male recomp, moderate",
    intake: { ...base, sex: "male", goal: "recomp", activity: "moderate", diet: "veg", dietaryPattern: "prefers Indian home food" },
    cuisineBias: ["indian"],
  },
  {
    name: "male cut, IF 16:8, moderate",
    intake: { ...base, sex: "male", weightKg: 82, goal: "lose_fat", activity: "moderate", diet: "non_veg" },
    style: { protocol: { type: "if_16_8", config: { eatingHours: 8, windowStart: "12:00" } } },
  },
  {
    name: "male bulk, carb-cycle, active",
    intake: { ...base, sex: "male", weightKg: 78, goal: "build_muscle", activity: "active", trainingDaysPerWeek: 5, diet: "non_veg" },
    style: { protocol: { type: "carb_cycle", config: { high: 3, med: 1, low: 3 } } },
  },
  {
    name: "1200-kcal small-female cut (hardest)",
    intake: { ...base, sex: "female", heightCm: 155, weightKg: 50, goal: "lose_fat", activity: "sedentary", trainingDaysPerWeek: 0, diet: "non_veg" },
  },
  {
    name: "female bulk, moderate, non-veg",
    intake: { ...base, sex: "female", weightKg: 60, goal: "build_muscle", activity: "moderate", diet: "non_veg" },
  },
  {
    name: "male recomp, veg, high-protein style (2.0 g/kg)",
    intake: { ...base, sex: "male", weightKg: 85, goal: "recomp", activity: "active", diet: "veg" },
    style: { proteinPerKg: 2.0 },
  },
  {
    name: "male cut, dairy+egg allergy, non-veg",
    intake: { ...base, sex: "male", weightKg: 88, goal: "lose_fat", activity: "moderate", diet: "non_veg", allergens: ["dairy", "eggs"] },
  },
  {
    name: "VEGAN male bulk, active",
    intake: { ...base, sex: "male", weightKg: 76, goal: "build_muscle", activity: "active", trainingDaysPerWeek: 5, diet: "vegan" },
  },
];
