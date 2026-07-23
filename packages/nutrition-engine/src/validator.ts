// Coded plan validator + deterministic filler (Phase 4.2). The validator
// recomputes every macro from the food rows by food_id — it never trusts the
// model's numbers (CLAUDE.md rule 4) — and enforces the pipeline-map §④
// assertions: |target−actual| within tolerance, every id in the safe pool, zero
// excluded allergen tags. On failure it emits structured feedback the recipe
// agent retries against. assembleMeals is a deterministic, target-hitting filler
// (the CI orchestrator's stand-in recipe, and a safety fallback).

import { KCAL_PER_G, type DayTypeTarget } from "./types";

export const KCAL_TOLERANCE_PCT = 3;
export const PROTEIN_TOLERANCE_G = 5;

export interface FoodMacroRow {
  id: string;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g?: number;
  allergen_tags: string[];
}

export interface PlannedItem {
  food_id: string;
  grams: number;
}
export interface PlannedMeal {
  slot: string;
  items: PlannedItem[];
  prepNote?: string;
}
export interface PlannedDayType {
  name: string;
  meals: PlannedMeal[];
}
export interface PlanVersionInput {
  label: string;
  dayTypes: PlannedDayType[];
}

export interface ComputedMacros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface DayTypeValidation {
  dayType: string;
  target: { kcal: number; protein_g: number };
  actual: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  kcalDeltaPct: number;
  proteinDeltaG: number;
  unknownFoodIds: string[];
  allergenHits: { food_id: string; tags: string[] }[];
  ok: boolean;
}

export interface ValidationResult {
  ok: boolean;
  dayTypes: DayTypeValidation[];
  feedback: string;
}

const scale = (per100: number, grams: number) => (Number(per100) * grams) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

// Macros for one food at a gram weight, rounded — for per-item display.
export function macrosForGrams(food: FoodMacroRow, grams: number): ComputedMacros {
  return {
    kcal: Math.round(scale(food.kcal_per_100g, grams)),
    protein: Math.round(scale(food.protein_per_100g, grams)),
    carbs: Math.round(scale(food.carbs_per_100g, grams)),
    fat: Math.round(scale(food.fat_per_100g, grams)),
    fiber: Math.round(scale(food.fiber_per_100g ?? 0, grams)),
  };
}

export function validatePlanVersion(
  version: PlanVersionInput,
  targets: DayTypeTarget[],
  pool: Map<string, FoodMacroRow>,
  excludedAllergenTags: string[],
): ValidationResult {
  const excluded = new Set(excludedAllergenTags);
  const targetByName = new Map(targets.map((t) => [t.name, t]));
  const dayTypes: DayTypeValidation[] = [];
  const failLines: string[] = [];

  for (const dt of version.dayTypes) {
    const target = targetByName.get(dt.name);
    // Sum UNROUNDED, round once — matches the preview macro convention.
    let kcal = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    const unknownFoodIds: string[] = [];
    const allergenHits: { food_id: string; tags: string[] }[] = [];

    for (const meal of dt.meals) {
      for (const it of meal.items) {
        const food = pool.get(it.food_id);
        if (!food) {
          unknownFoodIds.push(it.food_id);
          continue;
        }
        const hits = food.allergen_tags.filter((t) => excluded.has(t));
        if (hits.length) allergenHits.push({ food_id: it.food_id, tags: hits });
        kcal += scale(food.kcal_per_100g, it.grams);
        protein += scale(food.protein_per_100g, it.grams);
        carbs += scale(food.carbs_per_100g, it.grams);
        fat += scale(food.fat_per_100g, it.grams);
      }
    }

    const actual = {
      kcal: Math.round(kcal),
      protein_g: Math.round(protein),
      carbs_g: Math.round(carbs),
      fat_g: Math.round(fat),
    };
    const tKcal = target?.kcal ?? 0;
    const tProtein = target?.protein_g ?? 0;
    const kcalDeltaPct = tKcal > 0 ? (Math.abs(actual.kcal - tKcal) / tKcal) * 100 : 100;
    const proteinDeltaG = Math.abs(actual.protein_g - tProtein);
    const withinTolerance =
      !!target && kcalDeltaPct <= KCAL_TOLERANCE_PCT && proteinDeltaG <= PROTEIN_TOLERANCE_G;
    const ok = withinTolerance && unknownFoodIds.length === 0 && allergenHits.length === 0;

    dayTypes.push({
      dayType: dt.name,
      target: { kcal: tKcal, protein_g: tProtein },
      actual,
      kcalDeltaPct: round1(kcalDeltaPct),
      proteinDeltaG,
      unknownFoodIds,
      allergenHits,
      ok,
    });

    if (!ok) {
      const parts: string[] = [];
      if (!target) parts.push(`no target for this day type`);
      if (unknownFoodIds.length) parts.push(`unknown food ids ${unknownFoodIds.join(", ")}`);
      if (allergenHits.length) parts.push(`allergen foods ${allergenHits.map((h) => h.food_id).join(", ")}`);
      if (target && kcalDeltaPct > KCAL_TOLERANCE_PCT) parts.push(`kcal ${actual.kcal} vs target ${tKcal}`);
      if (target && proteinDeltaG > PROTEIN_TOLERANCE_G)
        parts.push(`protein ${actual.protein_g}g vs target ${tProtein}g`);
      failLines.push(`day type "${dt.name}": ${parts.join("; ")} — replace or resize items`);
    }
  }

  return { ok: dayTypes.every((d) => d.ok), dayTypes, feedback: failLines.join("\n") };
}

