// Weekly volume + balance math (Phase 5.2). Everything the validator needs to
// know about a split's dosage is computed here, in code, from the planned days +
// the weekly schedule + the exercise catalog metadata. No LLM ever produces one
// of these numbers.

import {
  PULL_PATTERNS,
  PUSH_PATTERNS,
  isMuscleGroup,
  type ExerciseMeta,
  type MovementPattern,
  type MuscleGroup,
  type Schedule,
  type SplitDay,
} from "./types";

// How many times each day LABEL is trained per week (from the weekday schedule).
export function labelFrequency(schedule: Schedule): Map<string, number> {
  const freq = new Map<string, number>();
  for (const label of Object.values(schedule)) {
    freq.set(label, (freq.get(label) ?? 0) + 1);
  }
  return freq;
}

// Direct working sets contributed to each muscle by a single day's exercises.
// Counts PRIMARY muscles at full sets — the standard "hard sets per muscle"
// metric the MEV/MRV landmarks are defined on. Synergist (secondary) work is
// real but not counted against the direct-set landmarks (counting it would push
// compound-heavy programs past MRV on every synergist — an accounting artifact,
// not real overtraining). idx maps exercise_id → its catalog metadata.
export function daySetsPerMuscle(
  day: SplitDay,
  idx: Map<string, ExerciseMeta>,
): Map<MuscleGroup, number> {
  const sets = new Map<MuscleGroup, number>();
  const add = (m: string, n: number) => {
    if (!isMuscleGroup(m)) return;
    sets.set(m, (sets.get(m) ?? 0) + n);
  };
  for (const ex of day.exercises) {
    const meta = idx.get(ex.exercise_id);
    if (!meta) continue;
    for (const m of meta.primary_muscles) add(m, ex.sets);
  }
  return sets;
}

// Weekly sets per muscle = Σ over every scheduled occurrence of each day's
// per-muscle sets. A day trained twice a week counts twice.
export function weeklySetVolume(
  days: SplitDay[],
  schedule: Schedule,
  idx: Map<string, ExerciseMeta>,
): Map<MuscleGroup, number> {
  const byLabel = new Map(days.map((d) => [d.label, d]));
  const freq = labelFrequency(schedule);
  const weekly = new Map<MuscleGroup, number>();

  // If a schedule is present, weight days by how often they're trained; otherwise
  // fall back to one occurrence per distinct day (an un-scheduled draft).
  const occurrences: [SplitDay, number][] = freq.size
    ? [...freq].flatMap(([label, n]) => {
        const d = byLabel.get(label);
        return d ? ([[d, n]] as [SplitDay, number][]) : [];
      })
    : days.map((d) => [d, 1] as [SplitDay, number]);

  for (const [day, n] of occurrences) {
    for (const [muscle, s] of daySetsPerMuscle(day, idx)) {
      weekly.set(muscle, (weekly.get(muscle) ?? 0) + s * n);
    }
  }
  return weekly;
}

function patternSets(
  days: SplitDay[],
  schedule: Schedule,
  idx: Map<string, ExerciseMeta>,
  patterns: readonly MovementPattern[],
): number {
  const set = new Set(patterns);
  const byLabel = new Map(days.map((d) => [d.label, d]));
  const freq = labelFrequency(schedule);
  const occurrences: [SplitDay, number][] = freq.size
    ? [...freq].flatMap(([label, n]) => {
        const d = byLabel.get(label);
        return d ? ([[d, n]] as [SplitDay, number][]) : [];
      })
    : days.map((d) => [d, 1] as [SplitDay, number]);

  let total = 0;
  for (const [day, n] of occurrences) {
    for (const ex of day.exercises) {
      const meta = idx.get(ex.exercise_id);
      if (meta && meta.movement_patterns.some((p) => set.has(p))) total += ex.sets * n;
    }
  }
  return total;
}

export interface PushPullBalance {
  push: number;
  pull: number;
  ratio: number; // push / pull (Infinity if pull is 0 and push > 0)
}

// Weekly push-set vs pull-set balance. A healthy program keeps these near 1:1.
export function pushPullBalance(
  days: SplitDay[],
  schedule: Schedule,
  idx: Map<string, ExerciseMeta>,
): PushPullBalance {
  const push = patternSets(days, schedule, idx, PUSH_PATTERNS);
  const pull = patternSets(days, schedule, idx, PULL_PATTERNS);
  const ratio = pull === 0 ? (push === 0 ? 1 : Infinity) : push / pull;
  return { push, pull, ratio };
}

// Major muscles trained hard (≥ threshold sets) on two CONSECUTIVE scheduled
// training days — a recovery flag (spec §5.2). Uses the weekday order, skipping
// rest days (so Mon→Wed are "consecutive training days" if Tue is rest).
export function consecutiveMuscleOverlap(
  days: SplitDay[],
  schedule: Schedule,
  idx: Map<string, ExerciseMeta>,
  threshold = 4,
): { muscle: MuscleGroup; labels: [string, string] }[] {
  const byLabel = new Map(days.map((d) => [d.label, d]));
  // Ordered list of (weekday, label) for training days only.
  const trainingDays = Object.keys(schedule)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .map((wd) => ({ wd, label: schedule[String(wd)] }))
    .filter((d) => byLabel.has(d.label));

  const heavyMuscles = (label: string): Set<MuscleGroup> => {
    const day = byLabel.get(label);
    const out = new Set<MuscleGroup>();
    if (!day) return out;
    for (const [m, s] of daySetsPerMuscle(day, idx)) if (s >= threshold) out.add(m);
    return out;
  };

  const overlaps: { muscle: MuscleGroup; labels: [string, string] }[] = [];
  for (let i = 0; i + 1 < trainingDays.length; i++) {
    const a = trainingDays[i];
    const b = trainingDays[i + 1];
    const heavyA = heavyMuscles(a.label);
    const heavyB = heavyMuscles(b.label);
    for (const m of heavyA) {
      if (heavyB.has(m)) overlaps.push({ muscle: m, labels: [a.label, b.label] });
    }
  }
  return overlaps;
}
