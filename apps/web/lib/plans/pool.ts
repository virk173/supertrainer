// Diet-plan food pool builder (Phase 4.2). The single place the recipe agent's
// candidate pool is constructed: allergen filter FIRST (canonical packages/ai
// net), then diet-pattern filter — the model only ever sees safe foods, exactly
// like the P2.2 preview generator. `excludedTags` are handed to the validator as
// a belt-and-suspenders re-check.

import { excludedAllergenTags, filterSafeFoods, type PoolFood } from "@supertrainer/ai";

import { fitsDiet, type DietPreference } from "@/lib/preview/diet-filter";

// The foods columns the pipeline needs (macros + allergen tags + name).
export interface PoolFoodRow {
  id: string;
  name: string;
  name_normalized: string;
  allergen_tags: string[];
  cuisine_tags: string[];
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number;
}

export const POOL_FOOD_COLUMNS =
  "id, name, name_normalized, allergen_tags, cuisine_tags, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g";

// Allergen filter → diet filter → PoolFood[]. Numbers coerced to Number (the DB
// returns numerics as strings over the wire).
export function buildSafePool(
  foods: PoolFoodRow[],
  allergens: string[],
  diet: DietPreference,
): PoolFood[] {
  const safe = filterSafeFoods(foods, allergens);
  const dietSafe = safe.filter((f) => fitsDiet(f, diet));
  return dietSafe.map((f) => ({
    id: f.id,
    name: f.name,
    allergen_tags: f.allergen_tags,
    cuisine_tags: f.cuisine_tags,
    kcal_per_100g: Number(f.kcal_per_100g),
    protein_per_100g: Number(f.protein_per_100g),
    carbs_per_100g: Number(f.carbs_per_100g),
    fat_per_100g: Number(f.fat_per_100g),
    fiber_per_100g: Number(f.fiber_per_100g),
  }));
}

// Canonical allergen tags to exclude for a client, as a string[] for the
// validator's backstop check.
export function poolExcludedTags(allergens: string[]): string[] {
  return [...excludedAllergenTags(allergens)];
}
