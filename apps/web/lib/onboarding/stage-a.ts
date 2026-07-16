import { z } from "zod";

// Stage A teaser intake — the single source of truth shared by the client form
// and the server action (Phase 2.1, ORIGINAL-SPEC §10). 8–10 questions, < 2 min.
// The form renders one question per screen from STAGE_A_STEPS; the server
// re-validates the whole payload with StageASubmissionSchema (never trust the
// client) and promotes email/phone/allergens to columns, keeping the rest in
// leads.answers.

export const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not", label: "Prefer not to say" },
] as const;

export const GOAL_OPTIONS = [
  { value: "lose_fat", label: "Lose fat" },
  { value: "build_muscle", label: "Build muscle" },
  { value: "recomp", label: "Recomp (both)" },
  { value: "strength", label: "Get stronger" },
  { value: "endurance", label: "Endurance" },
  { value: "general_health", label: "General health" },
] as const;

export const ACTIVITY_OPTIONS = [
  { value: "sedentary", label: "Sedentary (desk job)" },
  { value: "light", label: "Lightly active" },
  { value: "moderate", label: "Moderately active" },
  { value: "active", label: "Active (on my feet)" },
  { value: "very_active", label: "Very active (manual work)" },
] as const;

export const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

export const DIET_OPTIONS = [
  { value: "veg", label: "Vegetarian" },
  { value: "non_veg", label: "Non-vegetarian" },
  { value: "vegan", label: "Vegan" },
] as const;

const values = <T extends readonly { value: string }[]>(opts: T) =>
  opts.map((o) => o.value) as [string, ...string[]];

// Whole-submission schema. `allergens` + `allergiesNone` encode the spec's hard
// rule: a prospect must EITHER list allergens OR explicitly select "none" — an
// empty list is never a silent default (superRefine below enforces it).
export const StageASubmissionSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(80),
    email: z.string().trim().email("Enter a valid email"),
    phone: z
      .string()
      .trim()
      .max(30)
      .optional()
      .transform((v) => (v ? v : undefined)),
    age: z.coerce.number().int().min(13, "Must be 13 or older").max(100),
    sex: z.enum(values(SEX_OPTIONS)),
    heightCm: z.coerce.number().min(90, "Check your height").max(260),
    weightKg: z.coerce.number().min(25, "Check your weight").max(400),
    goal: z.enum(values(GOAL_OPTIONS)),
    activity: z.enum(values(ACTIVITY_OPTIONS)),
    trainingDaysPerWeek: z.coerce.number().int().min(0).max(7),
    experience: z.enum(values(EXPERIENCE_OPTIONS)),
    diet: z.enum(values(DIET_OPTIONS)),
    allergens: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    allergiesNone: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.allergens.length === 0 && !data.allergiesNone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allergens"],
        message: 'List any allergies, or explicitly choose "I have no allergies".',
      });
    }
  });

export type StageASubmission = z.infer<typeof StageASubmissionSchema>;

// Promoted columns (email/phone/allergens) vs. the answers jsonb blob. Keeps the
// server action's insert declarative and the column/jsonb split in one place.
// answers is built explicitly (not via rest) so the promoted columns and the
// UI-only `allergiesNone` flag never leak into leads.answers.
export function splitSubmission(data: StageASubmission): {
  email: string;
  phone: string | null;
  allergens: string[];
  answers: Record<string, unknown>;
} {
  return {
    email: data.email,
    phone: data.phone ?? null,
    allergens: data.allergens,
    answers: {
      name: data.name,
      age: data.age,
      sex: data.sex,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      goal: data.goal,
      activity: data.activity,
      trainingDaysPerWeek: data.trainingDaysPerWeek,
      experience: data.experience,
      diet: data.diet,
    },
  };
}

// Ordered step metadata driving the one-question-per-screen flow. `key` maps to
// a StageASubmission field; `kind` picks the input the form renders.
export type StageAStep =
  | { key: "name"; kind: "text"; label: string; placeholder?: string; inputType?: string }
  | { key: "email"; kind: "text"; label: string; placeholder?: string; inputType?: string }
  | { key: "phone"; kind: "text"; label: string; placeholder?: string; inputType?: string; optional: true }
  | { key: "age"; kind: "number"; label: string; suffix?: string }
  | { key: "heightCm"; kind: "number"; label: string; suffix?: string }
  | { key: "weightKg"; kind: "number"; label: string; suffix?: string }
  | { key: "trainingDaysPerWeek"; kind: "number"; label: string; suffix?: string }
  | {
      key: "sex" | "goal" | "activity" | "experience" | "diet";
      kind: "choice";
      label: string;
      options: readonly { value: string; label: string }[];
    }
  | { key: "allergens"; kind: "allergens"; label: string };

export const STAGE_A_STEPS: StageAStep[] = [
  { key: "name", kind: "text", label: "What's your name?", placeholder: "First name" },
  { key: "email", kind: "text", label: "Your email", placeholder: "you@email.com", inputType: "email" },
  { key: "phone", kind: "text", label: "Phone (optional)", placeholder: "+1 555 000 1234", inputType: "tel", optional: true },
  { key: "age", kind: "number", label: "How old are you?", suffix: "years" },
  { key: "sex", kind: "choice", label: "Sex", options: SEX_OPTIONS },
  { key: "heightCm", kind: "number", label: "Height", suffix: "cm" },
  { key: "weightKg", kind: "number", label: "Weight", suffix: "kg" },
  { key: "goal", kind: "choice", label: "Your main goal", options: GOAL_OPTIONS },
  { key: "activity", kind: "choice", label: "Day-to-day activity", options: ACTIVITY_OPTIONS },
  { key: "trainingDaysPerWeek", kind: "number", label: "Training days per week", suffix: "days" },
  { key: "experience", kind: "choice", label: "Training experience", options: EXPERIENCE_OPTIONS },
  { key: "diet", kind: "choice", label: "Dietary preference", options: DIET_OPTIONS },
  { key: "allergens", kind: "allergens", label: "Any food allergies?" },
];
