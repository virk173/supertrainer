// Split-pipeline orchestrator (Phase 5.2). Sequences structure → selection →
// (coded validate + bounded retry) → deterministic fallback → review, with typed
// handoffs. The AGENTS are injectable (SplitPlanDeps) so the merge-gating CI test
// drives the real control flow with deterministic stand-ins, and production
// passes the live LLM agents. Every set/volume/balance number is checked in code
// (validateSplit) — the model never does arithmetic (CLAUDE.md rule 4), and every
// selected exercise is re-checked against the injury-safe pool (validate-after).

import {
  assembleSplitDay,
  buildDefaultSkeleton,
  buildExerciseIndex,
  buildWeeklySchedule,
  isMuscleGroup,
  validateSplit,
  type ExperienceLevel,
  type MuscleGroup,
  type PlannedExercise,
  type Schedule,
  type SplitDay,
  type SplitValidationResult,
  type StyleVolumeBounds,
} from "@supertrainer/training-engine";

import type { TrainingProfile } from "../style/schemas";
import type {
  ExerciseCandidate,
  SplitDraft,
  SplitReviewCritique,
  SplitSkeleton,
  SplitSelectionAgent,
  SplitStructureAgent,
  SplitReviewAgent,
} from "./schemas";

export interface SplitPlanContext {
  availability: { daysPerWeek: number };
  experience: ExperienceLevel;
  goal?: string;
  styleProfile?: TrainingProfile;
  /** The injury-safe candidate pool (built by the caller's pool compiler). */
  pool: ExerciseCandidate[];
  /** Trainer volume-bound overrides (from the style profile), optional. */
  styleBounds?: StyleVolumeBounds;
}

export interface SplitPlanDeps {
  structure: SplitStructureAgent;
  selection: SplitSelectionAgent;
  review: SplitReviewAgent;
}

export interface SplitPlanResult {
  status: "draft" | "needs_attention";
  archetype: string;
  days: SplitDay[];
  schedule: Schedule;
  validation: SplitValidationResult;
  critique: SplitReviewCritique | null;
  report: string;
  retried: boolean;
  /** True if a deterministic fallback replaced the LLM selection for the draft. */
  autofilled: boolean;
}

const MAX_SETS = 10;

// Validate-after: keep only exercises whose id is in the safe pool, dedupe within
// a day, clamp sets/rir. A hallucinated or injury-excluded id can never survive.
function sanitizeDraft(draft: SplitDraft, poolIds: Set<string>): SplitDay[] {
  return draft.days.map((day) => {
    const exercises: PlannedExercise[] = [];
    const seen = new Set<string>();
    for (const ex of day.exercises) {
      if (!poolIds.has(ex.exercise_id) || seen.has(ex.exercise_id)) continue;
      seen.add(ex.exercise_id);
      exercises.push({
        exercise_id: ex.exercise_id,
        sets: Math.max(1, Math.min(MAX_SETS, Math.round(ex.sets))),
        reps: typeof ex.reps === "string" && ex.reps.trim() ? ex.reps.trim() : "8-12",
        rir: Math.max(0, Math.min(5, Math.round(ex.rir))),
        ...(ex.tips ? { tips: ex.tips } : {}),
      });
    }
    return { label: day.label, exercises, ...(day.warmup ? { warmup: day.warmup } : {}) };
  });
}

// Deterministic assembly of a whole split from a skeleton's per-day muscle
// targets (the coded fallback). Always in-pool and, for a balanced skeleton,
// in-bounds.
function assembleFromSkeleton(skeleton: SplitSkeleton, pool: ExerciseCandidate[]): SplitDay[] {
  return skeleton.days.map((d) =>
    assembleSplitDay(
      d.label,
      pool,
      d.muscleTargets
        .filter((t) => isMuscleGroup(t.muscle))
        .map((t) => ({ muscle: t.muscle as MuscleGroup, sets: t.sets })),
    ),
  );
}

