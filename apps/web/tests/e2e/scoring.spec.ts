import { expect, test } from "@playwright/test";

import {
  BANKING_DEFAULT_CAP,
  SCORE_WEIGHTS,
  bankDay,
  bufferAfterDay,
  comebackStreakDisplay,
  loggingDecaySlope,
  runningBuffer,
  scoreBand,
  streakCount,
  weeklyAdherenceScore,
  weekendFaller,
  weighInAvoider,
  type DayScore,
} from "@supertrainer/scoring";

import { computeClientLens, dayScoreFromLedger, type LedgerDayRow } from "../../lib/ledger/score";
import { consentClient, seedClient, serviceClient, uniqueEmail } from "./helpers";

const metGenericDay = (tzDate: string): LedgerDayRow => ({
  tz_date: tzDate,
  expected: { mode: "generic", mealSlots: [], minMeals: 2, weighIn: false, checkin: false, sets: false },
  misses: { mealSlots: [], meals: 0, weighIn: false, checkin: false, sets: false, total: 0 },
});

// Phase 3.5 — two-lens scoring fixture suite (TDD, written first). Pure math:
// weekly adherence (weighted, no cliffs), supportive bands, streak + 3-day
// comeback, macro banking, and trainer-lens pattern flags.

const perfectMeals: DayScore = { meals: 1, weighIn: null, training: null, checkin: null };

// ── Weekly adherence score ────────────────────────────────────────────────────
test("weights are the spec's 40/15/30/15", () => {
  expect(SCORE_WEIGHTS).toEqual({ meals: 0.4, weighIn: 0.15, training: 0.3, checkin: 0.15 });
});

test("a fully-compliant week scores 100", () => {
  const week: DayScore[] = Array.from({ length: 7 }, () => ({ meals: 1, weighIn: 1, training: 1, checkin: 1 }));
  expect(weeklyAdherenceScore(week)).toBe(100);
});

test("a fully-missed week scores 0", () => {
  const week: DayScore[] = Array.from({ length: 7 }, () => ({ meals: 0, weighIn: 0, training: 0, checkin: 0 }));
  expect(weeklyAdherenceScore(week)).toBe(0);
});

test("one missed meal in a meals-only week is NOT a cliff (>90)", () => {
  const week: DayScore[] = [
    perfectMeals, perfectMeals, perfectMeals,
    { meals: 2 / 3, weighIn: null, training: null, checkin: null }, // missed 1 of 3 slots
    perfectMeals, perfectMeals, perfectMeals,
  ];
  const s = weeklyAdherenceScore(week);
  expect(s).toBeGreaterThan(90);
  expect(s).toBeLessThan(100);
});

test("score normalizes over components that actually applied (weigh-in only some days)", () => {
  // meals perfect every day; weigh-in expected + done twice; nothing else.
  const week: DayScore[] = [
    { meals: 1, weighIn: 1, training: null, checkin: null },
    { meals: 1, weighIn: null, training: null, checkin: null },
    { meals: 1, weighIn: 1, training: null, checkin: null },
  ];
  expect(weeklyAdherenceScore(week)).toBe(100);
});

test("a week with no expectations at all scores 100 (nothing missed)", () => {
  const week: DayScore[] = [{ meals: null, weighIn: null, training: null, checkin: null }];
  expect(weeklyAdherenceScore(week)).toBe(100);
});

test("missing training days pulls the score down proportionally to its 30% weight", () => {
  // meals perfect, training expected 2 days and both missed, nothing else.
  const week: DayScore[] = [
    { meals: 1, weighIn: null, training: 0, checkin: null },
    { meals: 1, weighIn: null, training: 0, checkin: null },
  ];
  // applied weights: meals .4 (avg 1) + training .3 (avg 0) => .4 / .7 => 57
  expect(weeklyAdherenceScore(week)).toBe(57);
});

// ── Supportive bands (no shame language) ──────────────────────────────────────
test("band thresholds: <50 reset, 50-75 building, >75 locked in", () => {
  expect(scoreBand(49).band).toBe("reset");
  expect(scoreBand(50).band).toBe("building");
  expect(scoreBand(75).band).toBe("building");
  expect(scoreBand(76).band).toBe("locked_in");
  expect(scoreBand(100).band).toBe("locked_in");
});

test("band copy is supportive, never shaming", () => {
  const msg = `${scoreBand(20).label} ${scoreBand(20).message}`.toLowerCase();
  for (const bad of ["fail", "failed", "lazy", "bad", "shame", "guilt", "disappoint"]) {
    expect(msg).not.toContain(bad);
  }
});

// ── Streaks + 3-day comeback ──────────────────────────────────────────────────
test("streak counts consecutive all-met days from the most recent", () => {
  expect(streakCount([true, true, false, true, true])).toBe(2);
  expect(streakCount([true, true, true])).toBe(3);
  expect(streakCount([false])).toBe(0);
  expect(streakCount([])).toBe(0);
  expect(streakCount([true, false])).toBe(0); // most recent day missed
});

test("comeback display = floor(previous/2) + comeback days (exact spec)", () => {
  expect(comebackStreakDisplay(10, 3)).toBe(8); // floor(5)+3
  expect(comebackStreakDisplay(7, 3)).toBe(6); // floor(3.5)=3, +3
  expect(comebackStreakDisplay(0, 2)).toBe(2);
  expect(comebackStreakDisplay(1, 0)).toBe(0);
  expect(comebackStreakDisplay(5, 3)).toBe(5); // floor(2.5)=2, +3
});

