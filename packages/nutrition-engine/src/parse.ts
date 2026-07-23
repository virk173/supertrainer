// parseIntake (Phase 4.1). Maps the raw, untyped clients.intake Json (+ the
// clients.health_flags allergies list) into a typed IntakeInput, or reports why
// it can't. The pipeline (P4.2) calls this before the math; absurd or missing
// biometrics surface as a structured problem for the trainer, never a throw.

import { IntakeInputSchema, type IntakeInput } from "./types";

export type ParseIntakeResult =
  | { ok: true; intake: IntakeInput }
  | { ok: false; issues: string[] };

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

export function parseIntake(rawIntake: unknown, rawHealthFlags?: unknown): ParseIntakeResult {
  const intake = asRecord(rawIntake);
  const nutrition = asRecord(asRecord(intake.stage_b).nutrition);
  const healthFlags = asRecord(rawHealthFlags);

  const candidate = {
    age: intake.age,
    sex: intake.sex,
    heightCm: intake.heightCm,
    weightKg: intake.weightKg,
    goal: intake.goal,
    activity: intake.activity,
    trainingDaysPerWeek: intake.trainingDaysPerWeek,
    diet: intake.diet,
    mealsPerDay: nutrition.mealsPerDay,
    mealTimes: nutrition.mealTimes,
    dietaryPattern: nutrition.dietaryPattern,
    cooksAtHome: nutrition.cooksAtHome,
    allergens: Array.isArray(healthFlags.allergies) ? healthFlags.allergies : undefined,
  };

  const parsed = IntakeInputSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  return { ok: true, intake: parsed.data };
}
