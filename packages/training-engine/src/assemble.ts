// Deterministic split assembly (Phase 5.2) — the coded fallback that guarantees
// a usable draft when the LLM selection can't land in-bounds (mirrors
// nutrition-engine assembleMeals). Given a day's per-muscle set targets and the
// injury-safe pool, it picks catalog exercises and distributes sets so the day
// hits its volume. The trainer refines it in review (P5.3); needs_attention is
// reserved for a pool that genuinely can't cover the targets.

import type { ExerciseMeta, MuscleGroup, PlannedExercise, SplitDay } from "./types";

// Muscles conventionally trained with ISOLATION work. Selecting a pressing
// "compound" for triceps (close-grip bench, dips) or a chin-up for biceps would
// skew the day's push/pull balance — an accessory target wants an accessory
// movement.
const ACCESSORY_MUSCLES = new Set<MuscleGroup>([
  "biceps",
  "triceps",
  "calves",
  "abs",
  "forearms",
  "traps",
  "adductors",
  "abductors",
  "neck",
]);

export interface MuscleTarget {
  muscle: MuscleGroup;
  sets: number; // per-day working sets to allocate to this muscle
}

// Above this per-muscle target we split the work across two exercises so no
// single movement carries an unrealistic set count.
const SPLIT_ABOVE = 5;
const MAX_SETS_PER_EXERCISE = 8;
const DEFAULT_REPS = "8-12";
const DEFAULT_RIR = 2;

// Is this exercise a compound (has a non-isolation movement pattern)? Compounds
// are preferred as the first pick for a muscle.
function isCompound(e: ExerciseMeta): boolean {
  return e.movement_patterns.some((p) => p !== "isolation");
}

// Candidate exercises for a muscle: prime movers prefer COMPOUNDS, accessory
// muscles prefer ISOLATION (so triceps isn't given a bench press, which would
// skew push/pull balance). Stable by name so the fallback is fully deterministic.
function candidatesFor(pool: ExerciseMeta[], muscle: MuscleGroup): ExerciseMeta[] {
  const preferIso = ACCESSORY_MUSCLES.has(muscle);
  const rank = (e: ExerciseMeta): number => {
    const iso = !isCompound(e);
    return preferIso ? (iso ? 0 : 1) : iso ? 1 : 0;
  };
  return pool
    .filter((e) => e.primary_muscles.includes(muscle))
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    });
}

// Build one day from per-muscle set targets. Distributes each muscle's sets over
// 1–2 distinct exercises (capped at MAX_SETS_PER_EXERCISE each), never repeating
// an exercise within the day.
export function assembleSplitDay(
  label: string,
  pool: ExerciseMeta[],
  targets: MuscleTarget[],
  warmup?: string,
): SplitDay {
  const used = new Set<string>();
  const exercises: PlannedExercise[] = [];

  const push = (cand: ExerciseMeta, sets: number) => {
    used.add(cand.id);
    exercises.push({
      exercise_id: cand.id,
      sets,
      reps: DEFAULT_REPS,
      rir: DEFAULT_RIR,
      tips: `${cand.name} — controlled tempo, ${DEFAULT_RIR} reps in reserve.`,
    });
  };

  for (const { muscle, sets } of targets) {
    const target = Math.max(0, Math.round(sets));
    if (target < 1) continue;
    const cands = candidatesFor(pool, muscle).filter((e) => !used.has(e.id));
    if (cands.length === 0) continue;

    // Hit the target EXACTLY: one exercise for small targets or a single option,
    // split across two when the target is large enough (so balance/volume land
    // where the skeleton asked — no dropped remainder).
    if (target <= SPLIT_ABOVE || cands.length === 1) {
      push(cands[0], Math.min(MAX_SETS_PER_EXERCISE, target));
    } else {
      const a = Math.ceil(target / 2);
      const b = target - a;
      push(cands[0], a);
      if (b >= 1) push(cands[1], b);
    }
  }

  return { label, exercises, ...(warmup ? { warmup } : { warmup: defaultWarmup(targets) }) };
}

function defaultWarmup(targets: MuscleTarget[]): string {
  const first = targets[0]?.muscle;
  return first
    ? `5 min general warmup + 2 light ramp-up sets on the first ${first} movement.`
    : "5 min general warmup + light ramp-up sets before working weight.";
}
