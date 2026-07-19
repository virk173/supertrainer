import { z } from "zod";

import { modelRouter } from "./modelRouter";
import { zodOutput } from "./zodOutput";

// Composite teaser-preview agent (Phase 2.2, ORIGINAL-SPEC §10). Produces the
// two visible diet lines (breakfast + lunch) and four day-1 exercises in the
// TRAINER's voice. The model only SELECTS foods (by id, from a pool that was
// already allergen- and diet-filtered in code) and prescribes sets/reps — it
// never emits calories or macros; those are computed downstream from the foods
// table (CLAUDE.md rule 4). The caller re-checks every returned foodId against
// the candidate pool (belt and suspenders on the allergen guarantee).

const MealItemSchema = z.object({
  foodId: z.string().describe("An id copied verbatim from the candidate list."),
  grams: z.number().min(1).max(1000),
});

const MealSchema = z.object({
  title: z.string().max(60),
  items: z.array(MealItemSchema).min(1).max(4),
});

const ExerciseSchema = z.object({
  name: z.string().max(60),
  sets: z.number().int().min(1).max(10),
  reps: z.string().max(20).describe('Rep target, e.g. "8-12" or "10".'),
});

export const PreviewDraftSchema = z.object({
  diet: z.object({
    breakfast: MealSchema,
    lunch: MealSchema,
  }),
  training: z.object({
    focus: z.string().max(60).describe("Day-1 focus, e.g. Upper body / Push."),
    exercises: z.array(ExerciseSchema).length(4),
  }),
  coachNote: z
    .string()
    .max(200)
    .describe("One warm line in the coach's voice, no numbers or promises."),
});

export type PreviewDraft = z.infer<typeof PreviewDraftSchema>;

export interface PreviewCandidate {
  id: string;
  name: string;
  kcalPer100g: number;
  proteinPer100g: number;
}

export interface PreviewAgentInput {
  candidates: PreviewCandidate[];
  /** Pre-serialized confirmed style (diet/training/voice) or "" if none yet. */
  styleText: string;
  lead: {
    goal: string;
    diet: string;
    experience: string;
    trainingDaysPerWeek: number;
    sex: string;
    age: number;
  };
}

function candidateLines(candidates: PreviewCandidate[]): string {
  return candidates
    .map(
      (c) =>
        `- ${c.id} | ${c.name} (${c.kcalPer100g} kcal, ${c.proteinPer100g}g protein per 100g)`,
    )
    .join("\n");
}

const SYSTEM = `You are drafting a short, personalized teaser plan a personal trainer will show a prospective client. It must feel like it was written by that specific coach.

Hard rules:
- Choose foods ONLY by copying an id from the candidate list you are given. Never invent a food or an id.
- Do NOT output any calorie or macro numbers anywhere — those are computed separately. Only choose foods, grams, exercises, sets and reps.
- Respect the client's dietary preference and goal. The candidate list has already been filtered for their allergies and diet — every id in it is safe to use.
- Keep it realistic and appealing: a normal breakfast and lunch, and four sensible day-1 exercises for their experience level.
- The coachNote is one warm sentence in the coach's voice. No medical claims, no guarantees, no numbers.`;

// Runs the preview agent (modelRouter 'draft' → Sonnet). Returns a Zod-validated
// draft; the caller validates foodId membership and computes macros in code.
export async function generatePreviewDraft(
  input: PreviewAgentInput,
): Promise<PreviewDraft> {
  const { candidates, styleText, lead } = input;

  const prompt = `The coach's style (mirror this voice and food/exercise choices):
${styleText || "(no style profile yet — use a clean, encouraging, professional coaching voice)"}

Client (Stage A intake):
- Goal: ${lead.goal}
- Dietary preference: ${lead.diet}
- Training experience: ${lead.experience}
- Trains ${lead.trainingDaysPerWeek} days/week
- Sex: ${lead.sex}, Age: ${lead.age}

Candidate foods (choose ids from THIS list only):
${candidateLines(candidates)}

Produce: breakfast (1-3 items) and lunch (1-3 items) as food ids + grams, a day-1 focus with exactly 4 exercises (name, sets, reps), and one coachNote.`;

  return zodOutput(PreviewDraftSchema, {
    task: "draft",
    system: SYSTEM,
    cacheSystem: true,
    prompt,
    maxTokens: 2000,
  });
}

// Model id backing the preview (for tracing/tests).
export const PREVIEW_MODEL = modelRouter("draft");
