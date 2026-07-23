import { expect, test } from "@playwright/test";

import {
  proposeProgression,
  estimated1RM,
  parseRepTop,
  type ExerciseSession,
  type ProgressionContext,
  type ProgressionStyle,
} from "@supertrainer/training-engine";

// Deterministic coverage of the coded progression math (no browser, no AI). The
// monthly draft's numbers come from HERE — the client's actual logged
// performance, never the model. Mirrors nutrition-engine.spec.ts adjustment tests.

const sess = (date: string, weightKg: number, reps: number): ExerciseSession => ({ tzDate: date, weightKg, reps });

function ctx(sessions: ExerciseSession[], opts: Partial<ProgressionContext> = {}): ProgressionContext {
  return {
    exerciseId: "bench",
    name: "Bench Press",
    sessions,
    currentSets: 3,
    repTop: 12,
    ...opts,
  };
}

test("estimated1RM (Epley) and parseRepTop are sane", () => {
  expect(estimated1RM(100, 0)).toBe(100);
  expect(estimated1RM(100, 10)).toBeCloseTo(133.33, 1);
  expect(parseRepTop("8-12")).toBe(12);
  expect(parseRepTop("10")).toBe(10);
  expect(parseRepTop("AMRAP")).toBe(12); // fallback
});

test("progressing (hit top of range): load style adds load, volume adds a set", () => {
  const climbing = [sess("2026-07-01", 60, 10), sess("2026-07-08", 60, 12), sess("2026-07-15", 62.5, 12)];
  const load = proposeProgression(ctx(climbing), "load");
  expect(load.changeKind).toBe("add_load");
  expect(load.loadFactor).toBeGreaterThan(1);
  expect(load.loadFactor).toBeLessThanOrEqual(1.1); // bounded +10%
  expect(load.reason).toContain("add");

  const volume = proposeProgression(ctx(climbing), "volume");
  expect(volume.changeKind).toBe("add_set");
  expect(volume.newSets).toBe(4);

  const rotation = proposeProgression(ctx(climbing), "rotation");
  expect(rotation.changeKind).toBe("rotate");
});

test("stalled (3 sessions no PR): load style deloads, rotation rotates", () => {
  const stalled = [
    sess("2026-07-01", 100, 5),
    sess("2026-07-08", 100, 5),
    sess("2026-07-15", 100, 5),
    sess("2026-07-22", 100, 5),
  ];
  const deload = proposeProgression(ctx(stalled, { repTop: 5 }), "load");
  expect(deload.changeKind).toBe("deload");
  expect(deload.loadFactor).toBe(0.9);
  expect(deload.reason).toContain("deload");

  const rotate = proposeProgression(ctx(stalled, { repTop: 5 }), "rotation");
  expect(rotate.changeKind).toBe("rotate");
});

test("regressing: hold and check recovery (never push a downtrend)", () => {
  const regressing = [
    sess("2026-07-01", 100, 8),
    sess("2026-07-08", 102, 8),
    sess("2026-07-15", 95, 6),
    sess("2026-07-22", 88, 5),
  ];
  const p = proposeProgression(ctx(regressing, { repTop: 8 }), "load");
  expect(p.changeKind).toBe("hold");
  expect(p.loadFactor).toBe(1);
  expect(p.reason.toLowerCase()).toContain("recovery");
});

test("absent / thin data: conservative hold", () => {
  expect(proposeProgression(ctx([]), "load").changeKind).toBe("hold");
  expect(proposeProgression(ctx([sess("2026-07-01", 60, 10)]), "load").reason).toContain("not enough");
});

test("mid-range progress: keep adding reps (no load jump yet)", () => {
  const midrange = [sess("2026-07-01", 60, 8), sess("2026-07-08", 60, 9), sess("2026-07-15", 60, 10)];
  const p = proposeProgression(ctx(midrange, { repTop: 12 }), "load");
  expect(p.changeKind).toBe("add_reps");
  expect(p.loadFactor).toBe(1);
});

test("every style yields a bounded, reasoned proposal on the four trajectories", () => {
  const styles: ProgressionStyle[] = ["load", "volume", "rotation", "mixed", "unknown"];
  const trajectories = {
    progressing: [sess("a", 60, 12), sess("b", 62, 12), sess("c", 64, 12)],
    stalling: [sess("a", 80, 6), sess("b", 80, 6), sess("c", 80, 6), sess("d", 80, 6)],
    regressing: [sess("a", 90, 8), sess("b", 85, 7), sess("c", 78, 5)],
    absent: [] as ExerciseSession[],
  };
  for (const style of styles) {
    for (const sessions of Object.values(trajectories)) {
      const p = proposeProgression(ctx(sessions, { repTop: 12 }), style);
      expect(p.reason.length).toBeGreaterThan(0);
      expect(p.loadFactor).toBeGreaterThanOrEqual(0.9);
      expect(p.loadFactor).toBeLessThanOrEqual(1.1);
      expect(p.newSets).toBeGreaterThanOrEqual(1);
    }
  }
});
