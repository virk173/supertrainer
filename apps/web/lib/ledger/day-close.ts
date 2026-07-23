// Phase 3.4 — the day-close engine (pure). Given a client's status/plan/schedule
// and a day's actual logs, derive what was EXPECTED and record anything
// expected-but-absent as a MISS (never blank). Depends only on the pure ./tz
// helper, so it stays unit-testable and shares one timezone source of truth with
// the scheduler and the client/trainer lenses (P3.5/P7).

import { tzDate } from "./tz";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "other";
export type ClientStatus = "lead" | "onboarding" | "active" | "paused" | "churned";

export interface DayActual {
  // distinct meal slots logged that day
  mealSlots: MealSlot[];
  // total meal logs (generic mode counts these, not slots)
  mealCount: number;
  weighIn: boolean;
  checkin: boolean;
  sets: boolean;
}

export interface DayInputs {
  status: ClientStatus;
  // null = pre-plan generic mode (active client, no approved plan yet)
  plan: { mealSlots: MealSlot[] } | null;
  // from the split schedule; null when there's no split
  isTrainingDay: boolean | null;
  isWeighInDay: boolean;
  actual: DayActual;
  // set when this day is being recomputed from a back-dated (late) log
  late?: boolean;
}

export interface Expectations {
  mode: "none" | "generic" | "plan";
  mealSlots: MealSlot[];
  minMeals: number;
  weighIn: boolean;
  checkin: boolean;
  sets: boolean;
}

export interface Misses {
  mealSlots: MealSlot[];
  meals: number;
  weighIn: boolean;
  checkin: boolean;
  sets: boolean;
  total: number;
}

export interface LedgerDayEval {
  expected: Expectations;
  actual: DayActual;
  misses: Misses;
  late: boolean;
}

// The pre-plan promise: an active client with no plan is still expected to log
// at least this many meals a day (keeps the <24h-first-log loop honest).
export const GENERIC_MIN_MEALS = 2;

const NO_EXPECTATIONS: Expectations = {
  mode: "none",
  mealSlots: [],
  minMeals: 0,
  weighIn: false,
  checkin: false,
  sets: false,
};

export function computeExpectations(inputs: DayInputs): Expectations {
  // Only active clients accrue expectations; paused/onboarding/lead/churned owe
  // nothing (paused clients explicitly, per the spec).
  if (inputs.status !== "active") return NO_EXPECTATIONS;

  if (inputs.plan === null) {
    // Generic mode: >=2 meals + intake-chosen weigh-in days, nothing else (no
    // split yet, so no training/check-in expectations).
    return {
      mode: "generic",
      mealSlots: [],
      minMeals: GENERIC_MIN_MEALS,
      weighIn: inputs.isWeighInDay,
      checkin: false,
      sets: false,
    };
  }

  const training = inputs.isTrainingDay === true;
  return {
    mode: "plan",
    mealSlots: inputs.plan.mealSlots,
    minMeals: 0,
    weighIn: inputs.isWeighInDay,
    checkin: training,
    sets: training,
  };
}

export function computeMisses(expected: Expectations, actual: DayActual): Misses {
  if (expected.mode === "none") {
    return { mealSlots: [], meals: 0, weighIn: false, checkin: false, sets: false, total: 0 };
  }

  const missedSlots =
    expected.mode === "plan"
      ? expected.mealSlots.filter((s) => !actual.mealSlots.includes(s))
      : [];
  const missedMeals =
    expected.mode === "plan"
      ? missedSlots.length
      : Math.max(0, expected.minMeals - actual.mealCount);

  const weighIn = expected.weighIn && !actual.weighIn;
  const sets = expected.sets && !actual.sets;
  // Logging working sets auto-satisfies the check-in (P3.3 rule).
  const checkin = expected.checkin && !actual.checkin && !actual.sets;

  const total = missedMeals + (weighIn ? 1 : 0) + (checkin ? 1 : 0) + (sets ? 1 : 0);
  return { mealSlots: missedSlots, meals: missedMeals, weighIn, checkin, sets, total };
}

export function evaluateDay(inputs: DayInputs): LedgerDayEval {
  const expected = computeExpectations(inputs);
  return {
    expected,
    actual: inputs.actual,
    misses: computeMisses(expected, inputs.actual),
    late: inputs.late ?? false,
  };
}

// Has the client's local day (targetDate, YYYY-MM-DD) finished? True once the
// client's local calendar date has advanced past targetDate. Intl is DST- and
// travel-aware, so this is correct across spring-forward and timezone changes;
// tzDate is the shared, guarded implementation (falls back to UTC on a bad zone).
export function dayHasEnded(targetDate: string, timezone: string, now: Date): boolean {
  return tzDate(timezone, now) > targetDate;
}
