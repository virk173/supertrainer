import { z } from "zod";

// Style-profile schemas (master plan §4.2). These are BOTH the structured-
// output contract for the extraction agents AND the confirmation-UI source of
// truth. Field .describe() text doubles as extraction guidance. Enums keep
// outputs constrained so the eval scorer is deterministic; free-text arrays
// capture the long tail. "unknown" is always available so the model reports
// low confidence instead of hallucinating.

export const StyleDomain = z.enum(["diet", "training", "voice"]);
export type StyleDomain = z.infer<typeof StyleDomain>;

// ── Diet ─────────────────────────────────────────────────────────────────────

export const DietProfileSchema = z.object({
  mealsPerDay: z
    .number()
    .int()
    .min(1)
    .max(12)
    .describe("Typical number of eating occasions per day (meals + snacks)."),
  mealStructure: z
    .string()
    .describe(
      'Plain-English meal skeleton, e.g. "3 meals + 2 snacks" or "16:8 window, 2 large meals".',
    ),
  carbTiming: z
    .enum(["post_workout", "backloaded", "morning", "even", "none", "unknown"])
    .describe("When carbohydrates are concentrated across the day."),
  portionStyle: z
    .enum([
      "weighed_grams",
      "hand_portions",
      "flexible_macros",
      "unstructured",
      "unknown",
    ])
    .describe("How portions are prescribed."),
  protocols: z
    .array(
      z.enum([
        "intermittent_fasting",
        "carb_cycling",
        "keto",
        "refeed_days",
        "omad",
        "none",
      ]),
    )
    .describe("Dietary protocols in use. Empty or [none] if plain."),
  cuisineBias: z
    .array(z.string())
    .describe('Cuisines the food choices lean toward, e.g. ["indian"].'),
  foodRotationPool: z
    .array(z.string())
    .describe(
      "The recurring staple foods the plan rotates through (lowercase singular nouns).",
    ),
  lovedFoods: z.array(z.string()).describe("Foods clearly favored/encouraged."),
  bannedFoods: z
    .array(z.string())
    .describe("Foods explicitly disallowed or avoided."),
  supplementPlacement: z
    .array(z.string())
    .describe('Supplements and when taken, e.g. ["whey post-workout"].'),
});
export type DietProfile = z.infer<typeof DietProfileSchema>;

// ── Training ─────────────────────────────────────────────────────────────────

export const TrainingProfileSchema = z.object({
  daysPerWeek: z
    .number()
    .int()
    .min(1)
    .max(7)
    .describe("Training days per week."),
  splitArchetypes: z
    .array(z.string())
    .describe(
      'Split style(s), lowercase, e.g. ["upper/lower"], ["ppl"], ["full body"].',
    ),
  exercisePool: z
    .array(z.string())
    .describe(
      "Exercises that recur, most-frequent first (lowercase, e.g. \"barbell bench press\").",
    ),
  progressionStyle: z
    .enum(["load", "volume", "rotation", "mixed", "unknown"])
    .describe(
      "How progression is driven: adding load, adding volume, rotating exercises, or a mix.",
    ),
  volumeRepHabits: z
    .string()
    .describe(
      'Typical set/rep habits in plain English, e.g. "3-4 sets of 8-12 reps".',
    ),
  warmupPatterns: z
    .string()
    .describe('Warmup approach, or "unknown" if not evident.'),
});
export type TrainingProfile = z.infer<typeof TrainingProfileSchema>;

// ── Voice ────────────────────────────────────────────────────────────────────

export const VoiceProfileSchema = z.object({
  toneMarkers: z
    .array(z.string())
    .describe(
      'Adjectives for the coaching tone, e.g. ["warm", "direct", "hype"].',
    ),
  greeting: z
    .string()
    .describe('A typical opener, verbatim, e.g. "Yo! How\'d the week go?".'),
  signoff: z.string().describe("A typical closing, verbatim."),
  emojiRate: z
    .enum(["none", "low", "medium", "high"])
    .describe("How heavily emoji are used."),
  languageMix: z
    .string()
    .describe('Primary language / blend, e.g. "english" or "hinglish".'),
  avgMessageLength: z
    .enum(["short", "medium", "long"])
    .describe("Typical message length."),
  phraseBank: z
    .array(z.string())
    .min(0)
    .max(30)
    .describe(
      "10-30 verbatim signature phrases the trainer reuses (exact wording).",
    ),
});
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;

// Discriminated map so callers can pick the right schema by domain.
export const PROFILE_SCHEMAS = {
  diet: DietProfileSchema,
  training: TrainingProfileSchema,
  voice: VoiceProfileSchema,
} as const;

export type StyleProfileByDomain = {
  diet: DietProfile;
  training: TrainingProfile;
  voice: VoiceProfile;
};
