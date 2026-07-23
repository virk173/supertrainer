import { expect, test } from "@playwright/test";

import {
  computeExpectations,
  dayHasEnded,
  evaluateDay,
  type DayInputs,
} from "../../lib/ledger/day-close";

// Phase 3.4 — day-close & auto-miss fixture suite (TDD, written first). The
// engine is pure: given a client's status/plan/schedule and the day's actual
// logs, it derives what was EXPECTED and records anything expected-but-absent as
// a MISS (never blank). Timezone correctness (DST, travel) lives in dayHasEnded.

const NO_LOGS: DayInputs["actual"] = {
  mealSlots: [],
  mealCount: 0,
  weighIn: false,
  checkin: false,
  sets: false,
};

function inputs(over: Partial<DayInputs> = {}): DayInputs {
  return {
    status: "active",
    plan: null,
    isTrainingDay: null,
    isWeighInDay: false,
    actual: NO_LOGS,
    ...over,
  };
}

// ── Pre-plan generic mode (active client, no approved plan) ───────────────────
test("generic mode: expects >=2 meals, no target slots, no sets/checkin", () => {
  const e = computeExpectations(inputs());
  expect(e.mode).toBe("generic");
  expect(e.minMeals).toBe(2);
  expect(e.mealSlots).toEqual([]);
  expect(e.sets).toBe(false);
  expect(e.checkin).toBe(false);
});

test("generic mode: 3 meals + weighed on a weigh-in day -> no misses", () => {
  const r = evaluateDay(
    inputs({
      isWeighInDay: true,
      actual: { ...NO_LOGS, mealCount: 3, weighIn: true },
    }),
  );
  expect(r.misses.total).toBe(0);
  expect(r.misses.meals).toBe(0);
  expect(r.misses.weighIn).toBe(false);
});

test("generic mode: 1 meal on a non-weigh-in day -> 1 missed meal", () => {
  const r = evaluateDay(inputs({ actual: { ...NO_LOGS, mealCount: 1 } }));
  expect(r.misses.meals).toBe(1); // 2 expected - 1 logged
  expect(r.misses.total).toBe(1);
});

test("generic mode: 0 meals on a weigh-in day, not weighed -> 2 meal misses + weigh-in miss", () => {
  const r = evaluateDay(inputs({ isWeighInDay: true }));
  expect(r.misses.meals).toBe(2);
  expect(r.misses.weighIn).toBe(true);
  expect(r.misses.total).toBe(3);
});

test("generic mode: exactly 2 meals -> no meal miss", () => {
  const r = evaluateDay(inputs({ actual: { ...NO_LOGS, mealCount: 2 } }));
  expect(r.misses.meals).toBe(0);
});

test("generic mode: weigh-in not expected off-schedule", () => {
  const e = computeExpectations(inputs({ isWeighInDay: false }));
  expect(e.weighIn).toBe(false);
});

// ── Plan mode (approved plan drives slots + training days) ────────────────────
const PLAN: DayInputs["plan"] = { mealSlots: ["breakfast", "lunch", "dinner"] };

test("plan mode: expectations come from the plan's meal slots", () => {
  const e = computeExpectations(inputs({ plan: PLAN }));
  expect(e.mode).toBe("plan");
  expect(e.mealSlots).toEqual(["breakfast", "lunch", "dinner"]);
});

test("plan mode: all slots logged -> no meal miss", () => {
  const r = evaluateDay(
    inputs({ plan: PLAN, actual: { ...NO_LOGS, mealSlots: ["breakfast", "lunch", "dinner"], mealCount: 3 } }),
  );
  expect(r.misses.mealSlots).toEqual([]);
  expect(r.misses.meals).toBe(0);
});

test("plan mode: missing dinner -> dinner recorded as the missed slot", () => {
  const r = evaluateDay(
    inputs({ plan: PLAN, actual: { ...NO_LOGS, mealSlots: ["breakfast", "lunch"], mealCount: 2 } }),
  );
  expect(r.misses.mealSlots).toEqual(["dinner"]);
  expect(r.misses.meals).toBe(1);
});

test("plan mode: training day, sets logged -> sets satisfied AND check-in auto-satisfied", () => {
  const r = evaluateDay(
    inputs({ plan: PLAN, isTrainingDay: true, actual: { ...NO_LOGS, mealSlots: ["breakfast", "lunch", "dinner"], mealCount: 3, sets: true } }),
  );
  expect(r.misses.sets).toBe(false);
  expect(r.misses.checkin).toBe(false); // sets imply trained
});

test("plan mode: training day, no sets and no check-in -> both missed", () => {
  const r = evaluateDay(
    inputs({ plan: PLAN, isTrainingDay: true, actual: { ...NO_LOGS, mealSlots: ["breakfast", "lunch", "dinner"], mealCount: 3 } }),
  );
  expect(r.misses.sets).toBe(true);
  expect(r.misses.checkin).toBe(true);
  expect(r.misses.total).toBe(2);
});

test("plan mode: training day, check-in logged but no sets -> sets missed, check-in ok", () => {
  const r = evaluateDay(
    inputs({ plan: PLAN, isTrainingDay: true, actual: { ...NO_LOGS, mealSlots: ["breakfast", "lunch", "dinner"], mealCount: 3, checkin: true } }),
  );
  expect(r.misses.sets).toBe(true);
  expect(r.misses.checkin).toBe(false);
});

test("plan mode: rest day expects no sets and no check-in", () => {
  const e = computeExpectations(inputs({ plan: PLAN, isTrainingDay: false }));
  expect(e.sets).toBe(false);
  expect(e.checkin).toBe(false);
});

