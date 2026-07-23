// splits_active payload builder (Phase 5.3). On approval a split's days become
// the one live row per client the workout screen (P3) pre-fills from: a
// day-label → prescribed-exercises map (with catalog names + resolved video
// refs) and the weekday → day-label schedule. Pure so it's unit-tested; the
// action does the upsert/supersede. Mirrors lib/plans/activate.ts.

import type { Schedule, SplitDay } from "@supertrainer/training-engine";

export interface ActiveExercise {
  exercise_id: string;
  name: string;
  target_sets: number;
  target_reps: string;
  target_rir: number;
  video_ref: { kind: "upload" | "youtube"; ref: string } | null;
}

export interface SplitsActivePayload {
  // day label → prescribed exercises (the P3.3 stub's `days` shape, enriched).
  days: Record<string, ActiveExercise[]>;
  // weekday (0-6) → day label.
  schedule: Schedule;
}

export interface VideoRef {
  kind: "upload" | "youtube";
  ref: string;
}

// Build the live payload from an approved split's days + schedule. `nameOf`
// resolves a catalog exercise id → display name; `videoOf` resolves the winning
// video (org override > platform default) or null. Both are injected so this
// stays pure and unit-testable.
export function splitsActivePayload(
  days: SplitDay[],
  schedule: Schedule,
  nameOf: (exerciseId: string) => string,
  videoOf: (exerciseId: string) => VideoRef | null,
): SplitsActivePayload {
  const out: Record<string, ActiveExercise[]> = {};
  for (const day of days) {
    out[day.label] = day.exercises.map((e) => ({
      exercise_id: e.exercise_id,
      name: nameOf(e.exercise_id),
      target_sets: e.sets,
      target_reps: e.reps,
      target_rir: e.rir,
      video_ref: videoOf(e.exercise_id),
    }));
  }
  return { days: out, schedule };
}

// Every distinct exercise id referenced across a set of splits' days — the input
// to the video coverage meter.
export function exerciseIdsInSplit(days: SplitDay[]): Set<string> {
  const ids = new Set<string>();
  for (const day of days) for (const e of day.exercises) ids.add(e.exercise_id);
  return ids;
}
