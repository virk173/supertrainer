import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  classifyExercise,
  classifyPatterns,
  normalizeEquipment,
  normalizeMuscle,
  normalizeLevel,
  type FebExercise,
  type MovementPattern,
} from "../../../../packages/db/scripts/classify-movement";

// The movement_patterns column is coded-validation input (P5.2 volume/balance +
// P5.1 injury exclusions), assigned deterministically at seed time. This locks
// the classifier against the REAL free-exercise-db records so a source refresh
// or rule tweak can't silently re-tag a lift into the wrong pattern.

const seedDir = join(__dirname, "..", "..", "..", "..", "packages", "db", "seed");
const feb = JSON.parse(readFileSync(join(seedDir, "free-exercise-db.json"), "utf8")) as FebExercise[];
const overrides = JSON.parse(
  readFileSync(join(seedDir, "exercise-pattern-overrides.json"), "utf8"),
).overrides as Record<string, MovementPattern[]>;

const byId = new Map(feb.map((e) => [e.id, e]));
function patterns(id: string): MovementPattern[] {
  const e = byId.get(id);
  if (!e) throw new Error(`fixture exercise not in seed: ${id}`);
  return classifyPatterns(e, overrides).sort();
}

test("compound lifts map to the right structural pattern", () => {
  expect(patterns("Barbell_Bench_Press_-_Medium_Grip")).toEqual(["push_h"]);
  expect(patterns("Barbell_Full_Squat")).toEqual(["squat"]);
  expect(patterns("Romanian_Deadlift")).toEqual(["hinge"]);
  expect(patterns("Pullups")).toEqual(["pull_v"]);
  expect(patterns("Standing_Military_Press")).toEqual(["push_v"]);
  expect(patterns("Bent_Over_Barbell_Row")).toEqual(["pull_h"]);
  expect(patterns("Wide-Grip_Lat_Pulldown")).toEqual(["pull_v"]);
  expect(patterns("Dumbbell_Lunges")).toEqual(["lunge"]);
});

test("isolation and core lifts are tagged as such", () => {
  expect(patterns("Barbell_Curl")).toEqual(["isolation"]);
  expect(patterns("Standing_Calf_Raises")).toEqual(["isolation"]);
  expect(patterns("Dumbbell_Flyes")).toEqual(["isolation"]);
  expect(patterns("Tricep_Dumbbell_Kickback")).toEqual(["isolation"]);
  expect(patterns("Barbell_Shrug")).toEqual(["isolation"]);
  expect(patterns("Plank")).toEqual(["core"]);
});

test("overrides pin ambiguous / multi-pattern lifts (incl. push-press → push_v)", () => {
  expect(patterns("Push_Press")).toEqual(["push_v"]);
  expect(patterns("Clean_and_Jerk")).toEqual(["hinge", "push_v"]);
  expect(patterns("Dips_-_Triceps_Version")).toEqual(["push_v"]);
});

test("carries are detected by name across all muscle groups", () => {
  const walk = feb.find((e) => /farmer/i.test(e.name));
  expect(walk).toBeTruthy();
  expect(classifyPatterns(walk!, overrides)).toEqual(["carry"]);
});

test("stretch / cardio rows get no strength pattern (never auto-selected)", () => {
  const stretch = feb.find((e) => e.category === "stretching");
  expect(stretch).toBeTruthy();
  expect(classifyPatterns(stretch!, overrides)).toEqual([]);
});

test("every seeded exercise classifies without throwing; strength rows get a pattern", () => {
  let strengthWithPattern = 0;
  let strengthTotal = 0;
  for (const e of feb) {
    const c = classifyExercise(e, overrides);
    // patterns is always an array; muscles/equipment normalized.
    expect(Array.isArray(c.movement_patterns)).toBe(true);
    if (["strength", "powerlifting", "strongman"].includes(e.category)) {
      strengthTotal++;
      if (c.movement_patterns.length > 0) strengthWithPattern++;
    }
  }
  // The overwhelming majority of resistance lifts resolve to a pattern.
  expect(strengthWithPattern / strengthTotal).toBeGreaterThan(0.95);
});

test("normalizers map source vocab to the fixed taxonomy", () => {
  expect(normalizeMuscle("quadriceps")).toBe("quads");
  expect(normalizeMuscle("middle back")).toBe("upper_back");
  expect(normalizeMuscle("lower back")).toBe("lower_back");
  expect(normalizeEquipment("body only")).toEqual(["bodyweight"]);
  expect(normalizeEquipment("e-z curl bar")).toEqual(["barbell"]);
  expect(normalizeEquipment(null)).toEqual([]);
  expect(normalizeLevel("expert")).toBe("advanced");
  expect(normalizeLevel("beginner")).toBe("beginner");
});
