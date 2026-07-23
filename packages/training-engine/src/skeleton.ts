// Coded split skeleton + weekly scheduler (Phase 5.2). The structure agent
// normally designs the archetype in the trainer's style; this is the
// DETERMINISTIC fallback (buildDefaultSkeleton) that guarantees a balanced,
// in-bounds skeleton when the agent's is unusable, plus the weekday spacing
// (buildWeeklySchedule) — pure scheduling/volume math, never the model.

import type { MuscleGroup, Schedule } from "./types";

export interface SkeletonMuscleTarget {
  muscle: MuscleGroup;
  sets: number; // per-day working sets for this muscle
}
export interface SkeletonDay {
  label: string;
  focus: string;
  muscleTargets: SkeletonMuscleTarget[];
}
export interface Skeleton {
  archetype: string;
  days: SkeletonDay[];
}

// Evidence-based weekly set targets (mid-MAV) the default skeleton aims for; the
// validator's landmark bounds confirm the result lands in-range. Push and pull
// prime movers are held EQUAL (chest==lats, shoulders==upper_back) so the
// assembled split is push/pull balanced by construction at any training
// frequency — legs (squat/hinge) don't affect the push/pull ratio.
const WEEKLY_TARGET: Partial<Record<MuscleGroup, number>> = {
  chest: 14,
  lats: 14,
  upper_back: 12,
  shoulders: 12,
  biceps: 10,
  triceps: 10,
  quads: 14,
  hamstrings: 12,
  glutes: 8,
  calves: 10,
  abs: 8,
};

// Even weekday spacing per training frequency (0=Sun … 6=Sat), rest days between
// sessions where possible.
const WEEKDAY_PATTERN: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

// Assign the split's day labels across the week. Labels cycle over the chosen
// training weekdays, so N distinct labels + more training days repeats them
// evenly (e.g. Push/Pull/Legs over 6 days → each twice).
export function buildWeeklySchedule(dayLabels: string[], daysPerWeek: number): Schedule {
  const d = Math.max(1, Math.min(7, Math.round(daysPerWeek)));
  const weekdays = WEEKDAY_PATTERN[d] ?? WEEKDAY_PATTERN[3];
  const labels = dayLabels.length ? dayLabels : ["Full Body"];
  const schedule: Schedule = {};
  weekdays.forEach((wd, i) => {
    schedule[String(wd)] = labels[i % labels.length];
  });
  return schedule;
}

function perDay(muscles: MuscleGroup[], frequency: number): SkeletonMuscleTarget[] {
  return muscles.map((muscle) => ({
    muscle,
    sets: Math.max(2, Math.round((WEEKLY_TARGET[muscle] ?? 8) / frequency)),
  }));
}

const UPPER: MuscleGroup[] = ["chest", "lats", "upper_back", "shoulders", "biceps", "triceps"];
const LOWER: MuscleGroup[] = ["quads", "hamstrings", "glutes", "calves"];
const PUSH: MuscleGroup[] = ["chest", "shoulders", "triceps"];
const PULL: MuscleGroup[] = ["lats", "upper_back", "biceps"];
const LEGS: MuscleGroup[] = ["quads", "hamstrings", "glutes", "calves"];
const ALL: MuscleGroup[] = [...UPPER, ...LOWER, "abs"];

// A balanced default skeleton for the given frequency: UL at 4 days, PPL at 6,
// full-body otherwise. Per-day targets are computed so weekly volume (× the
// day's schedule frequency) lands inside the landmark bounds. Always balanced by
// construction, so assembleSplitDay over it yields a valid split.
export function buildDefaultSkeleton(daysPerWeek: number): Skeleton {
  const d = Math.max(1, Math.min(7, Math.round(daysPerWeek)));
  if (d === 4) {
    return {
      archetype: "upper/lower",
      days: [
        { label: "Upper", focus: "upper body", muscleTargets: perDay(UPPER, 2) },
        { label: "Lower", focus: "lower body", muscleTargets: perDay(LOWER, 2) },
      ],
    };
  }
  if (d === 6) {
    return {
      archetype: "push/pull/legs",
      days: [
        { label: "Push", focus: "chest/shoulders/triceps", muscleTargets: perDay(PUSH, 2) },
        { label: "Pull", focus: "back/biceps", muscleTargets: perDay(PULL, 2) },
        { label: "Legs", focus: "quads/hamstrings/glutes", muscleTargets: perDay(LEGS, 2) },
      ],
    };
  }
  // 1,2,3,5,7 → full body repeated d times (frequency d).
  return {
    archetype: "full body",
    days: [{ label: "Full Body", focus: "whole body", muscleTargets: perDay(ALL, d) }],
  };
}