// Deterministic, target-hitting filler: a protein-dense anchor sized to the
// protein target, then the pool's lowest-protein-per-kcal food to fill the
// remaining energy (so kcal lands on target without disturbing protein). Only
// kcal + protein are toleranced by the validator (§④), so this always validates
// for a pool with a protein source and an energy-dense low-protein filler.
export function assembleMeals(
  pool: FoodMacroRow[],
  target: { kcal: number; protein_g: number },
  slots: string[],
): PlannedMeal[] {
  if (pool.length === 0 || slots.length === 0) return [];
  const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const proteinFood = sorted.reduce(
    (best, f) => (f.protein_per_100g > best.protein_per_100g ? f : best),
    sorted[0],
  );
  const gramsP =
    proteinFood.protein_per_100g > 0
      ? Math.max(1, Math.round((target.protein_g * 100) / proteinFood.protein_per_100g))
      : 0;
  const kcalP = scale(proteinFood.kcal_per_100g, gramsP);
  const remainingKcal = target.kcal - kcalP;

  const others = sorted.filter((f) => f.kcal_per_100g > 0 && f.id !== proteinFood.id);
  const fillerPool = others.length ? others : sorted.filter((f) => f.kcal_per_100g > 0);
  // Lowest protein-per-kcal (so filling energy barely moves protein), tie-broken
  // toward the most energy-dense food — otherwise a zero-protein but low-calorie
  // food (black coffee, a diet drink) would need thousands of grams and get
  // truncated by the caller's gram clamp, landing far under the kcal target.
  const fillerFood = fillerPool.length
    ? fillerPool.reduce((best, f) => {
        const rf = f.protein_per_100g / f.kcal_per_100g;
        const rb = best.protein_per_100g / best.kcal_per_100g;
        if (rf < rb) return f;
        if (rf === rb && f.kcal_per_100g > best.kcal_per_100g) return f;
        return best;
      }, fillerPool[0])
    : undefined;
  const gramsF =
    remainingKcal > 0 && fillerFood
      ? Math.max(1, Math.round((remainingKcal * 100) / fillerFood.kcal_per_100g))
      : 0;

  const placed: { food: FoodMacroRow; grams: number }[] = [];
  if (gramsP > 0) placed.push({ food: proteinFood, grams: gramsP });
  if (gramsF > 0 && fillerFood) placed.push({ food: fillerFood, grams: gramsF });

  const meals: PlannedMeal[] = [];
  placed.forEach((p, i) => {
    const slot = slots[Math.min(i, slots.length - 1)];
    const meal = meals.find((m) => m.slot === slot);
    if (meal) meal.items.push({ food_id: p.food.id, grams: p.grams });
    else meals.push({ slot, items: [{ food_id: p.food.id, grams: p.grams }] });
  });
  return meals;
}

