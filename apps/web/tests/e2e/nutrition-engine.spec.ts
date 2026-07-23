import { expect, test } from "@playwright/test";

import {
  activityFactor,
  calculateTargets,
  compileConstraints,
  DEFAULT_PROTEIN_PER_KG,
  KCAL_FLOOR,
  KCAL_PER_G,
  MAX_CUT_RATE_PCT_PER_WEEK,
  mifflinStJeorBMR,
  parseIntake,
  SAFETY_PROTEIN_FLOOR_PER_KG,
  tdee,
  type IntakeInput,
} from "@supertrainer/nutrition-engine";

// Phase 4.1 — nutrition-engine fixture suite (TDD, written before the engine).
// Pure math only (CLAUDE.md rule 4): Mifflin-St Jeor BMR, a job+training activity
// factor, goal-bounded kcal, protein-floored macros, carb-cycle day types that
// sum to the weekly target, IF windows, and absurd-input guards — plus the
// intake→constraints compiler. Expected numbers are hand-computed, never
// recomputed via the implementation.

// A well-formed baseline intake; tests clone + tweak it.
const male80: IntakeInput = {
  age: 30,
  sex: "male",
  heightCm: 180,
  weightKg: 80,
  goal: "lose_fat",
  activity: "moderate",
  trainingDaysPerWeek: 4,
  diet: "non_veg",
};

// energy in the macros of a day type, for the code-only recompute invariant.
const macroKcal = (m: { protein_g: number; carbs_g: number; fat_g: number }) =>
  m.protein_g * KCAL_PER_G.protein + m.carbs_g * KCAL_PER_G.carb + m.fat_g * KCAL_PER_G.fat;

// ── Mifflin-St Jeor BMR ───────────────────────────────────────────────────────
test("Mifflin BMR — male uses the +5 constant", () => {
  // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
  const { bmr, sexEstimated } = mifflinStJeorBMR({ sex: "male", weightKg: 80, heightCm: 180, age: 30 });
  expect(bmr).toBe(1780);
  expect(sexEstimated).toBe(false);
});

test("Mifflin BMR — female uses the -161 constant", () => {
  // 10*60 + 6.25*165 - 5*30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25 -> 1320
  const { bmr } = mifflinStJeorBMR({ sex: "female", weightKg: 60, heightCm: 165, age: 30 });
  expect(bmr).toBe(1320);
});

test("Mifflin BMR — other/prefer_not averages the constant and flags it", () => {
  // constant = (+5 + -161)/2 = -78. 700 + 1093.75 - 150 - 78 = 1565.75 -> 1566
  const { bmr, sexEstimated } = mifflinStJeorBMR({ sex: "other", weightKg: 70, heightCm: 175, age: 30 });
  expect(bmr).toBe(1566);
  expect(sexEstimated).toBe(true);
});

// ── Activity factor (job type + training days, bounded 1.2–1.9) ────────────────
test("activity factor — base level plus 0.05 per training day", () => {
  expect(activityFactor("sedentary", 0)).toBeCloseTo(1.2, 3); // 1.2 + 0
  expect(activityFactor("sedentary", 4)).toBeCloseTo(1.4, 3); // 1.2 + 0.20
  expect(activityFactor("moderate", 3)).toBeCloseTo(1.7, 3); // 1.55 + 0.15
});

test("activity factor — clamped to 1.9 and monotonic in training days", () => {
  expect(activityFactor("very_active", 5)).toBeCloseTo(1.9, 3); // 1.9 + 0.25 clamped
  expect(activityFactor("light", 2)).toBeLessThanOrEqual(activityFactor("light", 3));
});

test("activity factor — a trainer override replaces the computed factor", () => {
  expect(activityFactor("sedentary", 0, 1.65)).toBeCloseTo(1.65, 3);
});

test("tdee — BMR times the composed activity factor", () => {
  const t = tdee(male80); // BMR 1780, factor moderate+4 = 1.75 -> 3115
  expect(t.bmr).toBe(1780);
  expect(t.activityFactor).toBeCloseTo(1.75, 3);
  expect(t.tdee).toBe(3115);
});

