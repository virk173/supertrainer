import { z } from "zod";

import { zodOutput } from "./zodOutput";

// PO-5 — auto-generated trainer "client brief" (modelRouter 'draft' → Sonnet).
//
// On Stage B completion the trainer's first exposure to a new human is otherwise
// a pile of JSON intake fields. This agent drafts a short NEUTRAL-voice internal
// note (not the coach's marketing voice, not client-facing) strictly from the
// captured intake — no new questions, no promises, and NO arithmetic (money and
// macros are computed in code elsewhere; the brief just restates what the client
// said). The authoritative health-flag list is derived in code and attached by
// the caller — this schema deliberately does NOT let the model produce or edit
// health flags, so it can neither drop nor invent one.

export const ClientBriefSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(700)
    .describe(
      "2-4 sentence neutral, factual overview for the coach. If health flags are provided in the prompt, mention them plainly and prominently. No promises, no numbers you would have to calculate.",
    ),
  goal: z.string().max(200).describe("The client's primary goal, restated from the intake."),
  schedule: z
    .string()
    .max(200)
    .describe("Training availability / cadence as captured (e.g. '5 days/week, evenings'). '' if not captured."),
  dietaryPattern: z
    .string()
    .max(200)
    .describe("Dietary preference or pattern as captured (e.g. 'vegetarian, 4 meals/day'). '' if not captured."),
  constraints: z
    .array(z.string().max(200))
    .max(8)
    .describe(
      "Notable constraints or preferences the coach should know (equipment access, schedule, lifestyle, injuries mentioned in intake). Empty array if none captured.",
    ),
});

export type ClientBrief = z.infer<typeof ClientBriefSchema>;

export interface ClientBriefInput {
  clientName?: string;
  /** Pre-serialized captured intake (teaser answers + Stage B sections). */
  intakeText: string;
  /** Authoritative, code-derived health flags to surface prominently. */
  healthFlags: string[];
}

const SYSTEM = `You are writing a brief internal note for a personal trainer about a new client who just finished onboarding. This note is for the COACH ONLY — it is not shown to the client and is not marketing copy. Write in a neutral, factual, professional voice.

Hard rules:
- Use ONLY the information provided. Do not invent facts, goals, or preferences the client did not give.
- Do NOT calculate anything (no calorie targets, no macros, no BMI). Only restate what was captured.
- If health flags are provided, surface them plainly and prominently in the summary — never downplay, soften, or omit them, and never add a flag that was not provided.
- Keep it short and scannable. No greetings, no sign-off, no promises about results.`;

// Runs the brief agent and returns a Zod-validated draft. The caller attaches the
// authoritative health-flag list and stores it; a failure here must never block
// intake completion (the caller treats this as best-effort).
export async function generateClientBrief(input: ClientBriefInput): Promise<ClientBrief> {
  const { clientName, intakeText, healthFlags } = input;

  const prompt = `New client${clientName ? `: ${clientName}` : ""}.

Captured intake (the only facts you may use):
${intakeText || "(no intake captured)"}

${
    healthFlags.length
      ? `Health flags to surface prominently (state these plainly in the summary; do not add others):\n${healthFlags.map((f) => `- ${f}`).join("\n")}`
      : "Health flags: none recorded."
  }

Write the coach's brief: a short neutral summary, the primary goal, training schedule, dietary pattern, and any notable constraints.`;

  return zodOutput(ClientBriefSchema, {
    task: "draft",
    system: SYSTEM,
    cacheSystem: true,
    prompt,
    maxTokens: 1000,
  });
}
