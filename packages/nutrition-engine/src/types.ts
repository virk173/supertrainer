// @supertrainer/nutrition-engine — shared contracts + evidence-based constants
// (Phase 4.1). Every number a diet plan is built on is computed here, in code —
// the LLM never does arithmetic (CLAUDE.md rule 4). The pipeline (P4.2) feeds
// the outputs of this package to the meal-structure/recipe agents; the validator
// recomputes against these same numbers.

import { z } from "zod";

// ── Intake enums (mirror apps/web/lib/onboarding/stage-a.ts + interview.ts) ────
export const SEXES = ["male", "female", "other", "prefer_not"] as const;
export type Sex = (typeof SEXES)[number];

export const GOALS = [
  "lose_fat",
  "build_muscle",
  "recomp",
  "strength",
  "endurance",
  "general_health",
] as const;
export type Goal = (typeof GOALS)[number];

export const ACTIVITY_LEVELS = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const DIET_PATTERNS = ["veg", "non_veg", "vegan"] as const;
export type DietPattern = (typeof DIET_PATTERNS)[number];

// ── Evidence-based constants (the "research" the spec's §④ design note folds
// into code — reviewed once, here, not asked of an LLM). Sources: Mifflin-St
// Jeor (1990); standard Harris-Benedict activity factors; 1.6 g/kg protein for
// active/dieting individuals (Morton 2018 meta-analysis) with a 1.2 g/kg RDA-ish
// safety floor; ~7700 kcal per kg of body mass. ────────────────────────────────

export const KCAL_PER_G = { protein: 4, carb: 4, fat: 9 } as const;
// Energy in ~1 kg of body-mass change; the bridge from a %-BW/week goal rate to a
// daily kcal delta.
export const KCAL_PER_KG_BODY_MASS = 7700;

// Base NEAT/lifestyle multiplier from the self-reported activity level. Training
// frequency adds to this (activityFactor()), so job type + training days compose,
// bounded to [1.2, 1.9] per the pipeline map.
export const ACTIVITY_BASE: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};
export const TRAINING_DAY_FACTOR_STEP = 0.05; // added per training day/week
export const ACTIVITY_FACTOR_MIN = 1.2;
export const ACTIVITY_FACTOR_MAX = 1.9;

// Protein targets are g/kg of body-weight. The style profile may RAISE the
// target (a coach who programs 2.0 g/kg) but the engine never lets it fall below
// the safety floor.
export const DEFAULT_PROTEIN_PER_KG = 1.6;
export const SAFETY_PROTEIN_FLOOR_PER_KG = 1.2;
// Dietary-fat floor for hormonal health, g/kg. Carbs fill the remaining energy.
export const DEFAULT_FAT_PER_KG = 0.8;
export const SAFETY_FAT_FLOOR_PER_KG = 0.5;

// Goal-rate ceilings, % of body-weight per week (pipeline map §④). Cuts may run
// faster than bulks because lean-mass gain is intrinsically slow.
export const MAX_CUT_RATE_PCT_PER_WEEK = 0.75;
export const MAX_BULK_RATE_PCT_PER_WEEK = 0.5;
// Defaults sit safely inside the ceilings; a trainer override can push to the max.
export const DEFAULT_CUT_RATE_PCT_PER_WEEK = 0.5;
export const DEFAULT_BULK_RATE_PCT_PER_WEEK = 0.3;

// Absolute daily-kcal floors — a plan is never generated below these; the target
// is clamped up and flagged for the trainer. The 1200-kcal small-female cut is
// the spec's hardest case, so that is the floor, not a rejection.
export const KCAL_FLOOR: Record<Sex, number> = {
  male: 1500,
  female: 1200,
  other: 1350,
  prefer_not: 1350,
};

// Clients under this age are never auto-planned — kicked back to the trainer.
export const MIN_PLANNABLE_AGE = 16;

// Intermittent-fasting eating window: never narrower than this unless the trainer
// explicitly overrides (e.g. OMAD).
export const MIN_IF_EATING_HOURS = 8;

// ── Protocol (mirrors the plans.protocol jsonb column {type, config}) ──────────
export type PlanProtocol =
  | { type: "standard" }
  | { type: "if_16_8"; config: { eatingHours: number; windowStart: string } }
  // day-type counts across a 7-day week; high/med/low must sum to 7.
  | { type: "carb_cycle"; config: { high: number; med: number; low: number } };

