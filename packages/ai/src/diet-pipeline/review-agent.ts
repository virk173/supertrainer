// Review agent (Phase 4.2) — a taste/practicality/style-match critique attached
// to the draft for the trainer. It never edits the plan; it only structures
// notes (the numbers were already checked in code). Sonnet-tier (task: draft).

import { serializeStyleProfile } from "../style/serialize";
import { zodOutput } from "../zodOutput";
import { ReviewCritiqueSchema, type ReviewAgentInput, type ReviewCritique } from "./schemas";

const RULES = `You review a drafted diet plan for a personal trainer before they see it.

Return:
- styleMatchScore (0-100): how well the plan matches the trainer's style profile above (structure, cuisine, food rotation, protocols).
- practicalityFlags: concrete concerns for the trainer (prep time, repetitiveness, awkward portions, shopping burden).
- varietyNotes: one note on food variety/repetition across the plan.

You do NOT change the plan and you do NOT comment on calories/macros — those are already verified in code.`;

export async function reviewAgent(input: ReviewAgentInput): Promise<ReviewCritique> {
  const styleBlock = input.styleProfile
    ? serializeStyleProfile("diet", input.styleProfile as unknown as Record<string, unknown>)
    : "<style_profile domain=\"diet\">(none on file)</style_profile>";
  const system = `${styleBlock}\n\n${RULES}`;

  return zodOutput(ReviewCritiqueSchema, {
    task: "draft",
    system,
    cacheSystem: true,
    prompt: `Plan to review (food ids + grams; macros already validated):\n${JSON.stringify(input.plan)}`,
    maxTokens: 1500,
  });
}
