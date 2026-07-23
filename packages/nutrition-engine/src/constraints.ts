// Constraint compiler (Phase 4.1) — the non-allergen-filter half of the
// pipeline's step 0. Reshapes intake (+ optional trainer style) into the hard
// constraints the structure/recipe agents obey. The allergen-safe food POOL is
// built in P4.2 by feeding `allergens` to the canonical packages/ai
// filterSafeFoods; this module stays zero-AI-import and never touches the DB.

import type { Constraints, IntakeInput, StyleConstraintInput } from "./types";

const DEFAULT_MEALS_PER_DAY = 3;

export function compileConstraints(intake: IntakeInput, style: StyleConstraintInput = {}): Constraints {
  // Prefer the explicit answer; else infer from meal times; else a sane default.
  const mealsPerDay =
    intake.mealsPerDay ??
    (intake.mealTimes && intake.mealTimes.length > 0 ? intake.mealTimes.length : DEFAULT_MEALS_PER_DAY);

  // Cuisine bias is equal-weighted for now (P4.2 may refine); insertion order
  // preserved so the dominant cuisine the trainer listed first stays first.
  const cuisineWeights: Record<string, number> = {};
  for (const cuisine of style.cuisineBias ?? []) cuisineWeights[cuisine] = 1;

  return {
    allergens: intake.allergens ?? [],
    dietPattern: intake.diet ?? null,
    dietaryNotes: intake.dietaryPattern ?? null,
    mealsPerDay,
    mealTimes: intake.mealTimes ?? [],
    cooksAtHome: intake.cooksAtHome ?? null,
    cuisineWeights,
    dislikes: style.bannedFoods ?? [],
  };
}