// ── Engine input: the parsed, typed subset of clients.intake + health_flags the
// math needs. parseIntake() maps the raw untyped Json into this. ───────────────
export interface IntakeInput {
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  activity: ActivityLevel;
  trainingDaysPerWeek: number;
  diet?: DietPattern;
  // Stage B (nutrition section) — optional; pre-interview clients lack these.
  mealsPerDay?: number;
  mealTimes?: string[];
  dietaryPattern?: string; // free-text note, e.g. "high-protein, no red meat"
  cooksAtHome?: boolean;
  // Allergens live on clients.health_flags.allergies, not intake; folded in here.
  allergens?: string[];
}

export const IntakeInputSchema = z.object({
  age: z.number().int(),
  sex: z.enum(SEXES),
  heightCm: z.number().positive(),
  weightKg: z.number().positive(),
  goal: z.enum(GOALS),
  activity: z.enum(ACTIVITY_LEVELS),
  trainingDaysPerWeek: z.number().int().min(0).max(7),
  diet: z.enum(DIET_PATTERNS).optional(),
  mealsPerDay: z.number().int().min(1).max(12).optional(),
  mealTimes: z.array(z.string()).optional(),
  dietaryPattern: z.string().optional(),
  cooksAtHome: z.boolean().optional(),
  allergens: z.array(z.string()).optional(),
});

// ── Style knobs that neither intake nor the trainer DietProfile carries as
// numbers. calculateTargets() takes these; a caller derives protocol from
// DietProfile.protocols and may raise proteinPerKg. All optional → DEFAULTS. ────
export interface StyleDefaults {
  proteinPerKg?: number;
  fatPerKg?: number;
  cutRatePctPerWeek?: number;
  bulkRatePctPerWeek?: number;
  protocol?: PlanProtocol;
  // Fraction of daily kcal shifted between high/low carb-cycle days (0–1).
  carbCycleShift?: number;
}

export const DEFAULT_STYLE_DEFAULTS: Required<Omit<StyleDefaults, "protocol">> & {
  protocol: PlanProtocol;
} = {
  proteinPerKg: DEFAULT_PROTEIN_PER_KG,
  fatPerKg: DEFAULT_FAT_PER_KG,
  cutRatePctPerWeek: DEFAULT_CUT_RATE_PCT_PER_WEEK,
  bulkRatePctPerWeek: DEFAULT_BULK_RATE_PCT_PER_WEEK,
  protocol: { type: "standard" },
  carbCycleShift: 0.2,
};

// Per-call overrides a trainer sets on a specific draft.
export interface TargetOverride {
  activityFactor?: number; // replaces the computed job+training factor
  ratePctPerWeek?: number; // replaces the default cut/bulk rate (clamped to max)
  kcal?: number; // hard-set maintenance/primary kcal, bypassing TDEE
  allowShortEatingWindow?: boolean; // permit an IF window < MIN_IF_EATING_HOURS
}

export interface Macros {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface DayTypeTarget extends Macros {
  name: string; // "standard" | "high" | "med" | "low"
  kcal: number;
}

export type TargetFlag =
  | "sex_estimated" // Mifflin constant averaged for other/prefer_not
  | "kcal_floored" // clamped up to the absolute floor
  | "rate_clamped" // goal rate exceeded the ceiling
  | "protein_floored" // style tried to go below the safety floor
  | "if_window_widened"; // eating window widened up to the minimum

export interface TargetResult {
  status: "ok" | "rejected";
  rejectReason?: "age_below_minimum";
  flags: TargetFlag[];
  bmr: number;
  activityFactor: number;
  tdee: number;
  // The primary/maintenance-anchored daily target (an average day when cycling).
  kcal: number;
  macros: Macros;
  dayTypes: DayTypeTarget[];
  protocol: PlanProtocol;
  fastWindow?: { start: string; end: string; eatingHours: number };
}

// ── Constraint compiler output (the non-allergen-filter half of pipeline step 0;
// the allergen-safe food POOL is built in P4.2 with the canonical
// packages/ai filterSafeFoods over these raw allergens — this package stays
// zero-AI-import). ─────────────────────────────────────────────────────────────
export interface Constraints {
  allergens: string[]; // raw, fed verbatim to filterSafeFoods in P4.2
  dietPattern: DietPattern | null;
  dietaryNotes: string | null;
  mealsPerDay: number;
  mealTimes: string[];
  cooksAtHome: boolean | null;
  cuisineWeights: Record<string, number>;
  dislikes: string[];
}

export interface StyleConstraintInput {
  cuisineBias?: string[];
  bannedFoods?: string[];
}
