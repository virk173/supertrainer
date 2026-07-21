import "server-only";

import {
  filterSafeFoods,
  generatePreviewDraft,
  type PreviewCandidate,
} from "@supertrainer/ai";
import type { Json } from "@supertrainer/db/types";

import { trackServer } from "@/lib/analytics/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  filterByDiet,
  type DietPreference,
} from "@/lib/preview/diet-filter";
import { sumMacros, type ComputedMacros } from "@/lib/preview/macros";

export interface PreviewMealItem {
  foodId: string;
  name: string;
  grams: number;
  macros: ComputedMacros;
}
export interface PreviewMeal {
  title: string;
  items: PreviewMealItem[];
  macros: ComputedMacros;
}
export interface PreviewContent {
  diet: { breakfast: PreviewMeal; lunch: PreviewMeal };
  training: { focus: string; exercises: { name: string; sets: number; reps: string }[] };
  coachNote: string;
  generatedAt: string;
}

type FoodRow = {
  id: string;
  name: string;
  name_normalized: string;
  allergen_tags: string[];
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number;
};

const DIET_VALUES: DietPreference[] = ["veg", "non_veg", "vegan"];

// Stale-claim window (MF-7): if generation crashes mid-flight (process killed
// after claiming, before writing the preview or releasing the claim), the row
// is stuck with preview_generating_at set and preview still null. Treating a
// claim older than this as abandoned means a dead process can never
// permanently block generation for a lead.
const CLAIM_TTL_MS = 2 * 60 * 1000;

function buildMeal(
  title: string,
  rawItems: { foodId: string; grams: number }[],
  pool: Map<string, FoodRow>,
): PreviewMeal {
  // Fail-closed: keep ONLY items whose foodId is in the allergen/diet-filtered
  // pool. A hallucinated or unsafe id is dropped here, so nothing outside the
  // safe pool can ever reach the rendered preview. Dedupe repeated ids too — the
  // model occasionally lists a food twice, which would double-count macros and
  // collide React keys.
  const items: PreviewMealItem[] = [];
  const usedIds = new Set<string>();
  for (const it of rawItems) {
    const food = pool.get(it.foodId);
    if (!food || usedIds.has(food.id)) continue;
    usedIds.add(food.id);
    const grams = Math.max(1, Math.min(1000, Math.round(it.grams)));
    items.push({
      foodId: food.id,
      name: food.name,
      grams,
      macros: sumMacros([{ food, grams }]),
    });
  }
  return {
    title,
    items,
    macros: sumMacros(items.map((i) => ({ food: pool.get(i.foodId)!, grams: i.grams }))),
  };
}

// Deterministic fallback so a meal is never empty (e.g. the model returned only
// ids outside the pool). Picks the first pool foods — safe by construction.
function fallbackItems(pool: FoodRow[], n: number): { foodId: string; grams: number }[] {
  return pool.slice(0, n).map((f) => ({ foodId: f.id, grams: 100 }));
}

