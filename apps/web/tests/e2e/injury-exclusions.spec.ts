import { expect, test } from "@playwright/test";

import {
  assessExercise,
  filterExercisePool,
  resolveInjuryTags,
  injuryLabels,
  type ExerciseLike,
  type MovementPattern,
} from "../../../../packages/ai/src/injury-exclusions";

// Deterministic coverage of the training-safety core (no browser, no AI). Split
// generation's injury guarantee rests entirely on filterExercisePool — if an
// exercise survives it (and isn't a logged trainer override), the model can pick
// it, so this is where "no contraindicated exercise reaches an injured client"
// is proven. Mirrors allergens.spec.ts.

const ex = (name: string, patterns: MovementPattern[]): ExerciseLike => ({
  name_normalized: name.toLowerCase(),
  movement_patterns: patterns,
});

test("resolveInjuryTags maps free-text injury history to tags", () => {
  expect([...resolveInjuryTags(["shoulder impingement"])]).toEqual(["shoulder_impingement"]);
  expect([...resolveInjuryTags(["torn ACL last season"])]).toEqual(["knee_acl"]);
  expect([...resolveInjuryTags(["L5 disc herniation"])]).toContain("lumbar_disc");
  expect([...resolveInjuryTags(["tennis elbow"])]).toContain("tennis_elbow");
  expect([...resolveInjuryTags(["inguinal hernia"])]).toEqual(["hernia"]);
  // Generic "shoulder pain" fails closed → the most restrictive shoulder dx.
  expect([...resolveInjuryTags(["shoulder pain when pressing"])]).toContain("shoulder_impingement");
  expect([...resolveInjuryTags([])]).toEqual([]);
  expect([...resolveInjuryTags([""])]).toEqual([]);
});

test("shoulder impingement excludes overhead pressing (push_v)", () => {
  expect(assessExercise(ex("Standing Military Press", ["push_v"]), ["shoulder impingement"]).status).toBe("excluded");
  expect(assessExercise(ex("Seated Dumbbell Shoulder Press", ["push_v"]), ["shoulder impingement"]).status).toBe("excluded");
  // Horizontal press is allowed but flagged, not excluded.
  expect(assessExercise(ex("Barbell Bench Press", ["push_h"]), ["shoulder impingement"]).status).toBe("caution");
  // Unrelated isolation is fine.
  expect(assessExercise(ex("Barbell Curl", ["isolation"]), ["shoulder impingement"]).status).toBe("ok");
});

test("push-press edge cases: excluded by pattern AND by name (belt + suspenders)", () => {
  // Push press classifies to push_v → excluded by pattern.
  const byPattern = assessExercise(ex("Push Press", ["push_v"]), ["shoulder impingement"]);
  expect(byPattern.status).toBe("excluded");
  // Even if a bad upstream tag left it pattern-less, the name net still excludes.
  const byName = assessExercise(ex("Push Press", []), ["shoulder impingement"]);
  expect(byName.status).toBe("excluded");
  expect(byName.excludedBy.some((r) => r.kind === "name" && r.detail === "push press")).toBe(true);
  // Behind-the-neck / upright-row / dip are name-netted too.
  expect(assessExercise(ex("Behind the Neck Press", ["push_v"]), ["shoulder impingement"]).status).toBe("excluded");
  expect(assessExercise(ex("Barbell Upright Row", ["pull_v"]), ["shoulder impingement"]).status).toBe("excluded");
  expect(assessExercise(ex("Dips - Triceps Version", ["push_v"]), ["shoulder impingement"]).status).toBe("excluded");
});

test("lumbar disc excludes loaded spinal flexion (hinge + flexion core)", () => {
  expect(assessExercise(ex("Romanian Deadlift", ["hinge"]), ["L5 disc herniation"]).status).toBe("excluded");
  expect(assessExercise(ex("Good Morning", ["hinge"]), ["disc"]).status).toBe("excluded");
  expect(assessExercise(ex("Weighted Crunch", ["core"]), ["disc"]).status).toBe("excluded");
  // Back squat is axial-loaded → cautioned, not excluded.
  expect(assessExercise(ex("Barbell Full Squat", ["squat"]), ["disc"]).status).toBe("caution");
});

test("ACL / patellar exclude jumping & cutting regardless of pattern", () => {
  expect(assessExercise(ex("Box Jump", []), ["torn ACL"]).status).toBe("excluded");
  expect(assessExercise(ex("Depth Jump", []), ["patellar tendinopathy"]).status).toBe("excluded");
  // Squat/lunge are cautioned for ACL, not excluded (progressed with care).
  expect(assessExercise(ex("Barbell Full Squat", ["squat"]), ["acl"]).status).toBe("caution");
  expect(assessExercise(ex("Leg Extension", ["isolation"]), ["acl"]).status).toBe("caution");
});

test("filterExercisePool splits allowed/excluded and honours audited overrides", () => {
  const pool: ExerciseLike[] = [
    ex("Standing Military Press", ["push_v"]),
    ex("Barbell Bench Press", ["push_h"]),
    ex("Barbell Curl", ["isolation"]),
    ex("Push Press", ["push_v"]),
  ];
  const injuries = ["shoulder impingement"];

  const noOverride = filterExercisePool(pool, injuries);
  const excludedNames = noOverride.excluded.map((a) => a.exercise.name_normalized).sort();
  expect(excludedNames).toEqual(["push press", "standing military press"]);
  // No push_v survives in the allowed pool.
  expect(
    noOverride.allowed.every((a) => !a.exercise.movement_patterns.includes("push_v")),
  ).toBe(true);
  // Bench is allowed-but-cautioned; curl is clean.
  const bench = noOverride.allowed.find((a) => a.exercise.name_normalized === "barbell bench press")!;
  expect(bench.caution).toBe(true);
  const curl = noOverride.allowed.find((a) => a.exercise.name_normalized === "barbell curl")!;
  expect(curl.status).toBe("ok");

  // A trainer override (by name identity here) moves the press into allowed,
  // always flagged caution with a "Trainer override" reason.
  const overridden = filterExercisePool(pool, injuries, {
    overriddenIds: new Set(["standing military press"]),
  });
  const press = overridden.allowed.find((a) => a.exercise.name_normalized === "standing military press");
  expect(press).toBeTruthy();
  expect(press!.caution).toBe(true);
  expect(press!.reasons[0]).toContain("Trainer override");
  // Push press (not overridden) stays excluded.
  expect(overridden.excluded.map((a) => a.exercise.name_normalized)).toEqual(["push press"]);
});

test("no injuries → every exercise is ok", () => {
  const pool = [ex("Standing Military Press", ["push_v"]), ex("Romanian Deadlift", ["hinge"])];
  const { allowed, excluded } = filterExercisePool(pool, []);
  expect(excluded).toHaveLength(0);
  expect(allowed.every((a) => a.status === "ok")).toBe(true);
});

test("injuryLabels exposes the full taxonomy for the intake pick-list", () => {
  const tags = injuryLabels().map((l) => l.tag);
  expect(tags).toContain("shoulder_impingement");
  expect(tags).toContain("hernia");
  expect(injuryLabels().length).toBeGreaterThanOrEqual(10);
});
