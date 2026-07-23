import type { SupabaseClient } from "@supabase/supabase-js";

import type { ParsedMealItem } from "@supertrainer/ai";
import { resolveGrams, searchFoods, type FoodSearchResult } from "@supertrainer/db/queries";

import { macrosFor, sumMacros, type ComputedMacros } from "@/lib/preview/macros";

// Phase 3.2 — resolve parsed meal items ({name, qty, unit}) against the foods DB
// and compute macros IN CODE. The model only parsed the text; every number here
// comes from the foods table's per-100g values (CLAUDE.md rule 4). The result
// drives the confirm card: a best-guess selection per item, top-3 alternatives,
// and a needsPicker flag when the match is weak (show a picker for THAT item,
// never block the whole log).

// Matches at or above this trigram score are trusted without a picker; below it,
// the client confirms which food they meant. Exact/prefix/alias/full-text hits
// are always trusted.
const TRIGRAM_CONFIDENT = 0.42;
const CONFIDENT_MATCHES = new Set(["exact", "prefix_or_alias", "fulltext"]);

export interface FoodOption {
  id: string;
  name: string;
  servingUnits: Record<string, number>;
  allergenTags: string[];
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  matchedVia: string;
  score: number;
}

export interface ResolvedItem {
  query: { name: string; qty: number; unit: string | null };
  // Best-guess resolution (null = no DB match -> unverified freeform item).
  selection: (FoodOption & {
    grams: number;
    portionLabel: string;
    macros: ComputedMacros;
  }) | null;
  // Top alternatives for the per-item picker.
  options: FoodOption[];
  // Weak match -> UI opens the picker for this item; the log is never blocked.
  needsPicker: boolean;
  // No DB match -> "log anyway" as an unverified item (kcal unknown).
  unverified: boolean;
}

function toOption(r: FoodSearchResult): FoodOption {
  return {
    id: r.id,
    name: r.name,
    servingUnits: (r.serving_units as Record<string, number>) ?? {},
    allergenTags: r.allergen_tags ?? [],
    kcalPer100g: Number(r.kcal_per_100g),
    proteinPer100g: Number(r.protein_per_100g),
    carbsPer100g: Number(r.carbs_per_100g),
    fatPer100g: Number(r.fat_per_100g),
    fiberPer100g: Number(r.fiber_per_100g),
    matchedVia: r.matched_via,
    score: Number(r.score),
  };
}

function foodMacros(o: FoodOption) {
  return {
    kcal_per_100g: o.kcalPer100g,
    protein_per_100g: o.proteinPer100g,
    carbs_per_100g: o.carbsPer100g,
    fat_per_100g: o.fatPer100g,
    fiber_per_100g: o.fiberPer100g,
  };
}

// Grams for a chosen food + qty/unit, with a safe fallback when the unit can't
// be resolved (e.g. "dal" with two serving units, or an unfamiliar unit): use
// the food's first serving unit, else 100 g, and flag the item for a picker.
export function gramsForSelection(
  option: FoodOption,
  qty: number,
  unit: string | null,
): { grams: number; label: string; resolved: boolean } {
  const portion = resolveGrams(
    { name_normalized: option.name.toLowerCase(), serving_units: option.servingUnits },
    qty,
    unit,
  );
  if (portion) return { grams: portion.grams, label: `${qty} ${portion.unit}`, resolved: true };
  const units = Object.keys(option.servingUnits);
  if (units.length > 0) {
    return { grams: qty * option.servingUnits[units[0]], label: `${qty} ${units[0]}`, resolved: false };
  }
  return { grams: qty * 100, label: `${qty * 100} g`, resolved: false };
}

export interface ResolveOptions {
  locale?: string;
  orgId?: string;
}

// Resolve every parsed item concurrently.
export async function resolveMealItems(
  client: SupabaseClient,
  items: ParsedMealItem[],
  opts: ResolveOptions = {},
): Promise<ResolvedItem[]> {
  return Promise.all(
    items.map(async (it): Promise<ResolvedItem> => {
      const query = { name: it.name, qty: it.qty, unit: it.unit ?? null };
      const hits = await searchFoods(client, it.name, {
        locale: opts.locale,
        orgId: opts.orgId,
        limit: 3,
      });
      if (hits.length === 0) {
        return { query, selection: null, options: [], needsPicker: false, unverified: true };
      }
      const options = hits.map(toOption);
      const best = options[0];
      const confident = CONFIDENT_MATCHES.has(best.matchedVia) || best.score >= TRIGRAM_CONFIDENT;
      const { grams, label, resolved } = gramsForSelection(best, it.qty, it.unit ?? null);
      return {
        query,
        selection: {
          ...best,
          grams,
          portionLabel: label,
          macros: macrosFor(foodMacros(best), grams),
        },
        options,
        needsPicker: !confident || !resolved,
        unverified: false,
      };
    }),
  );
}

