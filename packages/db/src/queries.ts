// Shared query helpers every phase inherits.

import type { SupabaseClient } from "@supabase/supabase-js";

import { type AllergenTag, deriveAllergenTags, isAllergenTag } from "./allergens";
import type { Database } from "./types";

type AnyDb = SupabaseClient<Database>;

// Excludes demo clients from a clients query — apply to EVERY analytics
// aggregate, export, and billing count so the badged "Alex Demo" client never
// skews real numbers. Generic over the Supabase filter builder so it stays
// chainable: excludeDemoClients(supabase.from("clients").select("id")).
export function excludeDemoClients<
  Q extends { eq(column: "is_demo", value: boolean): Q },
>(query: Q): Q {
  return query.eq("is_demo", false);
}

// ── Food search (Phase 3.1) ──────────────────────────────────────────────────

export type FoodSearchResult =
  Database["public"]["Functions"]["search_foods"]["Returns"][number];

export interface SearchFoodsOptions {
  // Cuisine hint (e.g. "indian") — a tiebreaker only, never a filter.
  locale?: string;
  // Scope org-custom foods. Required for service-role callers (RLS is bypassed);
  // authenticated callers can omit it — the SQL defaults to their JWT org.
  orgId?: string;
  limit?: number;
}

// Resolve a free-text food query to ranked, RLS-visible foods via the indexed
// search_foods() SQL function (FTS + alias + trigram in one round-trip). The
// meal-logging parse step (P3.2) feeds each parsed item name through here.
export async function searchFoods(
  client: AnyDb,
  query: string,
  opts: SearchFoodsOptions = {},
): Promise<FoodSearchResult[]> {
  const term = query.trim();
  if (!term) return [];
  const { data, error } = await client.rpc("search_foods", {
    p_query: term,
    p_locale: opts.locale ?? undefined,
    p_org: opts.orgId ?? undefined,
    p_limit: opts.limit ?? undefined,
  });
  if (error) throw error;
  return data ?? [];
}

// ── Portion resolution (Phase 3.1) ───────────────────────────────────────────
// Turn "2 rotis" / "1 katori dal" / "200 g chicken" into grams, using the food's
// serving_units map. This is the bridge between what a client types and the
// per-100g macro math (which stays in code — CLAUDE.md rule 4). Returns null for
// an unresolvable unit so the caller can show a portion picker instead of
// guessing.

const MASS_UNITS: Record<string, number> = {
  g: 1, gm: 1, gms: 1, gram: 1, grams: 1,
  kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
  mg: 0.001,
};

// Generic "one of them" words that mean: use the food's piece weight.
const PIECE_WORDS = new Set([
  "piece", "pieces", "pc", "pcs", "nos", "no", "number", "count",
  "x", "whole", "serving", "servings", "unit", "units", "item", "items",
]);

function singularize(u: string): string {
  // "-es" sibilant plurals ("glasses"->"glass", "boxes"->"box") strip two chars;
  // everything else strips a trailing "s" ("cups"->"cup", "grapes"->"grape").
  if (u.length > 4 && /(s|x|z|sh|ch)es$/.test(u)) return u.slice(0, -2);
  return u.length > 3 && u.endsWith("s") ? u.slice(0, -1) : u;
}

export interface ResolvedPortion {
  grams: number;
  unit: string;
  // How the unit was matched — surfaced in the confirm card / trainer lens.
  source: "mass" | "serving_unit" | "piece" | "sole_unit";
}

export interface PortionFood {
  name_normalized: string;
  serving_units: Record<string, number> | null;
}

export function resolveGrams(
  food: PortionFood,
  qty: number,
  unit?: string | null,
): ResolvedPortion | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const su = food.serving_units ?? {};
  const raw = (unit ?? "").toLowerCase().trim();
  const sing = singularize(raw);

  // 1. Absolute mass — unambiguous, no food data needed.
  if (raw in MASS_UNITS) return { grams: qty * MASS_UNITS[raw], unit: raw, source: "mass" };
  if (sing in MASS_UNITS) return { grams: qty * MASS_UNITS[sing], unit: sing, source: "mass" };

  // 2. A household unit the food actually defines ("katori", "cup", "tbsp"…).
  for (const key of [raw, sing]) {
    if (key && key in su) return { grams: qty * su[key], unit: key, source: "serving_unit" };
  }

  // 3. A count word, an empty unit, or a unit that IS the food ("2 rotis" for
  //    "Roti (whole wheat)") -> use the food's piece weight.
  const nameTokens = new Set(food.name_normalized.split(/[^a-z]+/).filter(Boolean));
  const pieceish =
    raw === "" ||
    PIECE_WORDS.has(raw) ||
    PIECE_WORDS.has(sing) ||
    nameTokens.has(raw) ||
    nameTokens.has(sing);
  if (pieceish) {
    if ("piece" in su) return { grams: qty * su.piece, unit: "piece", source: "piece" };
    const keys = Object.keys(su);
    if (keys.length === 1) return { grams: qty * su[keys[0]], unit: keys[0], source: "sole_unit" };
  }

  // 4. Unknown unit for this food — caller resolves interactively.
  return null;
}

