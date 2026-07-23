// Split validator (Phase 5.2) — the coded gate, mirroring nutrition-engine's
// validatePlanVersion. Recomputes weekly set volume from the planned days and
// asserts the spec §5.2 rules: weekly sets per muscle within bounds (landmark or
// style override), push/pull balance within 0.75–1.33, every exercise id in the
// injury-safe pool (belt-and-suspenders re-check — a hallucinated or excluded id
// can never survive), and structural sanity. Emits structured feedback the
// orchestrator feeds back on the bounded retry.

import {
  MAJOR_MUSCLES,
  PUSH_PULL_MAX,
  PUSH_PULL_MIN,
  VOLUME_LANDMARKS,
  type ExerciseMeta,
  type MuscleGroup,
  type Schedule,
  type SplitDay,
  type StyleVolumeBounds,
} from "./types";
import {
  consecutiveMuscleOverlap,
  pushPullBalance,
  weeklySetVolume,
} from "./volume";

// Resolve the [min,max] weekly-set window for a muscle: an explicit style
// per-muscle override wins; otherwise the landmark [MEV, MRV] scaled by the
// style volume multiplier.
export function muscleBounds(
  muscle: MuscleGroup,
  style?: StyleVolumeBounds,
): [number, number] {
  const override = style?.perMuscle?.[muscle];
  if (override) return override;
  const [mev, , mrv] = VOLUME_LANDMARKS[muscle];
  const mult = style?.volumeMultiplier ?? 1;
  return [Math.round(mev * mult), Math.round(mrv * mult)];
}

export interface SplitValidationIssue {
  kind: "pool" | "volume_over" | "volume_under" | "balance" | "structure";
  detail: string;
}

export interface SplitValidationResult {
  ok: boolean;
  issues: SplitValidationIssue[]; // hard failures
  warnings: string[]; // soft notes surfaced to the trainer, never block
  weeklyVolume: Record<string, number>;
  balance: { push: number; pull: number; ratio: number };
  feedback: string; // multi-line, fed back to the selection agent on retry
}

const MAJOR = new Set<MuscleGroup>(MAJOR_MUSCLES);

export function validateSplit(
  days: SplitDay[],
  schedule: Schedule,
  index: Map<string, ExerciseMeta>,
  poolIds: Set<string>,
  style?: StyleVolumeBounds,
): SplitValidationResult {
  const issues: SplitValidationIssue[] = [];
  const warnings: string[] = [];

  // Structural + pool safety.
  for (const day of days) {
    if (day.exercises.length === 0) {
      issues.push({ kind: "structure", detail: `day "${day.label}" has no exercises` });
    }
    for (const ex of day.exercises) {
      if (!poolIds.has(ex.exercise_id)) {
        issues.push({
          kind: "pool",
          detail: `day "${day.label}": exercise ${ex.exercise_id} is not in the client's safe pool`,
        });
      }
      if (!(ex.sets > 0)) {
        issues.push({ kind: "structure", detail: `day "${day.label}": ${ex.exercise_id} has non-positive sets` });
      }
    }
  }

  const weekly = weeklySetVolume(days, schedule, index);
  const trained = new Set<MuscleGroup>(weekly.keys());

  for (const [muscle, sets] of weekly) {
    const [min, max] = muscleBounds(muscle, style);
    const rounded = Math.round(sets * 10) / 10;
    if (sets > max) {
      issues.push({
        kind: "volume_over",
        detail: `${muscle}: ${rounded} weekly sets exceeds the max ${max} (overreaching)`,
      });
    } else if (sets > 0 && sets < min) {
      if (MAJOR.has(muscle)) {
        issues.push({
          kind: "volume_under",
          detail: `${muscle}: ${rounded} weekly sets is below the minimum effective ${min}`,
        });
      } else {
        warnings.push(`${muscle} is a touch light (${rounded} sets, min ${min}) — fine if intentional`);
      }
    }
  }

  // Coverage note: a major muscle nobody trains (warning, not a block — a
  // minimalist or specialization split may omit it deliberately).
  for (const m of MAJOR_MUSCLES) {
    if (!trained.has(m)) warnings.push(`${m} is not trained anywhere in this split`);
  }

  // Push/pull balance.
  const balance = pushPullBalance(days, schedule, index);
  if (balance.ratio < PUSH_PULL_MIN || balance.ratio > PUSH_PULL_MAX) {
    issues.push({
      kind: "balance",
      detail: `push:pull weekly sets ${balance.push}:${balance.pull} (ratio ${
        Number.isFinite(balance.ratio) ? balance.ratio.toFixed(2) : "∞"
      }) is outside the healthy ${PUSH_PULL_MIN}–${PUSH_PULL_MAX} band`,
    });
  }

  // Recovery flag (warning only).
  for (const o of consecutiveMuscleOverlap(days, schedule, index)) {
    warnings.push(`${o.muscle} is trained heavy on back-to-back days (${o.labels[0]} → ${o.labels[1]})`);
  }

  const weeklyVolume: Record<string, number> = {};
  for (const [m, s] of weekly) weeklyVolume[m] = Math.round(s * 10) / 10;

  const feedback = issues.map((i) => `- [${i.kind}] ${i.detail}`).join("\n");
  return {
    ok: issues.length === 0,
    issues,
    warnings,
    weeklyVolume,
    balance,
    feedback,
  };
}

// Build the exercise-metadata index the validator/volume math need from a pool
// of catalog rows (id + muscles + patterns).
export function buildExerciseIndex(pool: ExerciseMeta[]): Map<string, ExerciseMeta> {
  return new Map(pool.map((e) => [e.id, e]));
}
