// Phase 3.1 — USDA FoodData Central importer (Foundation + SR Legacy).
//
// Consolidates the FDC bulk CSVs into our foods table (approach modelled on
// jack-tol/usda-food-data-pipeline). Branded foods are intentionally skipped for
// now — they're barcode-scoped (OFF covers that later) and would bloat the table.
//
// Usage (download the "Foundation Foods" and/or "SR Legacy" CSV bundles from
// https://fdc.nal.usda.gov/download-datasets.html and unzip):
//
//   export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//   npx tsx packages/db/scripts/import-usda.ts --dir ~/fdc/FoodData_Central_foundation_food_csv
//   # add --limit N to sample, --reset to ignore the resume cursor
//
// Idempotent: a global food is matched on (name_normalized, source='usda') and
// updated in place, so re-running never duplicates. Resumable: the last
// processed fdc_id is checkpointed in <dir>/.import-usda-state.json, so a run
// interrupted at row 40k picks up where it left off.
//
// This module is not a runtime dependency — it's an offline maintenance tool.
// The committed Indian seed (migration 20260722140200) is the shipped baseline;
// this grows Western coverage from the official source on demand.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Papa from "papaparse";

import { deriveAllergenTags } from "../src/allergens.ts";

// FDC nutrient ids (per 100 g edible portion).
const NUTRIENT = { kcal: 1008, protein: 1003, fat: 1004, carbs: 1005, fiber: 1079 } as const;
const KEEP_TYPES = new Set(["foundation_food", "sr_legacy_food"]);

interface ImportOptions {
  dir: string;
  client: SupabaseClient;
  limit?: number;
  reset?: boolean;
  log?: (msg: string) => void;
}

export interface ImportSummary {
  scanned: number;
  inserted: number;
  updated: number;
  skipped: number;
}

function parseCsv<T>(path: string): T[] {
  const text = readFileSync(path, "utf8");
  const { data } = Papa.parse<T>(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  return data;
}

// nutrient amounts keyed by fdc_id -> { kcal, protein, ... }
function loadNutrients(dir: string): Map<string, Record<string, number>> {
  const rows = parseCsv<Record<string, string>>(join(dir, "food_nutrient.csv"));
  const wanted = new Map<number, keyof typeof NUTRIENT>();
  for (const [k, id] of Object.entries(NUTRIENT)) wanted.set(id, k as keyof typeof NUTRIENT);
  const byFood = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const key = wanted.get(Number(r.nutrient_id));
    if (!key) continue;
    const amt = Number(r.amount);
    if (!Number.isFinite(amt)) continue;
    const entry = byFood.get(r.fdc_id) ?? {};
    // Energy in kcal only (FDC also stores kJ under a different id, excluded above).
    entry[key] = amt;
    byFood.set(r.fdc_id, entry);
  }
  return byFood;
}

// household portions keyed by fdc_id -> { unitName: grams }
function loadPortions(dir: string): Map<string, Record<string, number>> {
  const path = join(dir, "food_portion.csv");
  const out = new Map<string, Record<string, number>>();
  if (!existsSync(path)) return out;
  for (const r of parseCsv<Record<string, string>>(path)) {
    const grams = Number(r.gram_weight);
    if (!Number.isFinite(grams) || grams <= 0) continue;
    const label = (r.modifier || r.portion_description || "serving")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim()
      .split(/\s+/)[0];
    if (!label) continue;
    const entry = out.get(r.fdc_id) ?? {};
    // Keep the first weight seen per label; cap at 4 units to stay tidy.
    if (!(label in entry) && Object.keys(entry).length < 4) entry[label] = Math.round(grams);
    out.set(r.fdc_id, entry);
  }
  return out;
}

function statePath(dir: string): string {
  return join(dir, ".import-usda-state.json");
}

export async function importUsda(opts: ImportOptions): Promise<ImportSummary> {
  const log = opts.log ?? (() => {});
  const foods = parseCsv<Record<string, string>>(join(opts.dir, "food.csv"));
  const nutrients = loadNutrients(opts.dir);
  const portions = loadPortions(opts.dir);

  const sp = statePath(opts.dir);
  let cursor = 0;
  if (!opts.reset && existsSync(sp)) {
    cursor = Number(JSON.parse(readFileSync(sp, "utf8")).lastFdcId ?? 0) || 0;
  }

  const summary: ImportSummary = { scanned: 0, inserted: 0, updated: 0, skipped: 0 };

  for (const f of foods) {
    if (!KEEP_TYPES.has(f.data_type)) continue;
    const fdcId = Number(f.fdc_id);
    if (opts.reset ? false : fdcId <= cursor) continue; // already processed
    if (opts.limit && summary.inserted + summary.updated >= opts.limit) break;

    summary.scanned++;
    const macros = nutrients.get(f.fdc_id);
    const description = (f.description ?? "").trim();
    // Require energy + a name; foods missing kcal are unusable for the ledger.
    if (!description || !macros || macros.kcal == null) {
      summary.skipped++;
      continue;
    }

    const nameNorm = description.toLowerCase();
    const row = {
      source: "usda" as const,
      source_ref: `USDA FDC ${f.fdc_id} (${f.data_type})`,
      name: description,
      name_normalized: nameNorm,
      cuisine_tags: ["global"],
      allergen_tags: deriveAllergenTags(description),
      serving_units: portions.get(f.fdc_id) ?? {},
      kcal_per_100g: macros.kcal,
      protein_per_100g: macros.protein ?? 0,
      carbs_per_100g: macros.carbs ?? 0,
      fat_per_100g: macros.fat ?? 0,
      fiber_per_100g: macros.fiber ?? 0,
      verified: true, // official source, cross-checkable by fdc_id
    };

    // Idempotent match on the global natural key (can't use PostgREST upsert:
    // the unique index is partial `where org_id is null`).
    const { data: existing, error: selErr } = await opts.client
      .from("foods")
      .select("id")
      .is("org_id", null)
      .eq("source", "usda")
      .eq("name_normalized", nameNorm)
      .maybeSingle();
    if (selErr) throw selErr;

    if (existing) {
      const { error } = await opts.client.from("foods").update(row).eq("id", existing.id);
      if (error) throw error;
      summary.updated++;
    } else {
      const { error } = await opts.client.from("foods").insert(row);
      // A concurrent/duplicate description collides on the natural key -> treat
      // as already-present rather than failing the whole run.
      if (error && error.code === "23505") summary.skipped++;
      else if (error) throw error;
      else summary.inserted++;
    }

    writeFileSync(sp, JSON.stringify({ lastFdcId: fdcId }));
    if (summary.scanned % 500 === 0) log(`…${summary.scanned} scanned`);
  }

  log(
    `USDA import: ${summary.inserted} inserted, ${summary.updated} updated, ` +
      `${summary.skipped} skipped (${summary.scanned} scanned)`,
  );
  return summary;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isMain(): boolean {
  return Boolean(process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? ""));
}

if (isMain()) {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf("--dir");
  const dir = dirIdx >= 0 ? args[dirIdx + 1] : undefined;
  if (!dir) throw new Error("--dir <FDC csv directory> is required");
  const limIdx = args.indexOf("--limit");
  const limit = limIdx >= 0 ? Number(args[limIdx + 1]) : undefined;
  const reset = args.includes("--reset");

  await importUsda({ dir, client: serviceClient(), limit, reset, log: (m) => console.log(m) });
}
