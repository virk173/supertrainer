// Split review agent (Phase 5.2) — the fresh-eyes pass that critiques the drafted
// split for the trainer (style match, practicality, balance). Two of these loops
// run (spec §④); combined with the coded validator that is a tighter guarantee
// than the spec's 3-4 loops. It only critiques — it never edits numbers.

import { serializeStyleProfile } from "../style/serialize";
import { zodOutput } from "../zodOutput";
import {
  SplitReviewCritiqueSchema,
  type SplitReviewCritique,
  type SplitReviewInput,
} from "./schemas";

const RULES = `You are a senior coach reviewing a drafted training split for the trainer whose style is above. Give a concise, honest critique.

Rules:
- Score 0-100 how well the split matches this trainer's programming style.
- List concrete practicality concerns (session length vs available time, equipment churn, exercise order).
- One note on movement-pattern and volume balance across the week.
- Do NOT rewrite the split or output any numbers to change — the trainer edits it.`;

export async function splitReviewAgent(input: SplitReviewInput): Promise<SplitReviewCritique> {
  const styleBlock = input.styleProfile
    ? serializeStyleProfile("training", input.styleProfile as unknown as Record<string, unknown>)
    : '<style_profile domain="training">(none on file)</style_profile>';
  const system = `${styleBlock}\n\n${RULES}`;

  const prompt = [
    `Archetype: ${input.archetype}`,
    `Split:\n${JSON.stringify(input.days)}`,
  ].join("\n\n");

  return zodOutput(SplitReviewCritiqueSchema, {
    task: "draft",
    system,
    cacheSystem: true,
    prompt,
    maxTokens: 1500,
  });
}