// ── Macro banking ─────────────────────────────────────────────────────────────
test("default daily bank cap is 150 kcal", () => {
  expect(BANKING_DEFAULT_CAP).toBe(150);
});

test("bankDay caps the banked deficit and goes negative when over target", () => {
  expect(bankDay(1800, 2000, 150)).toBe(150); // 200 deficit, capped
  expect(bankDay(1900, 2000, 150)).toBe(100); // under cap
  expect(bankDay(2000, 2000, 150)).toBe(0); // exactly on target
  expect(bankDay(2300, 2000, 150)).toBe(-300); // over target draws down
});

test("running weekly buffer accumulates and floors at zero", () => {
  expect(runningBuffer([100, 100, 100])).toBe(300);
  expect(runningBuffer([150, 150, -100])).toBe(200);
  expect(runningBuffer([100, 100, -300])).toBe(0); // overage can't go negative
  expect(runningBuffer([])).toBe(0);
});

test("bufferAfterDay reports today's bank and the new buffer (confirm-card copy)", () => {
  const r = bufferAfterDay(220, 1880, 2000, 150); // banked 120
  expect(r.banked).toBe(120);
  expect(r.buffer).toBe(340);
});

test("bufferAfterDay never reports a negative buffer", () => {
  const r = bufferAfterDay(100, 2500, 2000, 150); // 500 over target
  expect(r.banked).toBe(-500);
  expect(r.buffer).toBe(0);
});

// ── Trainer-lens pattern flags ────────────────────────────────────────────────
test("weekend-faller: flagged when weekend adherence collapses vs weekdays", () => {
  const days = [
    { weekday: 1, met: true }, { weekday: 2, met: true }, { weekday: 3, met: true },
    { weekday: 4, met: true }, { weekday: 5, met: true },
    { weekday: 6, met: false }, { weekday: 0, met: false },
  ];
  expect(weekendFaller(days)).toBe(true);
});

test("weekend-faller: not flagged when adherence is uniform", () => {
  const days = [
    { weekday: 1, met: true }, { weekday: 6, met: true }, { weekday: 0, met: true },
  ];
  expect(weekendFaller(days)).toBe(false);
});

test("weigh-in avoider: flagged when most expected weigh-ins are missed", () => {
  expect(
    weighInAvoider([
      { expected: true, done: false }, { expected: true, done: false },
      { expected: true, done: false }, { expected: true, done: true },
    ]),
  ).toBe(true);
});

test("weigh-in avoider: not flagged when they show up", () => {
  expect(
    weighInAvoider([
      { expected: true, done: true }, { expected: true, done: true },
      { expected: true, done: true }, { expected: true, done: false },
    ]),
  ).toBe(false);
});

test("logging decay slope is negative when scores decline, ~0 when flat, positive when improving", () => {
  expect(loggingDecaySlope([100, 90, 80, 70, 60])).toBeLessThan(0);
  expect(loggingDecaySlope([80, 80, 80])).toBeCloseTo(0, 5);
  expect(loggingDecaySlope([60, 70, 80, 90])).toBeGreaterThan(0);
});

// ── ledger_days -> score adapter ──────────────────────────────────────────────
test("adapter: a generic day missing one meal scores that component at 0.5", () => {
  const ds = dayScoreFromLedger(
    { mode: "generic", mealSlots: [], minMeals: 2, weighIn: false, checkin: false, sets: false },
    { mealSlots: [], meals: 1, weighIn: false, checkin: false, sets: false, total: 1 },
  );
  expect(ds.meals).toBe(0.5); // (2 - 1) / 2
  expect(ds.weighIn).toBeNull(); // not expected -> excluded
});

test("adapter: a plan day missing one of three slots scores meals at 2/3", () => {
  const ds = dayScoreFromLedger(
    { mode: "plan", mealSlots: ["breakfast", "lunch", "dinner"], minMeals: 0, weighIn: true, checkin: false, sets: false },
    { mealSlots: ["dinner"], meals: 1, weighIn: true, checkin: false, sets: false, total: 2 },
  );
  expect(ds.meals).toBeCloseTo(2 / 3, 5);
  expect(ds.weighIn).toBe(0); // expected + missed
});

test("computeClientLens rolls perfect days into 100 + a running streak", () => {
  const rows = ["2026-06-01", "2026-06-02", "2026-06-03"].map(metGenericDay);
  const lens = computeClientLens(rows);
  expect(lens.score).toBe(100);
  expect(lens.band.band).toBe("locked_in");
  expect(lens.streak).toBe(3);
});

// ── Client-lens score card renders on the portal ──────────────────────────────
test("portal: the weekly score card renders from closed ledger days (mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const service = serviceClient();
  const { userId, orgId, tokenHash } = await seedClient(uniqueEmail("score-ui"));
  await consentClient(userId);
  const { data: client } = await service.from("clients").select("id").eq("profile_id", userId).single();

  // Three recent perfect (zero-miss) generic days -> score 100, streak 3. Dates
  // are relative to now so they fall inside the portal's 14-day lens window.
  const met = { mealSlots: [], meals: 0, weighIn: false, checkin: false, sets: false, total: 0 };
  const exp = { mode: "generic", mealSlots: [], minMeals: 2, weighIn: false, checkin: false, sets: false };
  const dayOffset = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  for (const off of [1, 2, 3]) {
    await service.from("ledger_days").insert({
      org_id: orgId, client_id: client!.id, tz_date: dayOffset(off), expected: exp, misses: met,
      actual: {}, closed_at: new Date().toISOString(),
    });
  }

  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/portal`);
  await expect(page.getByTestId("score-card")).toBeVisible();
  await expect(page.getByTestId("score-value")).toHaveText("100");
});
