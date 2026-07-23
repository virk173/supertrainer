// Deterministic stand-in agents for the split pipeline (CI). Not a spec file
// (no test()), so Playwright imports but never runs it. The fake selection agent
// fills each skeleton day from the candidate pool with the SAME coded assembly
// the orchestrator's fallback uses — so the merge gate exercises the real control
// flow with zero model calls (mirrors the diet pipeline's injected filler).

import type {
  SplitDraft,
  SplitPlanDeps,
  SplitReviewCritique,
  SplitSelectionInput,
  SplitSkeleton,
  SplitStructureInput,
} from "@supertrainer/ai";
import {
  assembleSplitDay,
  buildDefaultSkeleton,
  isMuscleGroup,
  type ExerciseMeta,
  type MuscleGroup,
} from "@supertrainer/training-engine";

// A structure agent that returns a balanced coded skeleton for the frequency.
export function fakeStructure(input: SplitStructureInput): Promise<SplitSkeleton> {
  const sk = buildDefaultSkeleton(input.availability.daysPerWeek);
  return Promise.resolve({
    archetype: sk.archetype,
    days: sk.days.map((d) => ({ label: d.label, focus: d.focus, muscleTargets: d.muscleTargets })),
  });
}

// A selection agent that fills each skeleton day from the candidate pool via the
// deterministic assembler — always in-pool, always hitting the day's targets.
export function fakeSelection(input: SplitSelectionInput): Promise<SplitDraft> {
  const pool = input.candidates as ExerciseMeta[];
  const days = input.skeleton.days.map((d) => {
    const targets = d.muscleTargets
      .filter((t) => isMuscleGroup(t.muscle))
      .map((t) => ({ muscle: t.muscle as MuscleGroup, sets: t.sets }));
    const built = assembleSplitDay(d.label, pool, targets);
    return {
      label: built.label,
      warmup: built.warmup,
      exercises: built.exercises.map((e) => ({
        exercise_id: e.exercise_id,
        sets: e.sets,
        reps: e.reps,
        rir: e.rir,
        tips: e.tips,
      })),
    };
  });
  return Promise.resolve({ days });
}

export function fakeReview(): Promise<SplitReviewCritique> {
  return Promise.resolve({
    styleMatchScore: 85,
    practicalityFlags: [],
    balanceNotes: "Balanced push/pull and volume across the week.",
  });
}

export const fakeSplitAgents: SplitPlanDeps = {
  structure: fakeStructure,
  selection: fakeSelection,
  review: fakeReview,
};