// ── Authoritative confirm-time recompute (shared by the log action + tests) ──
// A confirmed item as the client posts it back: a food id (or null for an
// unverified freeform item) + the chosen grams. The client's own numbers are
// never trusted — macros are recomputed here from the foods table.
export interface ConfirmedItemInput {
  foodId: string | null;
  name: string;
  qty: number;
  unit: string | null;
  grams: number;
}

export interface StoredMealItem {
  food_id: string | null;
  name: string;
  qty: number;
  unit: string | null;
  grams: number;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  verified: boolean;
}

// Recompute every confirmed item's macros from the foods table. Verified items
// (a resolvable, org-visible food id) get DB-computed numbers; unverified
// freeform items store nulls and are flagged in the trainer lens. A food id the
// caller isn't allowed to use (another org's custom) is treated as unverified.
export async function computeConfirmedItems(
  client: SupabaseClient,
  orgId: string,
  items: ConfirmedItemInput[],
): Promise<{ items: StoredMealItem[]; totals: ComputedMacros }> {
  const ids = [...new Set(items.map((i) => i.foodId).filter((x): x is string => !!x))];
  const foodMap = new Map<string, {
    name: string;
    kcal_per_100g: number;
    protein_per_100g: number;
    carbs_per_100g: number;
    fat_per_100g: number;
    fiber_per_100g: number;
  }>();
  if (ids.length > 0) {
    const { data: foods, error } = await client
      .from("foods")
      .select("id, name, org_id, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g")
      .in("id", ids);
    if (error) throw error;
    const rows = (foods ?? []) as Array<{
      id: string;
      name: string;
      org_id: string | null;
      kcal_per_100g: number;
      protein_per_100g: number;
      carbs_per_100g: number;
      fat_per_100g: number;
      fiber_per_100g: number;
    }>;
    for (const f of rows) {
      if (f.org_id !== null && f.org_id !== orgId) continue;
      foodMap.set(f.id, f);
    }
  }

  const stored: StoredMealItem[] = items.map((i) => {
    const food = i.foodId ? foodMap.get(i.foodId) : undefined;
    if (food) {
      const m = macrosFor(food, i.grams);
      return { food_id: i.foodId, name: food.name, qty: i.qty, unit: i.unit, grams: i.grams,
        kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber, verified: true };
    }
    return { food_id: null, name: i.name, qty: i.qty, unit: i.unit, grams: i.grams,
      kcal: null, protein: null, carbs: null, fat: null, fiber: null, verified: false };
  });

  const totals = sumMacros(
    stored.filter((i) => i.verified).map((i) => ({
      food: {
        kcal_per_100g: (i.kcal! * 100) / i.grams,
        protein_per_100g: (i.protein! * 100) / i.grams,
        carbs_per_100g: (i.carbs! * 100) / i.grams,
        fat_per_100g: (i.fat! * 100) / i.grams,
        fiber_per_100g: (i.fiber! * 100) / i.grams,
      },
      grams: i.grams,
    })),
  );
  return { items: stored, totals };
}

// Display total for the confirm card — sums the per-item macros of verified
// selections (unverified freeform items contribute no numbers, flagged in the
// trainer lens). The AUTHORITATIVE stored total is recomputed from DB per-100g
// values in the confirm action (computeLogTotals), never trusting the client.
export function mealTotals(
  items: Array<{ selection: { macros: ComputedMacros } | null }>,
): ComputedMacros {
  return items.reduce<ComputedMacros>(
    (acc, i) =>
      i.selection
        ? {
            kcal: acc.kcal + i.selection.macros.kcal,
            protein: acc.protein + i.selection.macros.protein,
            carbs: acc.carbs + i.selection.macros.carbs,
            fat: acc.fat + i.selection.macros.fat,
            fiber: acc.fiber + i.selection.macros.fiber,
          }
        : acc,
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}
