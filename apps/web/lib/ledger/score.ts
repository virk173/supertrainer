import {
  scoreBand,
  streakCount,
  weeklyAdherenceScore,
  type DayScore,
  type ScoreBand,
} from "@supertrainer/scoring";

// Phase 3.5 — the bridge from stored ledger_days to the pure scoring package.
// A ledger day records what was expected and what was missed; this turns that
// into the per-component satisfaction the scorer consumes, then rolls up the
// client-lens summary (score + supportive band + streak).

interface LedgerExpected {
  mode: "none" | "generic" | "plan";
  mealSlots: string[];
  minMeals: number;
  weighIn: boolean;
  checkin: boolean;
  sets: boolean;
}
interface LedgerMisses {
  mealSlots: string[];
  meals: number;
  weighIn: boolean;
  checkin: boolean;
  sets: boolean;
  total: number;
}
export interface LedgerDayRow {
  tz_date: string;
  expected: LedgerExpected;
  misses: LedgerMisses;
}

// Per-day component satisfaction (0..1, or null when not expected).
export function dayScoreFromLedger(expected: LedgerExpected, misses: LedgerMisses): DayScore {
  let meals: number | null = null;
  if (expected.mode === "plan" && expected.mealSlots.length > 0) {
    meals = (expected.mealSlots.length - misses.mealSlots.length) / expected.mealSlots.length;
  } else if (expected.mode === "generic" && expected.minMeals > 0) {
    meals = Math.max(0, (expected.minMeals - misses.meals) / expected.minMeals);
  }
  return {
    meals,
    weighIn: expected.weighIn ? (misses.weighIn ? 0 : 1) : null,
    training: expected.sets ? (misses.sets ? 0 : 1) : null,
    checkin: expected.checkin ? (misses.checkin ? 0 : 1) : null,
  };
}

export interface ClientLens {
  score: number;
  band: { band: ScoreBand; label: string; message: string };
  streak: number;
  daysScored: number;
}

// Roll up a client's recent ledger days (ordered oldest -> newest) into the
// client-lens card. A day counts toward the streak when it had zero misses.
export function computeClientLens(rows: LedgerDayRow[]): ClientLens {
  const dayScores = rows.map((r) => dayScoreFromLedger(r.expected, r.misses));
  const score = weeklyAdherenceScore(dayScores);
  const met = rows.map((r) => r.misses.total === 0);
  return { score, band: scoreBand(score), streak: streakCount(met), daysScored: rows.length };
}
