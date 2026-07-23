// Phase 5.1 — deterministic movement-pattern classifier for the exercise seed.
//
// free-exercise-db carries `force` (push|pull|static), `mechanic`
// (compound|isolation), `equipment`, `primaryMuscles`, `level`, `category` — but
// NOT our coded-validation vocabulary (movement_patterns). This module maps each
// source record onto that vocabulary IN CODE (never the model), plus normalizes
// muscles / equipment / experience. It is the "script" half of the spec's
// "script + manual review file for ambiguous ones": genuinely ambiguous or
// multi-pattern lifts (Olympic lifts, thrusters, push-press) are pinned in
// exercise-pattern-overrides.json, which wins outright.
//
// Design rule: fail toward EXCLUDING a movement from a pattern rather than
// mislabeling it — a stretch/cardio row simply gets [] patterns (never selected
// as a working set by the P5.2 pool compiler), and the classifier leans on the
// override file for the hard compound lifts. Pure + synchronous so the Playwright
// suite can assert the mapping against real records with no DB or model.

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

// The record shape we consume from free-exercise-db (dist/exercises.json).
export interface FebExercise {
  id: string;
  name: string;
  force: "push" | "pull" | "static" | null;
  level: "beginner" | "intermediate" | "expert";
  mechanic: "compound" | "isolation" | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  category: string;
  images?: string[];
  instructions?: string[];
}

export interface ClassifiedExercise {
  source_ref: string;
  name: string;
  name_normalized: string;
  aliases: string[];
  primary_muscles: string[];
  secondary_muscles: string[];
  movement_patterns: MovementPattern[];
  equipment: string[];
  experience_min: ExperienceLevel;
  force: "push" | "pull" | "static" | null;
  image_paths: string[];
  instructions: string[];
}

// ── muscle normalization (fixed taxonomy the P5.2 volume validator counts on) ──
const MUSCLE_MAP: Record<string, string> = {
  abdominals: "abs",
  abductors: "abductors",
  adductors: "adductors",
  biceps: "biceps",
  calves: "calves",
  chest: "chest",
  forearms: "forearms",
  glutes: "glutes",
  hamstrings: "hamstrings",
  lats: "lats",
  "lower back": "lower_back",
  "middle back": "upper_back",
  neck: "neck",
  quadriceps: "quads",
  shoulders: "shoulders",
  traps: "traps",
  triceps: "triceps",
};

export function normalizeMuscle(m: string): string {
  return MUSCLE_MAP[m.toLowerCase().trim()] ?? m.toLowerCase().trim().replace(/\s+/g, "_");
}

// ── equipment normalization (coarse buckets the pool compiler gates on) ────────
const EQUIPMENT_MAP: Record<string, string> = {
  "body only": "bodyweight",
  barbell: "barbell",
  dumbbell: "dumbbell",
  cable: "cable",
  machine: "machine",
  kettlebells: "kettlebell",
  bands: "bands",
  "e-z curl bar": "barbell",
  "exercise ball": "other",
  "foam roll": "other",
  "medicine ball": "other",
  other: "other",
};

export function normalizeEquipment(e: string | null): string[] {
  if (!e) return [];
  return [EQUIPMENT_MAP[e.toLowerCase().trim()] ?? "other"];
}

export function normalizeLevel(level: FebExercise["level"]): ExperienceLevel {
  return level === "expert" ? "advanced" : level;
}

function has(name: string, ...frags: string[]): boolean {
  return frags.some((f) => name.includes(f));
}

