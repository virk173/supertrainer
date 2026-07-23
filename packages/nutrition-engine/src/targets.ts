// The calculation engine (Phase 4.1). Turns a parsed intake + style defaults +
// per-draft overrides into kcal + macro targets, per-day-type targets when carb
// cycling, and an IF eating window. All arithmetic is here — no LLM (rule 4).

import { tdee } from "./tdee";
import {
  DEFAULT_STYLE_DEFAULTS,
  KCAL_FLOOR,
  KCAL_PER_G,
  KCAL_PER_KG_BODY_MASS,
  MAX_BULK_RATE_PCT_PER_WEEK,
  MAX_CUT_RATE_PCT_PER_WEEK,
  MIN_IF_EATING_HOURS,
  MIN_PLANNABLE_AGE,
  SAFETY_FAT_FLOOR_PER_KG,
  SAFETY_PROTEIN_FLOOR_PER_KG,
  type DayTypeTarget,
  type Goal,
  type IntakeInput,
  type Macros,
  type PlanProtocol,
  type StyleDefaults,
  type TargetFlag,
  type TargetOverride,
  type TargetResult,
} from "./types";

type Direction = "cut" | "bulk" | "maintain";

function goalDirection(goal: Goal): Direction {
  if (goal === "lose_fat") return "cut";
  if (goal === "build_muscle") return "bulk";
  return "maintain"; // recomp / strength / endurance / general_health hold at TDEE
}

// Split a kcal budget into macros: protein from g/kg, a fat floor for hormones,
// carbs absorbing the remainder. When the budget is too tight for both protein
// and the fat target, fat is trimmed toward its safety floor before carbs hit 0.
function macrosForKcal(kcal: number, weightKg: number, proteinPerKg: number, fatPerKg: number): Macros {
  const protein_g = Math.round(proteinPerKg * weightKg);
  const proteinKcal = protein_g * KCAL_PER_G.protein;
  const minFat = Math.round(SAFETY_FAT_FLOOR_PER_KG * weightKg);
  let fat_g = Math.round(fatPerKg * weightKg);
  if (proteinKcal + fat_g * KCAL_PER_G.fat > kcal) {
    fat_g = Math.max(minFat, Math.floor((kcal - proteinKcal) / KCAL_PER_G.fat));
  }
  const carbs_g = Math.max(0, Math.round((kcal - proteinKcal - fat_g * KCAL_PER_G.fat) / KCAL_PER_G.carb));
  return { protein_g, carbs_g, fat_g };
}

// Re-split one day type's kcal while holding protein & fat; carbs take the swing.
function dayTypeFrom(name: string, dayKcal: number, base: Macros): DayTypeTarget {
  const carbs_g = Math.max(
    0,
    Math.round((dayKcal - base.protein_g * KCAL_PER_G.protein - base.fat_g * KCAL_PER_G.fat) / KCAL_PER_G.carb),
  );
  return { name, kcal: dayKcal, protein_g: base.protein_g, carbs_g, fat_g: base.fat_g };
}

// Carb cycling: shift a fraction of daily kcal onto high days and balance the
// removal across low days so Σ(dayType.kcal × count) stays 7 × the primary kcal.
function buildDayTypes(
  protocol: PlanProtocol,
  kcal: number,
  macros: Macros,
  carbCycleShift: number,
): DayTypeTarget[] {
  const standard: DayTypeTarget = { name: "standard", kcal, ...macros };
  if (protocol.type !== "carb_cycle") return [standard];

  const { high, med, low } = protocol.config;
  const valid = high >= 0 && med >= 0 && low >= 0 && high + med + low === 7 && high + low > 0;
  if (!valid) return [standard]; // malformed config → don't cycle

  const highDelta = Math.round(carbCycleShift * kcal);
  const lowDelta = low > 0 ? Math.round((high * highDelta) / low) : 0;

  const out: DayTypeTarget[] = [];
  if (high > 0) out.push(dayTypeFrom("high", kcal + highDelta, macros));
  if (med > 0) out.push(dayTypeFrom("med", kcal, macros));
  if (low > 0) out.push(dayTypeFrom("low", kcal - lowDelta, macros));
  return out;
}

