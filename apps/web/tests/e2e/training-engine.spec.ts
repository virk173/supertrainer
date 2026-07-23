import { expect, test } from "@playwright/test";

import {
  weeklySetVolume,
  pushPullBalance,
  validateSplit,
  buildExerciseIndex,
  muscleBounds,
  assembleSplitDay,
  parseTrainingIntake,
  normalizeEquipmentAccess,
  normalizeExperience,
  type ExerciseMeta,
  type SplitDay,
  type Schedule,
} from "../../../../packages/training-engine/src/index";

// Deterministic coverage of the coded training math (no browser, no AI). The
// split pipeline's volume/balance guarantees rest entirely on validateSplit —
// this is where "every draft respects the landmarks + push/pull balance" is
// proven. Mirrors nutrition-engine.spec.ts.

const CATALOG: ExerciseMeta[] = [
  { id: "bench", name: "Barbell Bench Press", primary_muscles: ["chest"], secondary_muscles: ["triceps", "shoulders"], movement_patterns: ["push_h"] },
  { id: "ohp", name: "Overhead Press", primary_muscles: ["shoulders"], secondary_muscles: ["triceps"], movement_patterns: ["push_v"] },
  { id: "row", name: "Barbell Row", primary_muscles: ["upper_back"], secondary_muscles: ["lats", "biceps"], movement_patterns: ["pull_h"] },
  { id: "pulldown", name: "Lat Pulldown", primary_muscles: ["lats"], secondary_muscles: ["biceps"], movement_patterns: ["pull_v"] },
  { id: "squat", name: "Back Squat", primary_muscles: ["quads"], secondary_muscles: ["glutes"], movement_patterns: ["squat"] },
  { id: "rdl", name: "Romanian Deadlift", primary_muscles: ["hamstrings"], secondary_muscles: ["glutes", "lower_back"], movement_patterns: ["hinge"] },
  { id: "curl", name: "Barbell Curl", primary_muscles: ["biceps"], secondary_muscles: [], movement_patterns: ["isolation"] },
  { id: "pushdown", name: "Triceps Pushdown", primary_muscles: ["triceps"], secondary_muscles: [], movement_patterns: ["isolation"] },
];
const idx = buildExerciseIndex(CATALOG);
const poolIds = new Set(CATALOG.map((e) => e.id));

test("weeklySetVolume weights days by schedule frequency (primary full, secondary half)", () => {
  const push: SplitDay = {
    label: "Push",
    exercises: [
      { exercise_id: "bench", sets: 4, reps: "8-12", rir: 2 },
      { exercise_id: "ohp", sets: 3, reps: "8-12", rir: 2 },
    ],
  };
  // Trained Mon + Thu.
  const schedule: Schedule = { "1": "Push", "4": "Push" };
  const weekly = weeklySetVolume([push], schedule, idx);
  // Direct (primary) sets only: chest = bench 4/day × 2 = 8.
  expect(weekly.get("chest")).toBe(8);
  // shoulders: ohp primary 3/day × 2 = 6 (bench's shoulders are secondary, uncounted).
  expect(weekly.get("shoulders")).toBe(6);
  // triceps is only ever secondary here → not a counted (direct) muscle.
  expect(weekly.get("triceps")).toBeUndefined();
});

test("pushPullBalance flags a push-only split as imbalanced", () => {
  const push: SplitDay = {
    label: "Push",
    exercises: [{ exercise_id: "bench", sets: 5, reps: "8-12", rir: 2 }],
  };
  const bal = pushPullBalance([push], { "1": "Push" }, idx);
  expect(bal.push).toBe(5);
  expect(bal.pull).toBe(0);
  expect(bal.ratio).toBe(Infinity);
});

test("validateSplit passes a balanced, in-bounds upper/lower ×2", () => {
  const upper: SplitDay = {
    label: "Upper",
    exercises: [
      { exercise_id: "bench", sets: 4, reps: "8-12", rir: 2 },
      { exercise_id: "ohp", sets: 4, reps: "8-12", rir: 2 },
      { exercise_id: "row", sets: 4, reps: "8-12", rir: 2 },
      { exercise_id: "pulldown", sets: 4, reps: "8-12", rir: 2 },
    ],
  };
  const lower: SplitDay = {
    label: "Lower",
    exercises: [
      { exercise_id: "squat", sets: 5, reps: "6-10", rir: 2 },
      { exercise_id: "rdl", sets: 5, reps: "6-10", rir: 2 },
    ],
  };
  const schedule: Schedule = { "1": "Upper", "2": "Lower", "4": "Upper", "5": "Lower" };
  const res = validateSplit([upper, lower], schedule, idx, poolIds);
  expect(res.ok).toBe(true);
  expect(res.issues).toEqual([]);
  // push (bench+ohp) 8/day ×2 = 16; pull (row+pulldown) 8/day ×2 = 16 → ratio 1.
  expect(res.balance.ratio).toBeCloseTo(1, 5);
});

