import { expect, test } from "@playwright/test";

import type { SplitDay } from "@supertrainer/training-engine";

import { applySplitEdit, distillSplitEditPatterns, SplitEditError } from "../../lib/splits/edit";
import { splitsActivePayload, exerciseIdsInSplit } from "../../lib/splits/activate";
import { resolveVideo, coverageMeter, parseYoutubeId, type ExerciseVideo } from "../../lib/splits/videos";

// Coverage of the coded split review logic (no browser, no AI): edits produce
// the right capture for the learning loop and never mutate their input; the
// approve payload resolves names + video overrides; the coverage meter counts
// right. Mirrors the P4.3 plan-edit tests.

const days = (): SplitDay[] => [
  {
    label: "Push",
    warmup: "5 min bike",
    exercises: [
      { exercise_id: "bench", sets: 4, reps: "8-12", rir: 2, video_ref: "old" },
      { exercise_id: "ohp", sets: 3, reps: "8-12", rir: 2 },
    ],
  },
  { label: "Pull", exercises: [{ exercise_id: "row", sets: 4, reps: "8-12", rir: 2 }] },
];

test("resize adjusts sets/reps/rir with a resize capture, input untouched", () => {
  const input = days();
  const { days: next, capture } = applySplitEdit(input, {
    kind: "resize",
    dayLabel: "Push",
    exerciseId: "bench",
    sets: 5,
    rir: 1,
  });
  expect(next[0].exercises[0].sets).toBe(5);
  expect(next[0].exercises[0].rir).toBe(1);
  expect(capture.edit_kind).toBe("resize");
  expect(capture.path).toBe("days.0.exercises.0");
  // Input not mutated.
  expect(input[0].exercises[0].sets).toBe(4);
});

test("swap replaces the exercise and clears the stale video ref", () => {
  const { days: next, capture } = applySplitEdit(days(), {
    kind: "swap",
    dayLabel: "Push",
    exerciseId: "bench",
    toExerciseId: "db_press",
  });
  expect(next[0].exercises[0].exercise_id).toBe("db_press");
  expect(next[0].exercises[0].video_ref).toBeNull();
  expect(capture.edit_kind).toBe("swap");
  expect((capture.before as { exercise_id: string }).exercise_id).toBe("bench");
});

test("add / remove adjust the exercise list with matching captures", () => {
  const added = applySplitEdit(days(), {
    kind: "add",
    dayLabel: "Pull",
    exerciseId: "curl",
    sets: 3,
    reps: "10-15",
    rir: 1,
  });
  expect(added.days[1].exercises.map((e) => e.exercise_id)).toEqual(["row", "curl"]);
  expect(added.capture.edit_kind).toBe("add");

  const removed = applySplitEdit(days(), { kind: "remove", dayLabel: "Push", exerciseId: "ohp" });
  expect(removed.days[0].exercises.map((e) => e.exercise_id)).toEqual(["bench"]);
  expect(removed.capture.edit_kind).toBe("remove");
});

test("reorder within a day and across days capture as structure edits", () => {
  const rex = applySplitEdit(days(), { kind: "reorder-exercises", dayLabel: "Push", order: ["ohp", "bench"] });
  expect(rex.days[0].exercises.map((e) => e.exercise_id)).toEqual(["ohp", "bench"]);
  expect(rex.capture.edit_kind).toBe("structure");

  const rdays = applySplitEdit(days(), { kind: "reorder-days", order: ["Pull", "Push"] });
  expect(rdays.days.map((d) => d.label)).toEqual(["Pull", "Push"]);
  expect(rdays.capture.edit_kind).toBe("structure");
});

test("edits validate their targets", () => {
  expect(() => applySplitEdit(days(), { kind: "remove", dayLabel: "Legs", exerciseId: "x" })).toThrow(SplitEditError);
  expect(() => applySplitEdit(days(), { kind: "reorder-days", order: ["Push"] })).toThrow(/permutation/);
});

test("distillSplitEditPatterns surfaces recurring swaps/removes", () => {
  const rows = [
    { edit_kind: "swap" as const, before: { exercise_id: "a" }, after: { exercise_id: "b" } },
    { edit_kind: "swap" as const, before: { exercise_id: "a" }, after: { exercise_id: "b" } },
    { edit_kind: "remove" as const, before: { exercise_id: "c" }, after: null },
  ];
  const lines = distillSplitEditPatterns(rows, 2);
  expect(lines.some((l) => l.includes("a→b"))).toBe(true);
  expect(lines.some((l) => l.includes("c"))).toBe(false); // only 1 remove < threshold
});

test("splitsActivePayload resolves names + winning video refs", () => {
  const names: Record<string, string> = { bench: "Bench Press", ohp: "Overhead Press", row: "Barbell Row" };
  const payload = splitsActivePayload(
    days(),
    { "1": "Push", "4": "Pull" },
    (id) => names[id] ?? id,
    (id) => (id === "bench" ? { kind: "youtube", ref: "yt1" } : null),
  );
  expect(payload.days["Push"][0]).toMatchObject({ name: "Bench Press", target_sets: 4, target_reps: "8-12" });
  expect(payload.days["Push"][0].video_ref).toEqual({ kind: "youtube", ref: "yt1" });
  expect(payload.days["Pull"][0].video_ref).toBeNull();
  expect(payload.schedule).toEqual({ "1": "Push", "4": "Pull" });
  expect([...exerciseIdsInSplit(days())].sort()).toEqual(["bench", "ohp", "row"]);
});

test("resolveVideo: org override beats platform default", () => {
  const vids: ExerciseVideo[] = [
    { exercise_id: "bench", org_id: null, kind: "youtube", storage_path: null, youtube_id: "platform" },
    { exercise_id: "bench", org_id: "orgA", kind: "upload", storage_path: "orgA/bench.mp4", youtube_id: null },
    { exercise_id: "ohp", org_id: null, kind: "youtube", storage_path: null, youtube_id: "plat-ohp" },
  ];
  expect(resolveVideo("bench", "orgA", vids)).toMatchObject({ source: "org", ref: "orgA/bench.mp4" });
  expect(resolveVideo("bench", "orgB", vids)).toMatchObject({ source: "platform", ref: "platform" });
  expect(resolveVideo("ohp", "orgA", vids)).toMatchObject({ source: "platform", ref: "plat-ohp" });
  expect(resolveVideo("row", "orgA", vids)).toBeNull();
});

test("coverageMeter counts org+platform coverage across active exercises", () => {
  const vids: ExerciseVideo[] = [
    { exercise_id: "bench", org_id: "orgA", kind: "upload", storage_path: "p", youtube_id: null },
    { exercise_id: "ohp", org_id: null, kind: "youtube", storage_path: null, youtube_id: "y" },
  ];
  const m = coverageMeter(["bench", "ohp", "row", "row"], "orgA", vids);
  expect(m.total).toBe(3); // deduped
  expect(m.covered).toBe(2);
  expect(m.pct).toBe(67);
  expect(m.uncovered).toEqual(["row"]);
});

test("parseYoutubeId extracts ids from links or accepts a raw id", () => {
  expect(parseYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(parseYoutubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(parseYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(parseYoutubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(parseYoutubeId("not a link")).toBeNull();
});