// The deterministic pattern rules. Returns a de-duplicated, order-stable set.
// `overrides` (feb id → patterns) short-circuits everything.
export function classifyPatterns(
  feb: FebExercise,
  overrides: Record<string, MovementPattern[]> = {},
): MovementPattern[] {
  const override = overrides[feb.id];
  if (override) return [...new Set(override)];

  const name = feb.name.toLowerCase();
  const muscles = feb.primaryMuscles.map((m) => m.toLowerCase());
  const primary = muscles[0] ?? "";
  const patterns = new Set<MovementPattern>();

  // Loaded carries win regardless of muscle.
  if (has(name, "carry", "farmer", "suitcase", "yoke walk", "waiter")) {
    patterns.add("carry");
    return [...patterns];
  }

  // Non-resistance rows (stretches, most cardio) get no strength pattern — the
  // pool compiler never surfaces them as a working set. Plyometric jumps also
  // fall through to [] unless a name rule below fires.
  if (feb.category === "stretching" || feb.category === "cardio") {
    return [];
  }

  const isIso = feb.mechanic === "isolation";

  // ── Lower body ───────────────────────────────────────────────────────────
  if (muscles.includes("quadriceps")) {
    if (has(name, "lunge", "split squat", "step-up", "step up", "bulgarian", "curtsy")) patterns.add("lunge");
    else if (has(name, "leg extension")) patterns.add("isolation");
    else if (
      has(name, "squat", "hack", "leg press", "sissy", "pistol", "wall sit", "zercher", "box squat", "goblet")
    )
      patterns.add("squat");
    else patterns.add(isIso ? "isolation" : "squat");
  }
  if (muscles.includes("hamstrings") || muscles.includes("glutes")) {
    if (has(name, "lunge", "split squat", "step-up", "step up", "bulgarian")) patterns.add("lunge");
    else if (has(name, "leg curl")) patterns.add("isolation");
    else if (
      has(
        name,
        "deadlift",
        "hinge",
        "good morning",
        "romanian",
        "rdl",
        "hip thrust",
        "glute bridge",
        "swing",
        "hyperextension",
        "back extension",
        "pull-through",
        "pull through",
      )
    )
      patterns.add("hinge");
    else if (!muscles.includes("quadriceps")) patterns.add(isIso ? "isolation" : "hinge");
  }
  if (has(primary, "calves", "abductors", "adductors")) patterns.add("isolation");

  // ── Upper push ─────────────────────────────────────────────────────────────
  if (muscles.includes("chest")) {
    if (has(name, "fly", "flye", "pec deck", "crossover", "cross-over")) patterns.add("isolation");
    else if (has(name, "dip")) patterns.add("push_v");
    else patterns.add("push_h");
  }
  if (muscles.includes("shoulders")) {
    if (has(name, "upright row", "high pull")) patterns.add("pull_v");
    else if (
      has(name, "raise", "lateral", "front raise", "rear delt", "reverse fly", "reverse flye", "face pull")
    )
      patterns.add("isolation");
    else if (
      has(name, "press", "push", "overhead", "military", "arnold", "jerk", "z press", "landmine press")
    )
      patterns.add("push_v");
    else patterns.add(isIso ? "isolation" : "push_v");
  }
  if (muscles.includes("triceps")) {
    if (has(name, "close grip bench", "close-grip bench")) patterns.add("push_h");
    else if (has(name, "dip")) patterns.add("push_v");
    else patterns.add("isolation");
  }

  // ── Upper pull ─────────────────────────────────────────────────────────────
  if (muscles.includes("lats")) {
    if (has(name, "pulldown", "pull-down", "pull down", "pullup", "pull-up", "pull up", "chin")) patterns.add("pull_v");
    else if (has(name, "pullover")) patterns.add("isolation");
    else if (has(name, "row")) patterns.add("pull_h");
    else patterns.add(isIso ? "isolation" : "pull_h");
  }
  if (muscles.includes("middle back")) {
    if (has(name, "pulldown", "pullup", "pull-up", "chin")) patterns.add("pull_v");
    else if (has(name, "face pull", "rear delt", "reverse fly")) patterns.add("isolation");
    else if (has(name, "row", "bent over", "bent-over", "t-bar", "t bar", "inverted")) patterns.add("pull_h");
    else patterns.add(isIso ? "isolation" : "pull_h");
  }
  if (muscles.includes("traps")) {
    if (has(name, "shrug")) patterns.add("isolation");
    else if (has(name, "upright row", "high pull")) patterns.add("pull_v");
    else if (has(name, "row")) patterns.add("pull_h");
    else patterns.add("isolation");
  }
  if (has(primary, "biceps", "forearms")) patterns.add("isolation");

  // ── Core / lower-back ────────────────────────────────────────────────────────
  if (muscles.includes("abdominals")) patterns.add("core");
  if (muscles.includes("lower back")) {
    if (has(name, "extension", "hyperextension", "good morning", "deadlift")) patterns.add("hinge");
    else patterns.add("core");
  }
  if (primary === "neck") patterns.add("isolation");

  // Fallback by force when nothing resolved (unusual muscle labelling).
  if (patterns.size === 0) {
    if (feb.force === "push") patterns.add("push_h");
    else if (feb.force === "pull") patterns.add("pull_h");
    else if (isIso) patterns.add("isolation");
  }

  return [...patterns];
}

export function classifyExercise(
  feb: FebExercise,
  overrides: Record<string, MovementPattern[]> = {},
): ClassifiedExercise {
  return {
    source_ref: feb.id,
    name: feb.name,
    name_normalized: feb.name.toLowerCase().trim(),
    aliases: [],
    primary_muscles: feb.primaryMuscles.map(normalizeMuscle),
    secondary_muscles: feb.secondaryMuscles.map(normalizeMuscle),
    movement_patterns: classifyPatterns(feb, overrides),
    equipment: normalizeEquipment(feb.equipment),
    experience_min: normalizeLevel(feb.level),
    force: feb.force,
    image_paths: feb.images ?? [],
    instructions: feb.instructions ?? [],
  };
}