function addHours(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = String(((h + hours) % 24 + 24) % 24).padStart(2, "0");
  return `${hh}:${String(m).padStart(2, "0")}`;
}

function rejected(reason: NonNullable<TargetResult["rejectReason"]>): TargetResult {
  return {
    status: "rejected",
    rejectReason: reason,
    flags: [],
    bmr: 0,
    activityFactor: 0,
    tdee: 0,
    kcal: 0,
    macros: { protein_g: 0, carbs_g: 0, fat_g: 0 },
    dayTypes: [],
    protocol: { type: "standard" },
  };
}

export function calculateTargets(
  intake: IntakeInput,
  style: StyleDefaults = {},
  override: TargetOverride = {},
): TargetResult {
  // Absurd-input guard: too young to auto-plan → kick back to the trainer.
  if (intake.age < MIN_PLANNABLE_AGE) return rejected("age_below_minimum");

  const flags: TargetFlag[] = [];
  const defaults = DEFAULT_STYLE_DEFAULTS;

  // Protein target (g/kg): style may raise it, never below the safety floor.
  let proteinPerKg = style.proteinPerKg ?? defaults.proteinPerKg;
  if (proteinPerKg < SAFETY_PROTEIN_FLOOR_PER_KG) {
    proteinPerKg = SAFETY_PROTEIN_FLOOR_PER_KG;
    flags.push("protein_floored");
  }
  const fatPerKg = style.fatPerKg ?? defaults.fatPerKg;
  const protocol = style.protocol ?? defaults.protocol;

  const energy = tdee(intake, override.activityFactor);
  if (energy.sexEstimated) flags.push("sex_estimated");

  // Primary daily kcal.
  let kcal: number;
  if (override.kcal != null) {
    kcal = Math.round(override.kcal);
  } else {
    const dir = goalDirection(intake.goal);
    if (dir === "maintain") {
      kcal = energy.tdee;
    } else {
      const ceiling = dir === "cut" ? MAX_CUT_RATE_PCT_PER_WEEK : MAX_BULK_RATE_PCT_PER_WEEK;
      const styleRate = dir === "cut" ? style.cutRatePctPerWeek : style.bulkRatePctPerWeek;
      const defaultRate = dir === "cut" ? defaults.cutRatePctPerWeek : defaults.bulkRatePctPerWeek;
      let rate = override.ratePctPerWeek ?? styleRate ?? defaultRate;
      if (rate > ceiling) {
        rate = ceiling;
        flags.push("rate_clamped");
      }
      const deltaPerDay = Math.round(((rate / 100) * intake.weightKg * KCAL_PER_KG_BODY_MASS) / 7);
      kcal = dir === "cut" ? energy.tdee - deltaPerDay : energy.tdee + deltaPerDay;
    }
  }

  // Absolute floor — clamp up, never generate below it.
  const floor = KCAL_FLOOR[intake.sex];
  if (kcal < floor) {
    kcal = floor;
    flags.push("kcal_floored");
  }

  const macros = macrosForKcal(kcal, intake.weightKg, proteinPerKg, fatPerKg);
  const dayTypes = buildDayTypes(protocol, kcal, macros, style.carbCycleShift ?? defaults.carbCycleShift);

  // IF eating window: widen a too-narrow window to the minimum unless overridden.
  let effectiveProtocol = protocol;
  let fastWindow: TargetResult["fastWindow"];
  if (protocol.type === "if_16_8") {
    let eatingHours = protocol.config.eatingHours;
    if (eatingHours < MIN_IF_EATING_HOURS && !override.allowShortEatingWindow) {
      eatingHours = MIN_IF_EATING_HOURS;
      flags.push("if_window_widened");
    }
    const start = protocol.config.windowStart;
    fastWindow = { start, end: addHours(start, eatingHours), eatingHours };
    effectiveProtocol = { type: "if_16_8", config: { eatingHours, windowStart: start } };
  }

  return {
    status: "ok",
    flags,
    bmr: energy.bmr,
    activityFactor: energy.activityFactor,
    tdee: energy.tdee,
    kcal,
    macros,
    dayTypes,
    protocol: effectiveProtocol,
    ...(fastWindow ? { fastWindow } : {}),
  };
}
