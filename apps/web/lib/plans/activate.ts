// plans_active payload builder (Phase 4.3). On approval a plan's coded targets
// become the one live row per client the ledger (P3) reads: per-day-type macro
// targets, a weekday→day-type schedule, the standard day's meal slots, and any
// fasting window. Pure so it's unit-tested; the action does the upsert/supersede.

import type { DayTypeTarget } from "@supertrainer/nutrition-engine";

import type { PlanContentVersion } from "./edit";

export interface PlansActivePayload {
  day_types: DayTypeTarget[];
  targets: Record<string, { kcal: number; protein_g: number; carbs_g: number; fat_g: number }>;
  meal_slots: string[];
  schedule: Record<string, string>;
  fast_window: { start: string; end: string; eatingHours: number } | null;
  effective_from: string;
}

// Weekday (0=Sun..6=Sat) → day-type name. A single day type maps every day to
// itself; a carb-cycle spreads high/med/low across the week by their counts.
function weekdaySchedule(dayTypes: DayTypeTarget[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (dayTypes.length <= 1) {
    const name = dayTypes[0]?.name ?? "standard";
    for (let d = 0; d < 7; d++) out[String(d)] = name;
    return out;
  }
  // Repeat each day type's name; heavier (higher-kcal) days land midweek.
  const ordered = [...dayTypes].sort((a, b) => b.kcal - a.kcal);
  const sequence: string[] = [];
  // round-robin so day types interleave rather than clump
  const cycle = ordered.map((d) => d.name);
  while (sequence.length < 7 && cycle.length) {
    for (const name of cycle) {
      if (sequence.length < 7) sequence.push(name);
    }
  }
  for (let d = 0; d < 7; d++) out[String(d)] = sequence[d] ?? ordered[0].name;
  return out;
}

export function plansActivePayload(
  dayTypes: DayTypeTarget[],
  approvedVersion: PlanContentVersion,
  fastWindow: { start: string; end: string; eatingHours: number } | null,
  effectiveFrom: string,
): PlansActivePayload {
  const targets = Object.fromEntries(
    dayTypes.map((d) => [d.name, { kcal: d.kcal, protein_g: d.protein_g, carbs_g: d.carbs_g, fat_g: d.fat_g }]),
  );
  // Meal slots for a normal day: the slots of the first day type in the approved
  // version (dedup, order preserved).
  const firstDay = approvedVersion.dayTypes[0];
  const mealSlots = [...new Set((firstDay?.meals ?? []).map((m) => m.slot))];

  return {
    day_types: dayTypes,
    targets,
    meal_slots: mealSlots,
    schedule: weekdaySchedule(dayTypes),
    fast_window: fastWindow,
    effective_from: effectiveFrom,
  };
}