// ── org-custom foods (Phase 3.1) ─────────────────────────────────────────────
// A trainer adding their own recipe. Allergen tags are REQUIRED on creation:
// the caller passes an explicit decision (their declared tags — an empty array
// means "explicitly none"), and we UNION the fail-closed name/ingredient
// derivation on top so a forgotten "contains cashew" can't slip through. RLS +
// the foods_org_custom_ownership CHECK enforce org scoping and the org_custom
// source at the DB; this builds the validated insert payload.

export interface OrgCustomFoodInput {
  orgId: string;
  name: string;
  // Explicit allergen decision (may be []). Merged with derived tags.
  allergens: string[];
  servingUnits?: Record<string, number>;
  cuisineTags?: string[];
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g?: number;
  sourceRef?: string;
  // Optional free-text ingredient list — improves allergen derivation.
  ingredients?: string;
}

type FoodInsert = Database["public"]["Tables"]["foods"]["Insert"];

function nonNegative(n: number, field: string): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    throw new Error(`org-custom food: ${field} must be a non-negative number`);
  }
  return n;
}

// Validate + assemble an org_custom foods insert row (does not write). Throws on
// bad input; the caller inserts with an org-scoped (authenticated) client so RLS
// applies. Exported for reuse by the P3.2 "save as recipe" action.
export function buildOrgCustomFood(input: OrgCustomFoodInput): FoodInsert {
  const name = input.name.trim();
  if (!name) throw new Error("org-custom food: name is required");

  for (const t of input.allergens) {
    if (!isAllergenTag(t)) throw new Error(`org-custom food: unknown allergen tag "${t}"`);
  }
  const tags = new Set<AllergenTag>(input.allergens as AllergenTag[]);
  for (const t of deriveAllergenTags(`${name} ${input.ingredients ?? ""}`)) tags.add(t);

  return {
    org_id: input.orgId,
    source: "org_custom",
    source_ref: input.sourceRef ?? null,
    name,
    name_normalized: name.toLowerCase(),
    cuisine_tags: input.cuisineTags ?? [],
    allergen_tags: [...tags].sort(),
    serving_units: input.servingUnits ?? {},
    kcal_per_100g: nonNegative(input.kcalPer100g, "kcal"),
    protein_per_100g: nonNegative(input.proteinPer100g, "protein"),
    carbs_per_100g: nonNegative(input.carbsPer100g, "carbs"),
    fat_per_100g: nonNegative(input.fatPer100g, "fat"),
    fiber_per_100g: nonNegative(input.fiberPer100g ?? 0, "fiber"),
    verified: false,
  };
}

// Insert a trainer's org-custom food with an org-scoped (RLS-enforcing) client.
export async function createOrgCustomFood(
  client: AnyDb,
  input: OrgCustomFoodInput,
): Promise<{ id: string }> {
  const row = buildOrgCustomFood(input);
  const { data, error } = await client
    .from("foods")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

// ── Ledger series (Phase 3.5) ────────────────────────────────────────────────

export type LedgerDay = Database["public"]["Tables"]["ledger_days"]["Row"];

// A client's closed ledger days over a date range (inclusive), oldest first.
// The typed series the client-lens score card and P7 dashboard charts read.
export async function ledgerDaysInRange(
  client: AnyDb,
  clientId: string,
  fromDate: string,
  toDate: string,
): Promise<LedgerDay[]> {
  const { data, error } = await client
    .from("ledger_days")
    .select("*")
    .eq("client_id", clientId)
    .gte("tz_date", fromDate)
    .lte("tz_date", toDate)
    .order("tz_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
