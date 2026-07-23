// Adaptive monthly adjustment (Phase 4.4). Pure, coded reasoning — the LLM never
// decides the numbers (rule 4). The client's ACTUAL weight trend beats the
// formula (adaptive TDEE); adherence gates whether we touch targets at all; each
// rule emits a plain-English reason the trainer sees before approving.

import { DEFAULT_PROTEIN_PER_KG, KCAL_PER_KG_BODY_MASS, type Goal } from "./types";

export interface AdjustmentContext {
  goal: Goal;
  currentKcal: number;
  currentProtein: number;
  weightKg: number;
  /** Weekly adherence score 0-100 (P3.5). */
  adherencePct: number;
  /** Actual weekly weight change, kg, signed (negative = loss) — weigh-in slope. */
  weeklyWeightChangeKg: number;
  /** The plan's intended weekly rate, % of body-weight (magnitude). */
  expectedRatePctPerWeek: number;
  avgLoggedKcal: number | null;
  avgSteps: number | null;
}

export type AdjustmentKind = "reduce_kcal" | "raise_kcal" | "add_steps" | "simplify" | "hold";

export interface AdjustmentProposal {
  changeKind: AdjustmentKind;
  newKcal: number;
  newProtein: number;
  stepTarget?: number;
  reason: string;
  /** Alternative proposals the trainer can pick instead (e.g. steps vs kcal). */
  options?: AdjustmentProposal[];
}

const LOW_ADHERENCE = 60;
const MAX_ADJUST_PCT = 0.1; // never move kcal more than 10% in a cycle
const MIN_ADJUST_PCT = 0.05;
// Outside this band around the expected rate, adjust; inside it, hold.
const SLOW_RATIO = 0.5;
const FAST_RATIO = 1.5;

export function proposeAdjustment(ctx: AdjustmentContext): AdjustmentProposal {
  const newProtein = Math.max(ctx.currentProtein, Math.round(DEFAULT_PROTEIN_PER_KG * ctx.weightKg));
  const hold = (reason: string): AdjustmentProposal => ({
    changeKind: "hold",
    newKcal: ctx.currentKcal,
    newProtein,
    reason,
  });

  const clampDelta = (rawKcal: number) =>
    Math.round(Math.min(MAX_ADJUST_PCT * ctx.currentKcal, Math.max(MIN_ADJUST_PCT * ctx.currentKcal, Math.abs(rawKcal))));

  const dir = ctx.goal === "lose_fat" ? "cut" : ctx.goal === "build_muscle" ? "bulk" : "maintain";
  const actual = ctx.weeklyWeightChangeKg;

  // Low adherence: the plan isn't the problem — never cut harder, simplify.
  if (dir !== "maintain" && ctx.adherencePct < LOW_ADHERENCE) {
    return {
      changeKind: "simplify",
      newKcal: ctx.currentKcal,
      newProtein,
      reason: `Adherence is ${Math.round(ctx.adherencePct)}% — consistency is the bottleneck, not the target. Simplifying the plan (fewer meals, more repeats) instead of cutting harder.`,
    };
  }

  if (dir === "maintain") {
    if (Math.abs(actual) <= 0.003 * ctx.weightKg) return hold("Weight is holding steady — no change needed.");
    const delta = clampDelta((actual * KCAL_PER_KG_BODY_MASS) / 7);
    return actual > 0
      ? { changeKind: "reduce_kcal", newKcal: ctx.currentKcal - delta, newProtein, reason: `Weight drifting up on a maintenance goal — trimming ~${delta} kcal to hold the line.` }
      : { changeKind: "raise_kcal", newKcal: ctx.currentKcal + delta, newProtein, reason: `Weight drifting down on a maintenance goal — adding ~${delta} kcal to hold the line.` };
  }

  const expectedSigned =
    dir === "cut"
      ? -(ctx.expectedRatePctPerWeek / 100) * ctx.weightKg
      : (ctx.expectedRatePctPerWeek / 100) * ctx.weightKg;
  const ratio = expectedSigned !== 0 ? actual / expectedSigned : 1;

  // On track.
  if (ratio >= SLOW_RATIO && ratio <= FAST_RATIO) {
    return hold(`On track — ${dir === "cut" ? "losing" : "gaining"} about as planned. Holding targets.`);
  }

  const excessKcalPerDay = (Math.abs(actual - expectedSigned) * KCAL_PER_KG_BODY_MASS) / 7;
  const delta = clampDelta(excessKcalPerDay || MIN_ADJUST_PCT * ctx.currentKcal);

  if (dir === "cut") {
    if (ratio < SLOW_RATIO) {
      // Stalled / too slow at good adherence → TDEE below the estimate.
      const stepTarget = (ctx.avgSteps ?? 6000) + 2000;
      return {
        changeKind: "reduce_kcal",
        newKcal: ctx.currentKcal - delta,
        newProtein,
        reason: `Weight has stalled (losing slower than target) at ${Math.round(ctx.adherencePct)}% adherence — your TDEE is lower than the formula estimated. Trimming intake ~${delta} kcal to restart progress.`,
        options: [
          {
            changeKind: "add_steps",
            newKcal: ctx.currentKcal,
            newProtein,
            stepTarget,
            reason: `Or keep intake and raise the daily step target to ~${stepTarget} to widen the deficit through activity instead.`,
          },
        ],
      };
    }
    // Losing too fast → protect muscle + adherence.
    return {
      changeKind: "raise_kcal",
      newKcal: ctx.currentKcal + delta,
      newProtein,
      reason: `Losing faster than target — raising intake ~${delta} kcal to protect lean mass and keep the plan sustainable.`,
    };
  }

  // bulk
  if (ratio > FAST_RATIO) {
    return {
      changeKind: "reduce_kcal",
      newKcal: ctx.currentKcal - delta,
      newProtein,
      reason: `Gaining faster than target (more fat than muscle) — trimming intake ~${delta} kcal to lean the rate of gain.`,
    };
  }
  return {
    changeKind: "raise_kcal",
    newKcal: ctx.currentKcal + delta,
    newProtein,
    reason: `Gaining slower than target — adding ~${delta} kcal to support growth.`,
  };
}