test("validateSplit fails on balance, over-volume, and out-of-pool ids", () => {
  const push: SplitDay = {
    label: "Push",
    exercises: [
      { exercise_id: "bench", sets: 8, reps: "8-12", rir: 2 },
      { exercise_id: "ohp", sets: 8, reps: "8-12", rir: 2 },
      { exercise_id: "ghost", sets: 3, reps: "8-12", rir: 2 },
    ],
  };
  const schedule: Schedule = { "1": "Push", "2": "Push", "4": "Push" };
  const res = validateSplit([push], schedule, idx, poolIds);
  expect(res.ok).toBe(false);
  const kinds = res.issues.map((i) => i.kind);
  expect(kinds).toContain("pool"); // ghost id
  expect(kinds).toContain("balance"); // no pulls
  // chest 8/day × 3 = 24 > MRV 22.
  expect(kinds).toContain("volume_over");
  expect(res.feedback).toContain("[pool]");
});

test("muscleBounds honours style overrides + multiplier", () => {
  expect(muscleBounds("chest")).toEqual([8, 22]); // landmark default
  expect(muscleBounds("chest", { volumeMultiplier: 1.5 })).toEqual([12, 33]);
  expect(muscleBounds("chest", { perMuscle: { chest: [6, 12] } })).toEqual([6, 12]);
});

test("assembleSplitDay deterministically fills a day from muscle targets", () => {
  const day = assembleSplitDay("Push", CATALOG, [
    { muscle: "chest", sets: 4 },
    { muscle: "shoulders", sets: 3 },
  ]);
  expect(day.label).toBe("Push");
  // chest → bench (compound, primary chest); shoulders → ohp.
  const ids = day.exercises.map((e) => e.exercise_id);
  expect(ids).toContain("bench");
  expect(ids).toContain("ohp");
  // Fully valid against the pool.
  const res = validateSplit([day], { "1": "Push" }, idx, poolIds);
  expect(res.issues.filter((i) => i.kind === "pool" || i.kind === "structure")).toEqual([]);
  // Deterministic: same inputs → same output.
  const again = assembleSplitDay("Push", CATALOG, [
    { muscle: "chest", sets: 4 },
    { muscle: "shoulders", sets: 3 },
  ]);
  expect(again).toEqual(day);
});

test("parseTrainingIntake reads days/equipment/experience + injuries from health_flags", () => {
  const intake = {
    goal: "build_muscle",
    stage_b: { training: { daysPerWeek: 4, equipmentAccess: "full commercial gym", experience: "5 years lifting" } },
  };
  const healthFlags = {
    interview: { categories: ["injury"], matched: ["shoulder"], excerpt: "torn my rotator cuff last year, shoulder still cranky overhead" },
  };
  const res = parseTrainingIntake(intake, healthFlags);
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.intake.daysPerWeek).toBe(4);
  expect(res.intake.experience).toBe("advanced");
  expect(res.intake.equipment).toContain("barbell");
  expect(res.intake.injuries.join(" ")).toContain("rotator cuff");
});

test("parseTrainingIntake reports missing/invalid days", () => {
  expect(parseTrainingIntake({}, {}).ok).toBe(false);
  expect(parseTrainingIntake({ stage_b: { training: { daysPerWeek: 9 } } }, {}).ok).toBe(false);
});

test("equipment + experience normalizers fail toward safe defaults", () => {
  expect(normalizeEquipmentAccess("just dumbbells at home")).toEqual(
    expect.arrayContaining(["dumbbell", "bodyweight"]),
  );
  expect(normalizeEquipmentAccess("bodyweight only")).toEqual(["bodyweight"]);
  expect(normalizeEquipmentAccess("full gym")).toContain("machine");
  // Unknown experience → beginner (less-loaded gate).
  expect(normalizeExperience(undefined)).toBe("beginner");
  expect(normalizeExperience("total newbie")).toBe("beginner");
  expect(normalizeExperience("advanced")).toBe("advanced");
});
