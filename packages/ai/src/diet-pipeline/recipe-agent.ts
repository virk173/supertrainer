// Recipe agent (Phase 4.2) — fills the skeletons from the ALLERGEN + DIET
// filtered food pool ONLY, choosing food_id + grams (the model never computes a
// calorie — CLAUDE.md rule 4). Produces two distinct versions (choice raises
// adherence). On a validation failure the orchestrator re-invokes with the exact
// gaps in `feedback`.

import { zodOutput } from "../zodOutput";
import { RecipeOutputSchema, type PlanVersion, type RecipeAgentInput } from "./schemas";

const RULES = `You fill meal skeletons for a personal trainer's diet plan by choosing foods and gram weights.

Hard rules:
- SELECT ONLY foods from the provided food pool, referenced by their exact food_id. NEVER invent a food_id or use a food not in the pool.
- You choose food_id + grams ONLY. All calories and macros are computed in code from the food database — do not output any calorie or macro numbers.
- Produce EXACTLY TWO distinct versions: same day-type targets and structure, but different food rotations so the client has a choice.
- Hit each day type's kcal and protein target as closely as possible (they are checked in code to within 3% kcal and 5g protein).
- Give each meal a short, practical prep note that fits the client's cooking time.`;

export async function recipeAgent(input: RecipeAgentInput): Promise<PlanVersion[]> {
  const poolLines = input.candidates
    .map((c) => `${c.id} | ${c.name} | per100g: ${c.kcalPer100g}kcal ${c.proteinPer100g}p ${c.carbsPer100g}c ${c.fatPer100g}f`)
    .join("\n");
  const targetLines = input.targets
    .map((t) => `${t.name}: ${t.kcal} kcal, ${t.protein_g}g protein, ${t.carbs_g}g carbs, ${t.fat_g}g fat`)
    .join("\n");

  const prompt = [
    `Day-type targets:\n${targetLines}`,
    `Meal skeletons (slots/timing/cuisine per day type):\n${JSON.stringify(input.skeletons)}`,
    input.constraints.dislikes.length ? `Avoid (dislikes): ${input.constraints.dislikes.join(", ")}` : "",
    `Food pool — choose ONLY from these (food_id | name | per-100g):\n${poolLines}`,
    input.feedback
      ? `Your previous attempt FAILED code validation. Fix exactly these and resubmit both versions:\n${input.feedback}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await zodOutput(RecipeOutputSchema, {
    task: "plan",
    system: RULES,
    cacheSystem: true,
    prompt,
    maxTokens: 8000,
  });
  return out.versions;
}