// Returns the lead's cached preview, or generates + caches one. Generation is a
// paid AI call, so it runs at most once per lead — enforced by a conditional
// claim (preview_generating_at) below, not just the read-then-check, so
// concurrent loads can't both trigger a paid generation (MF-7). Returns null
// if generation isn't possible (no API key / model failure / lost the claim
// race) — the caller shows a pending state.
export async function getOrCreatePreview(
  leadId: string,
): Promise<PreviewContent | null> {
  const service = createServiceClient();

  const { data: lead } = await service
    .from("leads")
    .select("id, org_id, allergens, answers, preview, status")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;

  if (lead.preview) return lead.preview as unknown as PreviewContent;

  // CLAIM (MF-7): serialize generation with a conditional UPDATE instead of
  // the old read-then-check. Only the caller whose UPDATE affects a row
  // (preview still null AND no fresh claim in flight) proceeds to the paid
  // Sonnet call below. Concurrent losers — a second tab, a hover-prefetch +
  // click, a double navigation — do NOT generate.
  const staleBefore = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  const { data: claimed } = await service
    .from("leads")
    .update({ preview_generating_at: new Date().toISOString() })
    .eq("id", leadId)
    .is("preview", null)
    .or(`preview_generating_at.is.null,preview_generating_at.lt.${staleBefore}`)
    .select("id");
  if (!claimed || claimed.length === 0) {
    // Lost the claim race. Either another caller holds a fresh claim (still
    // generating — re-reading will show preview===null, which is exactly the
    // existing "pending" UI state), or a concurrent winner already finished
    // between our read above and now (re-reading returns the fresh cache
    // instead of manufacturing a spurious pending state).
    const { data: recheck } = await service
      .from("leads")
      .select("preview")
      .eq("id", leadId)
      .maybeSingle();
    return (recheck?.preview as unknown as PreviewContent | null) ?? null;
  }

  // This call now owns the claim. Release it (set back to null) on every
  // early-return below — a legitimate "can't generate" outcome (no safe
  // foods, model failure) must not block a retry for the full TTL.
  const releaseClaim = () =>
    service.from("leads").update({ preview_generating_at: null }).eq("id", leadId);

  // Global verified foods only (org_id null) — the shared reference DB.
  const { data: foods } = await service
    .from("foods")
    .select(
      "id, name, name_normalized, allergen_tags, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g",
    )
    .is("org_id", null);
  if (!foods || foods.length === 0) {
    await releaseClaim();
    return null;
  }

  const answers = (lead.answers ?? {}) as Record<string, unknown>;
  const pref: DietPreference = DIET_VALUES.includes(answers.diet as DietPreference)
    ? (answers.diet as DietPreference)
    : "non_veg";

  // SAFETY: allergen filter first, then diet filter — the model only ever sees
  // this pool.
  const safe = filterSafeFoods(foods as FoodRow[], lead.allergens ?? []);
  const pool = filterByDiet(safe, pref);
  if (pool.length === 0) {
    await releaseClaim();
    return null;
  }
  const poolById = new Map(pool.map((f) => [f.id, f as FoodRow]));

  // Trainer's confirmed style (voice + food/exercise choices), if ingested.
  const { data: styles } = await service
    .from("style_profiles")
    .select("domain, profile")
    .eq("org_id", lead.org_id)
    .eq("status", "confirmed");
  const styleText = (styles ?? [])
    .map((s) => `${s.domain} style: ${JSON.stringify(s.profile)}`)
    .join("\n");

  const candidates: PreviewCandidate[] = pool.map((f) => ({
    id: f.id,
    name: f.name,
    kcalPer100g: Number(f.kcal_per_100g),
    proteinPer100g: Number(f.protein_per_100g),
  }));

  let draft;
  try {
    draft = await generatePreviewDraft({
      candidates,
      styleText,
      lead: {
        goal: String(answers.goal ?? "general_health"),
        diet: pref,
        experience: String(answers.experience ?? "beginner"),
        trainingDaysPerWeek: Number(answers.trainingDaysPerWeek ?? 3),
        sex: String(answers.sex ?? "prefer_not"),
        age: Number(answers.age ?? 30),
      },
    });
  } catch (err) {
    console.error("[preview] generation failed:", err);
    await releaseClaim();
    return null;
  }

  const breakfastRaw = draft.diet.breakfast.items.length
    ? draft.diet.breakfast.items
    : fallbackItems(pool as FoodRow[], 2);
  const lunchRaw = draft.diet.lunch.items.length
    ? draft.diet.lunch.items
    : fallbackItems(pool as FoodRow[], 2);

  let breakfast = buildMeal(draft.diet.breakfast.title || "Breakfast", breakfastRaw, poolById);
  if (breakfast.items.length === 0)
    breakfast = buildMeal("Breakfast", fallbackItems(pool as FoodRow[], 2), poolById);
  let lunch = buildMeal(draft.diet.lunch.title || "Lunch", lunchRaw, poolById);
  if (lunch.items.length === 0)
    lunch = buildMeal("Lunch", fallbackItems(pool as FoodRow[], 2), poolById);

  const content: PreviewContent = {
    diet: { breakfast, lunch },
    training: {
      focus: draft.training.focus,
      exercises: draft.training.exercises.map((e) => ({
        name: e.name,
        sets: e.sets,
        reps: e.reps,
      })),
    },
    coachNote: draft.coachNote,
    generatedAt: new Date().toISOString(),
  };

  // Cache on the lead UNCONDITIONALLY (this is the never-regenerate guarantee —
  // a paid Sonnet call must be cached even if the lead already converted).
  // Also releases the claim — though once preview is non-null, the claim's
  // `.is("preview", null)` guard already makes it permanently unclaimable.
  await service
    .from("leads")
    .update({
      preview: content as unknown as Json,
      preview_generated_at: content.generatedAt,
      preview_generating_at: null,
    })
    .eq("id", leadId);

  // Advance the funnel status only from 'started' — never downgrade a lead that
  // has already moved to preview_shown/converted.
  await service
    .from("leads")
    .update({ status: "preview_shown" })
    .eq("id", leadId)
    .eq("status", "started");

  // Funnel event: the preview is the phase's central conversion mechanic.
  await trackServer({
    orgId: lead.org_id,
    event: "preview_shown",
    properties: { lead_id: leadId },
  });

  return content;
}