// Code nails the PORTIONS on the model's FOOD choices (the division of labor
// behind rule 4: the LLM selects foods, code computes the grams). Two steps:
// (1) scale every item's grams proportionally to land total kcal on target;
// (2) perturb a protein anchor + an energy filler in a kcal-neutral way to pull
// protein onto target. Spreading the kcal fix across all items keeps grams in
// range far better than loading it all onto two of them. Never invents foods and
// never exceeds [1, 1000]g; if the model's foods still can't hit protein, the
// validator rejects it (→ retry).
export function fitPortions(
  meals: PlannedMeal[],
  target: { kcal: number; protein_g: number },
  pool: Map<string, FoodMacroRow>,
): PlannedMeal[] {
  const flat: { meal: number; item: number; food: FoodMacroRow }[] = [];
  meals.forEach((m, mi) =>
    m.items.forEach((it, ii) => {
      const food = pool.get(it.food_id);
      if (food) flat.push({ meal: mi, item: ii, food });
    }),
  );
  if (flat.length === 0) return meals;

  const gramOf = (src: PlannedMeal[], x: (typeof flat)[number]) => src[x.meal].items[x.item].grams;
  const clampG = (g: number) => Math.max(1, Math.min(1000, Math.round(g)));

  let curKcal = 0;
  for (const x of flat) curKcal += scale(x.food.kcal_per_100g, gramOf(meals, x));
  if (curKcal <= 0) return meals;

  // Step 1 — proportional scale to the kcal target.
  const out = meals.map((m) => ({ ...m, items: m.items.map((it) => ({ ...it })) }));
  const k = target.kcal / curKcal;
  for (const x of flat) out[x.meal].items[x.item].grams = clampG(gramOf(meals, x) * k);

  if (flat.length < 2) return out;

  // Step 2 — kcal-neutral protein correction on anchor (max protein density) +
  // filler (lowest protein-per-kcal).
  let scaledProtein = 0;
  for (const x of flat) scaledProtein += scale(x.food.protein_per_100g, gramOf(out, x));

  const anchor = flat.reduce((b, x) => (x.food.protein_per_100g > b.food.protein_per_100g ? x : b), flat[0]);
  const rest = flat.filter((x) => x !== anchor);
  const filler = rest.reduce((b, x) => {
    const rx = x.food.protein_per_100g / x.food.kcal_per_100g;
    const rb = b.food.protein_per_100g / b.food.kcal_per_100g;
    if (rx < rb) return x;
    if (rx === rb && x.food.kcal_per_100g > b.food.kcal_per_100g) return x;
    return b;
  }, rest[0]);
  if (anchor === filler) return out;

  const ap = anchor.food.protein_per_100g / 100;
  const ak = anchor.food.kcal_per_100g / 100;
  const fp = filler.food.protein_per_100g / 100;
  const fk = filler.food.kcal_per_100g / 100;
  if (fk <= 0) return out;
  const denom = ap - (fp * ak) / fk; // Δprotein per +1g anchor, holding kcal fixed
  if (Math.abs(denom) < 1e-6) return out;

  const dAnchor = (target.protein_g - scaledProtein) / denom;
  const dFiller = -(ak / fk) * dAnchor; // keeps total kcal unchanged
  const ga = gramOf(out, anchor) + dAnchor;
  const gf = gramOf(out, filler) + dFiller;
  if (ga >= 1 && ga <= 1000 && gf >= 1 && gf <= 1000) {
    out[anchor.meal].items[anchor.item].grams = Math.round(ga);
    out[filler.meal].items[filler.item].grams = Math.round(gf);
  }
  return out;
}