// Review a valid split (two fresh-eyes loops → one merged critique) + package.
async function finalize(
  deps: SplitPlanDeps,
  ctx: SplitPlanContext,
  parts: {
    archetype: string;
    days: SplitDay[];
    schedule: Schedule;
    validation: SplitValidationResult;
    retried: boolean;
    autofilled: boolean;
  },
): Promise<SplitPlanResult> {
  const { archetype, days, schedule, validation, retried, autofilled } = parts;
  const status: SplitPlanResult["status"] = validation.ok ? "draft" : "needs_attention";

  let critique: SplitReviewCritique | null = null;
  if (validation.ok) {
    // Two review loops merged: most-critical style score, unioned practicality
    // flags, concatenated balance notes (spec §④'s "2 fresh-eyes loops").
    const [r1, r2] = await Promise.all([
      deps.review({ days, archetype, styleProfile: ctx.styleProfile }),
      deps.review({ days, archetype, styleProfile: ctx.styleProfile }),
    ]);
    critique = {
      styleMatchScore: Math.min(r1.styleMatchScore, r2.styleMatchScore),
      practicalityFlags: [...new Set([...r1.practicalityFlags, ...r2.practicalityFlags])],
      balanceNotes: [r1.balanceNotes, r2.balanceNotes].filter(Boolean).join(" "),
    };
  }

  const report = validation.ok
    ? validation.warnings.join("\n")
    : validation.feedback || validation.warnings.join("\n");

  return { status, archetype, days, schedule, validation, critique, report, retried, autofilled };
}

export async function generateSplit(
  ctx: SplitPlanContext,
  deps: SplitPlanDeps,
): Promise<SplitPlanResult> {
  const poolIds = new Set(ctx.pool.map((e) => e.id));
  const index = buildExerciseIndex(ctx.pool);
  const validate = (days: SplitDay[], schedule: Schedule): SplitValidationResult =>
    validateSplit(days, schedule, index, poolIds, ctx.styleBounds);

  const skeleton = await deps.structure({
    availability: ctx.availability,
    experience: ctx.experience,
    goal: ctx.goal,
    styleProfile: ctx.styleProfile,
  });
  const schedule = buildWeeklySchedule(
    skeleton.days.map((d) => d.label),
    ctx.availability.daysPerWeek,
  );

  let draft = await deps.selection({ skeleton, candidates: ctx.pool, styleProfile: ctx.styleProfile });
  let days = sanitizeDraft(draft, poolIds);
  let validation = validate(days, schedule);
  let retried = false;

  // Retry selection ONCE with the exact validator gaps; keep the better attempt.
  if (!validation.ok) {
    retried = true;
    draft = await deps.selection({
      skeleton,
      candidates: ctx.pool,
      styleProfile: ctx.styleProfile,
      feedback: validation.feedback,
    });
    const retryDays = sanitizeDraft(draft, poolIds);
    const retryValidation = validate(retryDays, schedule);
    if (retryValidation.ok || retryValidation.issues.length <= validation.issues.length) {
      days = retryDays;
      validation = retryValidation;
    }
  }

  // Deterministic fallback tier 1: assemble from the agent's skeleton targets.
  if (!validation.ok) {
    const fromSkeleton = assembleFromSkeleton(skeleton, ctx.pool);
    const v = validate(fromSkeleton, schedule);
    if (v.ok) {
      return finalize(deps, ctx, {
        archetype: skeleton.archetype,
        days: fromSkeleton,
        schedule,
        validation: v,
        retried,
        autofilled: true,
      });
    }
  }

  // Deterministic fallback tier 2: a coded balanced default skeleton (guarantees
  // a valid draft whenever the pool can cover the majors).
  if (!validation.ok) {
    const defaultSkeleton = buildDefaultSkeleton(ctx.availability.daysPerWeek);
    const defaultSchedule = buildWeeklySchedule(
      defaultSkeleton.days.map((d) => d.label),
      ctx.availability.daysPerWeek,
    );
    const fromDefault = assembleFromSkeleton(defaultSkeleton, ctx.pool);
    const v = validate(fromDefault, defaultSchedule);
    if (v.ok || v.issues.length < validation.issues.length) {
      return finalize(deps, ctx, {
        archetype: defaultSkeleton.archetype,
        days: fromDefault,
        schedule: defaultSchedule,
        validation: v,
        retried,
        autofilled: true,
      });
    }
  }

  return finalize(deps, ctx, {
    archetype: skeleton.archetype,
    days,
    schedule,
    validation,
    retried,
    autofilled: false,
  });
}
