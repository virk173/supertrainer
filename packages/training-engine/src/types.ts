// @supertrainer/training-engine — coded volume / balance / progression math
// (Phase 5.2). Pure, zero AI imports, zero DB access: the deterministic numbers
// a training split is built on (CLAUDE.md rule 4 — no LLM arithmetic). The P5.2
// pipeline feeds these outputs to the structure/selection agents; the validator
// recomputes weekly set volume against them. Mirrors packages/nutrition-engine.

// Movement patterns mirror the public.movement_pattern DB enum (+ packages/db
// classify-movement + packages/ai injury-exclusions). Kept as a local union so
// the engine stays dependency-free.
export type MovementPattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "push_h"
  | "push_v"
  | "pull_h"
  | "pull_v"
  | "carry"
  | "core"
  | "isolation";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

// Normalized muscle taxonomy (packages/db classify-movement MUSCLE_MAP output).
export type MuscleGroup =
  | "chest"
  | "lats"
  | "upper_back"
  | "traps"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "abs"
  | "lower_back"
  | "adductors"
  | "abductors"
  | "neck";

// The metadata the volume math needs per exercise (from the exercises catalog).
export interface ExerciseMeta {
  id: string;
  name: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  movement_patterns: MovementPattern[];
}

// One prescribed exercise inside a split day.
export interface PlannedExercise {
  exercise_id: string;
  sets: number;
  reps: string; // a rep range as text, e.g. "8-12" (no arithmetic on it)
  rir: number; // reps-in-reserve target
  tips?: string;
  video_ref?: string | null;
}

// A day in the split: an ordered exercise list + an optional warmup block.
export interface SplitDay {
  label: string; // e.g. "Push", "Upper A", "Full Body"
  exercises: PlannedExercise[];
  warmup?: string;
}

// weekday index (0=Sun … 6=Sat) → day label. A label may repeat (e.g. Push on
// Mon + Thu); a weekday absent from the map is a rest day.
export type Schedule = Record<string, string>;

// ── Evidence-based weekly-set volume landmarks (RP-style; reviewed once, here,
// not asked of an LLM). [MEV, MAV, MRV] = minimum-effective / maximum-adaptive /
// maximum-recoverable weekly working sets per muscle. A deliberate refinement on
// the spec's flat "10-20 default": per-muscle landmarks are the default bound,
// still overridable by the trainer's style profile. Secondary-muscle work counts
// at half a set (SECONDARY_SET_FRACTION). ───────────────────────────────────────
export const VOLUME_LANDMARKS: Record<MuscleGroup, [number, number, number]> = {
  chest: [8, 16, 22],
  lats: [8, 16, 22],
  upper_back: [8, 16, 22],
  traps: [4, 12, 20],
  shoulders: [8, 16, 26],
  biceps: [6, 14, 20],
  triceps: [6, 14, 20],
  forearms: [2, 8, 15],
  quads: [8, 16, 20],
  hamstrings: [6, 14, 20],
  glutes: [4, 12, 16],
  calves: [6, 12, 18],
  abs: [0, 12, 25],
  lower_back: [2, 8, 14],
  adductors: [0, 8, 12],
  abductors: [0, 8, 12],
  neck: [0, 8, 12],
};

// Muscles whose UNDER-training (below MEV) is a hard validation failure worth a
// retry — the split's headline movers. Minor muscles below MEV only warn.
export const MAJOR_MUSCLES: readonly MuscleGroup[] = [
  "chest",
  "lats",
  "upper_back",
  "shoulders",
  "quads",
  "hamstrings",
  "glutes",
];

// Push vs pull weekly-set balance must sit inside this band (spec §5.2).
export const PUSH_PULL_MIN = 0.75;
export const PUSH_PULL_MAX = 1.33;

export const PUSH_PATTERNS: readonly MovementPattern[] = ["push_h", "push_v"];
export const PULL_PATTERNS: readonly MovementPattern[] = ["pull_h", "pull_v"];

// Per-muscle weekly-set window override the trainer's style profile may carry.
export interface StyleVolumeBounds {
  // Global multiplier on the landmark window (e.g. 1.1 for a high-volume coach).
  volumeMultiplier?: number;
  // Explicit per-muscle [min,max] overrides (wins over landmarks + multiplier).
  perMuscle?: Partial<Record<MuscleGroup, [number, number]>>;
}

export function isMuscleGroup(m: string): m is MuscleGroup {
  return m in VOLUME_LANDMARKS;
}

// The typed training intake the split pipeline is built on (parsed from the
// untyped clients.intake + clients.health_flags by parseTrainingIntake).
export interface TrainingIntake {
  daysPerWeek: number;
  // Normalized equipment tokens available (bodyweight|barbell|dumbbell|…).
  equipment: string[];
  experience: ExperienceLevel;
  goal?: string;
  // Free-text injury history (resolved to injury tags by packages/ai
  // injury-exclusions in the pool compiler). Empty = no disclosed injuries.
  injuries: string[];
}
