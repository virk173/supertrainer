// Macro math for the teaser preview (Phase 2.2). ALL calorie/macro numbers are
// computed here, in code, from the foods table's per-100g values — the model
// only ever picks a food id and a gram weight (CLAUDE.md rule 4).

export interface FoodMacros {
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number;
}

export interface ComputedMacros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

function scale(per100g: number, grams: number): number {
  return (Number(per100g) * grams) / 100;
}

// Macros for a single food at a gram weight, rounded for display.
export function macrosFor(food: FoodMacros, grams: number): ComputedMacros {
  return {
    kcal: Math.round(scale(food.kcal_per_100g, grams)),
    protein: Math.round(scale(food.protein_per_100g, grams)),
    carbs: Math.round(scale(food.carbs_per_100g, grams)),
    fat: Math.round(scale(food.fat_per_100g, grams)),
    fiber: Math.round(scale(food.fiber_per_100g, grams)),
  };
}

// Sum of per-item macros (rounded once, at the end, from unrounded parts).
export function sumMacros(
  items: { food: FoodMacros; grams: number }[],
): ComputedMacros {
  const total = items.reduce(
    (acc, { food, grams }) => ({
      kcal: acc.kcal + scale(food.kcal_per_100g, grams),
      protein: acc.protein + scale(food.protein_per_100g, grams),
      carbs: acc.carbs + scale(food.carbs_per_100g, grams),
      fat: acc.fat + scale(food.fat_per_100g, grams),
      fiber: acc.fiber + scale(food.fiber_per_100g, grams),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
  return {
    kcal: Math.round(total.kcal),
    protein: Math.round(total.protein),
    carbs: Math.round(total.carbs),
    fat: Math.round(total.fat),
    fiber: Math.round(total.fiber),
  };
}