test("plan mode: rest day with all meals -> no misses", () => {
  const r = evaluateDay(
    inputs({ plan: PLAN, isTrainingDay: false, actual: { ...NO_LOGS, mealSlots: ["breakfast", "lunch", "dinner"], mealCount: 3 } }),
  );
  expect(r.misses.total).toBe(0);
});

test("plan mode: weigh-in day, not weighed -> weigh-in missed", () => {
  const r = evaluateDay(
    inputs({ plan: PLAN, isWeighInDay: true, actual: { ...NO_LOGS, mealSlots: ["breakfast", "lunch", "dinner"], mealCount: 3 } }),
  );
  expect(r.misses.weighIn).toBe(true);
});

// ── Paused / non-active statuses ──────────────────────────────────────────────
test("paused client has no expectations and no misses, whatever they logged", () => {
  const e = computeExpectations(inputs({ status: "paused", plan: PLAN, isTrainingDay: true, isWeighInDay: true }));
  expect(e.mode).toBe("none");
  const r = evaluateDay(inputs({ status: "paused", plan: PLAN, isTrainingDay: true, isWeighInDay: true }));
  expect(r.misses.total).toBe(0);
});

test("onboarding client has no expectations yet", () => {
  expect(computeExpectations(inputs({ status: "onboarding" })).mode).toBe("none");
});

test("churned client has no expectations", () => {
  expect(computeExpectations(inputs({ status: "churned" })).mode).toBe("none");
});

// ── Late back-logging ─────────────────────────────────────────────────────────
test("a late-flagged evaluation carries late=true but still computes misses", () => {
  const r = evaluateDay(inputs({ late: true, actual: { ...NO_LOGS, mealCount: 2 } }));
  expect(r.late).toBe(true);
  expect(r.misses.meals).toBe(0);
});

test("evaluations default to late=false", () => {
  expect(evaluateDay(inputs()).late).toBe(false);
});

// ── Timezone-correct day boundary (DST + travel) ──────────────────────────────
test("Kolkata (no DST): the day has ended just after local midnight", () => {
  // 2026-07-23 00:30 IST == 2026-07-22 19:00 UTC.
  expect(dayHasEnded("2026-07-22", "Asia/Kolkata", new Date("2026-07-22T19:00:00Z"))).toBe(true);
});

test("Kolkata: the day has NOT ended at 23:30 local", () => {
  // 2026-07-22 23:30 IST == 2026-07-22 18:00 UTC.
  expect(dayHasEnded("2026-07-22", "Asia/Kolkata", new Date("2026-07-22T18:00:00Z"))).toBe(false);
});

test("Toronto spring-forward day: ended just after the (shifted) local midnight", () => {
  // DST began 2026-03-08; by 2026-03-09 00:30 the offset is EDT (-4) == 04:30 UTC.
  expect(dayHasEnded("2026-03-08", "America/Toronto", new Date("2026-03-09T04:30:00Z"))).toBe(true);
});

test("Toronto spring-forward day: NOT ended at 23:30 local on the 8th", () => {
  // 2026-03-08 23:30 EDT == 2026-03-09 03:30 UTC.
  expect(dayHasEnded("2026-03-08", "America/Toronto", new Date("2026-03-09T03:30:00Z"))).toBe(false);
});

test("traveler: the SAME instant ends the day in Kolkata but not in Toronto", () => {
  const now = new Date("2026-07-22T19:00:00Z"); // Kolkata 00:30 next day; Toronto 15:00 same day
  expect(dayHasEnded("2026-07-22", "Asia/Kolkata", now)).toBe(true);
  expect(dayHasEnded("2026-07-22", "America/Toronto", now)).toBe(false);
});

test("a future day (before it starts) has not ended", () => {
  expect(dayHasEnded("2026-07-25", "Asia/Kolkata", new Date("2026-07-22T19:00:00Z"))).toBe(false);
});

// ── Partial-log permutations (breadth) ────────────────────────────────────────
const SLOT_CASES: Array<{ logged: DayInputs["actual"]["mealSlots"]; missed: string[] }> = [
  { logged: [], missed: ["breakfast", "lunch", "dinner"] },
  { logged: ["breakfast"], missed: ["lunch", "dinner"] },
  { logged: ["lunch"], missed: ["breakfast", "dinner"] },
  { logged: ["dinner"], missed: ["breakfast", "lunch"] },
  { logged: ["breakfast", "dinner"], missed: ["lunch"] },
  { logged: ["lunch", "dinner"], missed: ["breakfast"] },
  { logged: ["breakfast", "lunch", "dinner"], missed: [] },
];
for (const c of SLOT_CASES) {
  test(`plan slot coverage: logged [${c.logged.join(",")}] -> missed [${c.missed.join(",")}]`, () => {
    const r = evaluateDay(
      inputs({ plan: PLAN, actual: { ...NO_LOGS, mealSlots: c.logged, mealCount: c.logged.length } }),
    );
    expect(r.misses.mealSlots).toEqual(c.missed);
  });
}

test("plan mode with a snack slot: snack expected and missed", () => {
  const r = evaluateDay(
    inputs({
      plan: { mealSlots: ["breakfast", "lunch", "dinner", "snack"] },
      actual: { ...NO_LOGS, mealSlots: ["breakfast", "lunch", "dinner"], mealCount: 3 },
    }),
  );
  expect(r.misses.mealSlots).toEqual(["snack"]);
});

test("misses.total sums meals + weigh-in + check-in + sets", () => {
  const r = evaluateDay(
    inputs({ plan: PLAN, isTrainingDay: true, isWeighInDay: true, actual: NO_LOGS }),
  );
  // 3 slots + weigh-in + check-in + sets
  expect(r.misses.total).toBe(6);
});