// ── calculateTargets — kcal direction + macros ────────────────────────────────
test("male moderate cut — deficit within bound, protein at 1.6 g/kg", () => {
  const r = calculateTargets(male80);
  expect(r.status).toBe("ok");
  expect(r.tdee).toBe(3115);
  // default cut 0.5%/wk: 0.005*80*7700/7 = 440 kcal/day deficit -> 3115 - 440 = 2675
  expect(r.kcal).toBeCloseTo(2675, 0);
  expect(r.macros.protein_g).toBe(128); // 1.6 * 80
  expect(r.macros.fat_g).toBe(64); // 0.8 * 80
  // macros recompute to the kcal target (code-only arithmetic, within rounding)
  expect(Math.abs(macroKcal(r.macros) - r.kcal)).toBeLessThanOrEqual(5);
  expect(r.flags).toEqual([]);
  expect(r.dayTypes).toHaveLength(1);
  expect(r.protocol.type).toBe("standard");
});

test("male bulk — surplus above maintenance, within the 0.5%/wk ceiling", () => {
  const r = calculateTargets({
    ...male80,
    age: 25,
    heightCm: 175,
    weightKg: 70,
    goal: "build_muscle",
    activity: "light",
    trainingDaysPerWeek: 5,
  });
  // BMR 1674, factor 1.375+0.25=1.625, TDEE 2720; bulk 0.3%: 0.003*70*7700/7=231 -> 2951
  expect(r.tdee).toBe(2720);
  expect(r.kcal).toBeCloseTo(2951, 0);
  expect(r.kcal).toBeGreaterThan(r.tdee);
});

test("recomp — holds at maintenance (kcal == tdee)", () => {
  const r = calculateTargets({
    ...male80,
    age: 28,
    sex: "female",
    heightCm: 168,
    weightKg: 62,
    goal: "recomp",
    activity: "active",
    trainingDaysPerWeek: 4,
  });
  expect(r.kcal).toBe(r.tdee);
});

test("small female cut — clamps up to the 1200 kcal floor and flags it", () => {
  const r = calculateTargets({
    ...male80,
    sex: "female",
    heightCm: 155,
    weightKg: 50,
    activity: "sedentary",
    trainingDaysPerWeek: 0,
  });
  expect(r.kcal).toBe(KCAL_FLOOR.female);
  expect(r.flags).toContain("kcal_floored");
});

test("other/prefer_not sex — carries the sex_estimated flag through targets", () => {
  const r = calculateTargets({ ...male80, sex: "prefer_not" });
  expect(r.flags).toContain("sex_estimated");
});

// ── Protein floor ─────────────────────────────────────────────────────────────
test("style below the safety floor is raised to 1.2 g/kg and flagged", () => {
  const r = calculateTargets(male80, { proteinPerKg: 1.0 });
  expect(r.macros.protein_g).toBe(SAFETY_PROTEIN_FLOOR_PER_KG * 80); // 96
  expect(r.flags).toContain("protein_floored");
});

test("style may raise protein above the default without a flag", () => {
  const r = calculateTargets(male80, { proteinPerKg: 2.2 });
  expect(r.macros.protein_g).toBe(176); // 2.2 * 80
  expect(r.flags).not.toContain("protein_floored");
  expect(DEFAULT_PROTEIN_PER_KG).toBe(1.6);
});

// ── Carb cycling ──────────────────────────────────────────────────────────────
test("carb-cycle — high/med/low day types sum to the weekly target, protein constant", () => {
  const r = calculateTargets(male80, {
    protocol: { type: "carb_cycle", config: { high: 3, med: 1, low: 3 } },
    carbCycleShift: 0.2,
  });
  expect(r.dayTypes).toHaveLength(3);
  const byName = Object.fromEntries(r.dayTypes.map((d) => [d.name, d]));
  expect(byName.high.kcal).toBeGreaterThan(byName.med.kcal);
  expect(byName.med.kcal).toBeGreaterThan(byName.low.kcal);
  // protein is held constant across day types; carbs absorb the kcal swing
  for (const d of r.dayTypes) expect(d.protein_g).toBe(r.macros.protein_g);
  // Σ dayType.kcal * count == 7 * primary kcal (within day-type rounding)
  const counts = { high: 3, med: 1, low: 3 } as const;
  const weekly = r.dayTypes.reduce((s, d) => s + d.kcal * counts[d.name as keyof typeof counts], 0);
  expect(Math.abs(weekly - 7 * r.kcal)).toBeLessThanOrEqual(7);
});

// ── Intermittent fasting window ───────────────────────────────────────────────
test("IF 16:8 — emits an 8h eating window from the configured start", () => {
  const r = calculateTargets(male80, {
    protocol: { type: "if_16_8", config: { eatingHours: 8, windowStart: "12:00" } },
  });
  expect(r.fastWindow).toEqual({ start: "12:00", end: "20:00", eatingHours: 8 });
});

