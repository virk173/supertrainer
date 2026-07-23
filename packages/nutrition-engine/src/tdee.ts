// TDEE math (Phase 4.1). Mifflin-St Jeor BMR × an activity factor composed from
// the client's job-type activity level and weekly training frequency.

import {
  ACTIVITY_BASE,
  ACTIVITY_FACTOR_MAX,
  ACTIVITY_FACTOR_MIN,
  TRAINING_DAY_FACTOR_STEP,
  type ActivityLevel,
  type IntakeInput,
  type Sex,
} from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

// Mifflin-St Jeor uses a sex-specific constant (male +5, female −161). The
// intake's `other`/`prefer_not` aren't biological sexes, so we average the two
// constants and flag the estimate for the trainer rather than guess.
function sexConstant(sex: Sex): { constant: number; estimated: boolean } {
  if (sex === "male") return { constant: 5, estimated: false };
  if (sex === "female") return { constant: -161, estimated: false };
  return { constant: (5 + -161) / 2, estimated: true }; // −78
}

export function mifflinStJeorBMR(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}): { bmr: number; sexEstimated: boolean } {
  const { constant, estimated } = sexConstant(input.sex);
  const bmr = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + constant;
  return { bmr: Math.round(bmr), sexEstimated: estimated };
}

// Job-type base + training frequency, bounded to [1.2, 1.9]. A trainer override
// replaces the whole computation (still bounded). Rounded to 3dp so float noise
// (1.375 + 0.05) never leaks into a target.
export function activityFactor(
  activity: ActivityLevel,
  trainingDaysPerWeek: number,
  override?: number,
): number {
  if (override != null) return round(clamp(override, ACTIVITY_FACTOR_MIN, ACTIVITY_FACTOR_MAX), 3);
  const days = Math.max(0, Math.min(7, trainingDaysPerWeek));
  const raw = ACTIVITY_BASE[activity] + days * TRAINING_DAY_FACTOR_STEP;
  return round(clamp(raw, ACTIVITY_FACTOR_MIN, ACTIVITY_FACTOR_MAX), 3);
}

export function tdee(
  intake: IntakeInput,
  activityFactorOverride?: number,
): { bmr: number; activityFactor: number; tdee: number; sexEstimated: boolean } {
  const { bmr, sexEstimated } = mifflinStJeorBMR(intake);
  const factor = activityFactor(intake.activity, intake.trainingDaysPerWeek, activityFactorOverride);
  return { bmr, activityFactor: factor, tdee: Math.round(bmr * factor), sexEstimated };
}
