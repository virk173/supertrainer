import { expect, test } from "@playwright/test";

import { proposeAdjustment, type AdjustmentContext } from "@supertrainer/nutrition-engine";

// Phase 4.4 — the adaptive monthly-adjustment logic (TDD, coded reasoning, no
// LLM). Actual weight trend beats the formula; each rule emits a plain-English
// reason a trainer can see. Fixtures per §④: stall/high-adherence,
// stall/low-adherence, over-rate loss, maintenance hold.

const cutBase: AdjustmentContext = {
  goal: "lose_fat",
  currentKcal: 2200,
  currentProtein: 150,
  weightKg: 90,
  adherencePct: 90,
  weeklyWeightChangeKg: -0.6, // on target for ~0.75%/wk of 90kg
  expectedRatePctPerWeek: 0.6,
  avgLoggedKcal: 2180,
  avgSteps: 8000,
};

test("stall at high adherence → cut kcal OR add steps, both offered, with reasons", () => {
  const p = proposeAdjustment({ ...cutBase, weeklyWeightChangeKg: 0 }); // no loss
  expect(p.changeKind).toBe("reduce_kcal");
  expect(p.newKcal).toBeLessThan(cutBase.currentKcal);
  expect(p.newKcal).toBeGreaterThanOrEqual(Math.round(cutBase.currentKcal * 0.9)); // <=10% cut
  expect(p.reason.toLowerCase()).toMatch(/stall|tdee|slower|below target/);
  // an alternative (add steps) is presented so the trainer can choose
  expect(p.options?.some((o) => o.changeKind === "add_steps")).toBe(true);
});

test("stall at LOW adherence → don't cut harder, propose simplification", () => {
  const p = proposeAdjustment({ ...cutBase, weeklyWeightChangeKg: 0, adherencePct: 40 });
  expect(p.changeKind).toBe("simplify");
  expect(p.newKcal).toBe(cutBase.currentKcal); // targets held, not cut
  expect(p.reason.toLowerCase()).toMatch(/adherence|consistency|simplif/);
});

test("losing faster than target → raise kcal to protect the client", () => {
  const p = proposeAdjustment({ ...cutBase, weeklyWeightChangeKg: -1.4 }); // ~2x target
  expect(p.changeKind).toBe("raise_kcal");
  expect(p.newKcal).toBeGreaterThan(cutBase.currentKcal);
  expect(p.reason.toLowerCase()).toMatch(/faster|rapid|too quickly|protect/);
});

test("on-target cut → hold", () => {
  const p = proposeAdjustment(cutBase);
  expect(p.changeKind).toBe("hold");
  expect(p.newKcal).toBe(cutBase.currentKcal);
});

test("maintenance goal holds unless weight drifts", () => {
  const hold = proposeAdjustment({ ...cutBase, goal: "recomp", weeklyWeightChangeKg: 0.05, expectedRatePctPerWeek: 0 });
  expect(hold.changeKind).toBe("hold");
});

test("bulk gaining too fast → trim kcal", () => {
  const p = proposeAdjustment({
    ...cutBase,
    goal: "build_muscle",
    currentKcal: 3000,
    expectedRatePctPerWeek: 0.25,
    weeklyWeightChangeKg: 0.9, // way over a 0.25%/wk gain of 90kg (~0.225)
  });
  expect(p.changeKind).toBe("reduce_kcal");
  expect(p.newKcal).toBeLessThan(3000);
});

test("protein floor is preserved across adjustments", () => {
  const p = proposeAdjustment({ ...cutBase, weeklyWeightChangeKg: 0 });
  expect(p.newProtein).toBeGreaterThanOrEqual(Math.round(1.6 * cutBase.weightKg));
});
