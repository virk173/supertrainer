import { expect, test } from "@playwright/test";

import { generateSplit, type ExerciseCandidate, type SplitPlanDeps } from "@supertrainer/ai";

import { fakeReview, fakeSplitAgents, fakeStructure } from "./split-fakes";

// Control-flow coverage of the split orchestrator with INJECTED deterministic
// agents (no model). Proves: the happy path produces a valid balanced draft; a
// hallucinated/out-of-pool id can never survive (validate-after); an unbalanced
// selection is repaired by retry + deterministic fallback; the two review loops
// merge. Mirrors diet-pipeline.spec.ts.

// A synthetic pool covering every major muscle with 2 options each, patterns set
// so push/pull balance is achievable.
function makePool(): ExerciseCandidate[] {
  const mk = (
    id: string,
    name: string,
    primary: string[],
    patterns: ExerciseCandidate["movement_patterns"],
    secondary: string[] = [],
  ): ExerciseCandidate => ({
    id,
    name,
    primary_muscles: primary,
    secondary_muscles: secondary,
    movement_patterns: patterns,
    equipment: ["barbell", "dumbbell", "bodyweight"],
    experience_min: "beginner",
  });
  return [
    mk("bench", "Bench Press", ["chest"], ["push_h"], ["triceps", "shoulders"]),
    mk("incline", "Incline DB Press", ["chest"], ["push_h"], ["triceps"]),
    mk("ohp", "Overhead Press", ["shoulders"], ["push_v"], ["triceps"]),
    mk("dbpress", "DB Shoulder Press", ["shoulders"], ["push_v"], ["triceps"]),
    mk("pushdown", "Triceps Pushdown", ["triceps"], ["isolation"]),
    mk("skull", "Skullcrusher", ["triceps"], ["isolation"]),
    mk("pulldown", "Lat Pulldown", ["lats"], ["pull_v"], ["biceps"]),
    mk("pullup", "Pull-up", ["lats"], ["pull_v"], ["biceps"]),
    mk("row", "Barbell Row", ["upper_back"], ["pull_h"], ["lats", "biceps"]),
    mk("cablerow", "Cable Row", ["upper_back"], ["pull_h"], ["biceps"]),
    mk("curl", "Barbell Curl", ["biceps"], ["isolation"]),
    mk("hammer", "Hammer Curl", ["biceps"], ["isolation"]),
    mk("squat", "Back Squat", ["quads"], ["squat"], ["glutes"]),
    mk("legpress", "Leg Press", ["quads"], ["squat"], ["glutes"]),
    mk("rdl", "Romanian Deadlift", ["hamstrings"], ["hinge"], ["glutes"]),
    mk("legcurl", "Leg Curl", ["hamstrings"], ["isolation"]),
    mk("hipthrust", "Hip Thrust", ["glutes"], ["hinge"]),
    mk("lunge", "Walking Lunge", ["glutes"], ["lunge"], ["quads"]),
    mk("calf", "Standing Calf Raise", ["calves"], ["isolation"]),
    mk("seatedcalf", "Seated Calf Raise", ["calves"], ["isolation"]),
    mk("plank", "Plank", ["abs"], ["core"]),
    mk("crunch", "Cable Crunch", ["abs"], ["core"]),
  ];
}

const ctx = (pool: ExerciseCandidate[], daysPerWeek = 4) => ({
  availability: { daysPerWeek },
  experience: "intermediate" as const,
  goal: "build_muscle",
  pool,
});

test("happy path: injected agents produce a valid, balanced draft", async () => {
  const pool = makePool();
  const res = await generateSplit(ctx(pool, 4), fakeSplitAgents);
  expect(res.status).toBe("draft");
  expect(res.validation.ok).toBe(true);
  expect(res.autofilled).toBe(false);
  // push/pull balance inside the band.
  expect(res.validation.balance.ratio).toBeGreaterThanOrEqual(0.75);
  expect(res.validation.balance.ratio).toBeLessThanOrEqual(1.33);
  // Every prescribed exercise is from the pool.
  const poolIds = new Set(pool.map((e) => e.id));
  for (const day of res.days) for (const ex of day.exercises) expect(poolIds.has(ex.exercise_id)).toBe(true);
});

test("validate-after: hallucinated/out-of-pool ids never survive", async () => {
  const pool = makePool();
  const poolIds = new Set(pool.map((e) => e.id));
  // A malicious selection agent that injects a non-pool id into every day.
  const evilAgents: SplitPlanDeps = {
    structure: fakeStructure,
    selection: async (input) => ({
      days: input.skeleton.days.map((d) => ({
        label: d.label,
        exercises: [
          { exercise_id: "GHOST_UNSAFE", sets: 5, reps: "8-12", rir: 2 },
          { exercise_id: "bench", sets: 4, reps: "8-12", rir: 2 },
        ],
      })),
    }),
    review: fakeReview,
  };
  const res = await generateSplit(ctx(pool, 4), evilAgents);
  // The ghost id is dropped; the pipeline falls back to a valid coded split.
  for (const day of res.days) {
    for (const ex of day.exercises) expect(poolIds.has(ex.exercise_id)).toBe(true);
  }
  expect(res.days.some((d) => d.exercises.length > 0)).toBe(true);
});

test("an unbalanced (push-only) selection is repaired via retry + fallback", async () => {
  const pool = makePool();
  const pushOnly: SplitPlanDeps = {
    structure: fakeStructure,
    selection: async (input) => ({
      days: input.skeleton.days.map((d) => ({
        label: d.label,
        exercises: [{ exercise_id: "bench", sets: 6, reps: "8-12", rir: 2 }],
      })),
    }),
    review: fakeReview,
  };
  const res = await generateSplit(ctx(pool, 4), pushOnly);
  expect(res.retried).toBe(true);
  // Fallback rescued it to a balanced, valid split.
  expect(res.validation.ok).toBe(true);
  expect(res.autofilled).toBe(true);
});

test("two review loops merge to the most-critical score", async () => {
  const pool = makePool();
  let call = 0;
  const deps: SplitPlanDeps = {
    structure: fakeStructure,
    selection: fakeSplitAgents.selection,
    review: async () => {
      call += 1;
      return { styleMatchScore: call === 1 ? 90 : 70, practicalityFlags: [`flag${call}`], balanceNotes: `note${call}` };
    },
  };
  const res = await generateSplit(ctx(pool, 4), deps);
  expect(res.critique).toBeTruthy();
  expect(res.critique!.styleMatchScore).toBe(70); // min of the two loops
  expect(res.critique!.practicalityFlags.sort()).toEqual(["flag1", "flag2"]);
});

test("pipeline only ever emits ids from the provided (injury-safe) pool", async () => {
  // A pool with NO vertical-press option (as a shoulder-impingement compiler
  // would leave it): the pipeline can never emit push_v because none exists.
  const pool = makePool().filter((e) => !e.movement_patterns.includes("push_v"));
  const res = await generateSplit(ctx(pool, 4), fakeSplitAgents);
  for (const day of res.days) {
    for (const ex of day.exercises) {
      const meta = pool.find((p) => p.id === ex.exercise_id);
      expect(meta).toBeTruthy();
      expect(meta!.movement_patterns).not.toContain("push_v");
    }
  }
});
