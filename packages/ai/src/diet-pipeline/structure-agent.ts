// Structure agent (Phase 4.2) — designs the meal SKELETON per day type (slots,
// timing, cuisine intent) in the trainer's own structure. The trainer's diet
// style profile is the dominant instruction and is prompt-cached (stable prefix);
// the per-request targets/constraints live in the prompt. No foods or numbers
// here — that's the recipe agent + coded math.

import { serializeStyleProfile } from "../style/serialize";
import { zodOutput } from "../zodOutput";
import { StructureOutputSchema, type DaySkeleton, type StructureAgentInput } from "./schemas";

const RULES = `You design the SKELETON of each day type for a personal trainer's diet plan: the meal slots, their timing, and a short cuisine/dish intent per slot.

Hard rules:
- The trainer's meal structure in the style profile above is the DOMINANT instruction — mirror its meal count, timing habits, and structure.
- Emit exactly one skeleton per requested day type.
- Use the given meals-per-day and meal times; honor the client's dietary pattern and cuisine preferences.
- If an eating window is given (intermittent fasting), place every slot inside it.
- You do NOT choose foods or gram amounts here — only slots, timing, and a brief cuisine intent.`;

export async function structureAgent(input: StructureAgentInput): Promise<DaySkeleton[]> {
  const styleBlock = input.styleProfile
    ? serializeStyleProfile("diet", input.styleProfile as unknown as Record<string, unknown>)
    : "<style_profile domain=\"diet\">(none on file — use a sensible default structure)</style_profile>";
  const system = `${styleBlock}\n\n${RULES}`;

  const c = input.constraints;
  const prompt = [
    `Day types: ${input.targets.dayTypes.map((d) => d.name).join(", ")}`,
    `Meals per day: ${c.mealsPerDay}`,
    c.mealTimes.length ? `Meal times: ${c.mealTimes.join(", ")}` : "",
    `Dietary pattern: ${c.dietPattern ?? "unspecified"}`,
    Object.keys(c.cuisineWeights).length ? `Cuisines: ${Object.keys(c.cuisineWeights).join(", ")}` : "",
    input.targets.fastWindow
      ? `Eating window: ${input.targets.fastWindow.start}–${input.targets.fastWindow.end}`
      : "",
    c.dietaryNotes ? `Notes: ${c.dietaryNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const out = await zodOutput(StructureOutputSchema, {
    task: "plan",
    system,
    cacheSystem: true,
    prompt,
    maxTokens: 3000,
  });
  return out.dayTypes;
}