test("IF — a sub-8h window is widened to the minimum unless explicitly overridden", () => {
  const narrow = calculateTargets(male80, {
    protocol: { type: "if_16_8", config: { eatingHours: 6, windowStart: "13:00" } },
  });
  expect(narrow.fastWindow?.eatingHours).toBe(8);
  expect(narrow.flags).toContain("if_window_widened");

  const allowed = calculateTargets(
    male80,
    { protocol: { type: "if_16_8", config: { eatingHours: 6, windowStart: "13:00" } } },
    { allowShortEatingWindow: true },
  );
  expect(allowed.fastWindow?.eatingHours).toBe(6);
  expect(allowed.flags).not.toContain("if_window_widened");
});

// ── Absurd-input guards ───────────────────────────────────────────────────────
test("under-16 client is rejected to the trainer, not planned", () => {
  const r = calculateTargets({ ...male80, age: 15 });
  expect(r.status).toBe("rejected");
  expect(r.rejectReason).toBe("age_below_minimum");
});

test("a goal rate beyond the ceiling is clamped and flagged", () => {
  const r = calculateTargets(male80, {}, { ratePctPerWeek: 1.5 }); // ceiling for a cut is 0.75
  expect(r.flags).toContain("rate_clamped");
  // clamped deficit = 0.0075*80*7700/7 = 660 -> 3115 - 660 = 2455
  expect(r.kcal).toBeCloseTo(3115 - 660, 0);
  expect(MAX_CUT_RATE_PCT_PER_WEEK).toBe(0.75);
});

test("an explicit kcal override bypasses TDEE and macros are built on it", () => {
  const r = calculateTargets(male80, {}, { kcal: 2000 });
  expect(r.kcal).toBe(2000);
  expect(Math.abs(macroKcal(r.macros) - 2000)).toBeLessThanOrEqual(5);
});

// ── compileConstraints ────────────────────────────────────────────────────────
test("constraints — allergens, diet pattern, and notes pass through from intake", () => {
  const c = compileConstraints({
    ...male80,
    diet: "vegan",
    dietaryPattern: "no soy",
    mealsPerDay: 4,
    mealTimes: ["08:00", "12:00", "16:00", "20:00"],
    cooksAtHome: true,
    allergens: ["peanuts", "shellfish"],
  });
  expect(c.allergens).toEqual(["peanuts", "shellfish"]);
  expect(c.dietPattern).toBe("vegan");
  expect(c.dietaryNotes).toBe("no soy");
  expect(c.mealsPerDay).toBe(4);
  expect(c.cooksAtHome).toBe(true);
});

test("constraints — meals per day falls back to meal-time count, then to 3", () => {
  const fromTimes = compileConstraints({ ...male80, mealTimes: ["08:00", "13:00", "19:00", "22:00"] });
  expect(fromTimes.mealsPerDay).toBe(4);
  const fallback = compileConstraints(male80);
  expect(fallback.mealsPerDay).toBe(3);
});

test("constraints — cuisine weights and dislikes come from the trainer style", () => {
  const c = compileConstraints(male80, { cuisineBias: ["indian", "mediterranean"], bannedFoods: ["liver"] });
  expect(Object.keys(c.cuisineWeights)).toEqual(["indian", "mediterranean"]);
  expect(c.dislikes).toEqual(["liver"]);
});

// ── parseIntake (raw Json -> typed input) ─────────────────────────────────────
test("parseIntake — reads stage A, stage B nutrition, and health-flag allergens", () => {
  const res = parseIntake(
    {
      age: 30,
      sex: "male",
      heightCm: 180,
      weightKg: 80,
      goal: "lose_fat",
      activity: "moderate",
      trainingDaysPerWeek: 4,
      diet: "non_veg",
      stage_b: {
        nutrition: { mealsPerDay: 4, mealTimes: ["08:00"], dietaryPattern: "high protein", cooksAtHome: true },
      },
    },
    { allergies: ["peanuts"] },
  );
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.intake.age).toBe(30);
  expect(res.intake.mealsPerDay).toBe(4);
  expect(res.intake.dietaryPattern).toBe("high protein");
  expect(res.intake.allergens).toEqual(["peanuts"]);
});

test("parseIntake — missing biometrics surface as issues, not a throw", () => {
  const res = parseIntake({ age: 30, sex: "male", heightCm: 180, goal: "lose_fat", activity: "moderate", trainingDaysPerWeek: 4 });
  expect(res.ok).toBe(false);
  if (res.ok) return;
  expect(res.issues.length).toBeGreaterThan(0);
});
