import { z } from "zod";

import { zodOutput } from "./zodOutput";

// PO-6 — AI lead-intent scoring on teaser submission (modelRouter 'classify' →
// Haiku). Stage A answers already contain enough to triage follow-up, but a coach
// with 40 launch-push submissions can't tell hot leads from tire-kickers. This is
// a cheap QUALITATIVE triage signal only — a band + a one-line reason. It is NEVER
// an LLM-computed number (CLAUDE.md rule 4): the model does not score, rank, or
// compute a percentage; it picks one of three bands and states why in a sentence.

export const LEAD_INTENT_BANDS = ["high", "medium", "low"] as const;

export const LeadIntentSchema = z.object({
  intentBand: z
    .enum(LEAD_INTENT_BANDS)
    .describe("Qualitative follow-up priority: high, medium, or low. Not a number."),
  // No maxLength on the schema: the model doesn't reliably honor one, and a hard
  // Zod rejection would throw away a perfectly good band (best-effort triage). An
  // omitted reason degrades to "" (default); an over-length reason is accepted
  // here and TRUNCATED by the caller before storage (see start/actions.ts). The
  // prompt still asks for one short sentence, and maxTokens caps the worst case.
  reason: z
    .string()
    .default("")
    .describe("One short, neutral sentence (under 20 words) explaining the band — no numbers you had to calculate."),
});

export type LeadIntent = z.infer<typeof LeadIntentSchema>;

export interface LeadIntentInput {
  goal: string;
  experience: string;
  activity: string;
  trainingDaysPerWeek: number;
  diet: string;
  /** How many allergens the prospect listed (a specificity/engagement signal). */
  allergenCount: number;
}

const SYSTEM = `You are triaging inbound fitness-coaching leads for a personal trainer. From a prospect's short intake, judge how likely they are to follow through and become a paying client, so the coach knows who to contact first.

Hard rules:
- Output a QUALITATIVE band only: high, medium, or low. Never a number, score, or percentage.
- Base the band on engagement signals in the answers (clarity of goal, training commitment, experience, specificity) — not on demographics.
- The reason is ONE short, neutral sentence. Do not calculate anything; you may restate the prospect's own answers.
- When unsure, prefer 'medium'. This is a soft triage hint, not a decision.`;

// Runs the intent classifier and returns a Zod-validated band + reason. The
// caller stores it on the lead best-effort; a failure must never block the
// teaser submission.
export async function scoreLeadIntent(input: LeadIntentInput): Promise<LeadIntent> {
  const prompt = `Prospect's Stage A answers:
- Main goal: ${input.goal}
- Training experience: ${input.experience}
- Day-to-day activity: ${input.activity}
- Willing to train ${input.trainingDaysPerWeek} days/week
- Dietary preference: ${input.diet}
- Listed ${input.allergenCount} specific allergen(s)

Give the follow-up priority band and a one-line reason.`;

  return zodOutput(LeadIntentSchema, {
    task: "classify",
    system: SYSTEM,
    cacheSystem: true,
    prompt,
    maxTokens: 400,
  });
}
