import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  calculateTargets,
  compileConstraints,
  type FoodMacroRow,
} from "@supertrainer/nutrition-engine";

import { excludedAllergenTags, filterSafeFoods } from "../../src/allergens";
import { generateDietPlan, realDietAgents, type PoolFood } from "../../src/diet-pipeline";
import { GOLDEN_INTAKES } from "../../src/diet-pipeline/fixtures";
import { flushTracing } from "../../src/tracing";

// Diet-plan eval (Phase 4.2 §⑥). Runs the LIVE multi-agent pipeline over the 12
// golden intakes and checks each produces a validated draft with ZERO allergen
// hits (a hard gate). The CI merge gate uses a deterministic filler instead
// (tests/e2e/diet-fixtures.spec.ts) — this script exercises the real agents.
// Usage: `npm run eval:diet` (optionally `-- <N>` to run the first N intakes).

const ALLERGEN_SAFETY_GATE = 1.0; // 100% — no plan may ever contain an allergen
const PASS_THRESHOLD = 0.8; // drafts that validate

function loadEnv(): void {
  if (process.env.ANTHROPIC_API_KEY) return;
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const envFile = path.resolve(scriptDir, "../../../..", "apps/web/.env.local");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

interface FoodRow extends FoodMacroRow {
  name: string;
  name_normalized: string;
  cuisine_tags: string[];
}

const NON_VEG = /\b(chicken|mutton|goat|beef|lamb|turkey|fish|salmon|tuna|cod|rohu|tilapia|prawn|shrimp|crab|lobster|meat|egg|duck)\b/;
function fitsDiet(f: FoodRow, pref: "veg" | "non_veg" | "vegan"): boolean {
  if (pref === "non_veg") return true;
  if (NON_VEG.test(f.name_normalized)) return false;
  if (pref === "vegan") {
    if (f.allergen_tags.includes("dairy")) return false;
    if (/\bhoney\b/.test(f.name_normalized)) return false;
  }
  return true;
}

async function loadGlobalFoods(): Promise<FoodRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (start local Supabase)");
  const cols = "id,name,name_normalized,allergen_tags,cuisine_tags,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g";
  const res = await fetch(`${url}/rest/v1/foods?org_id=is.null&select=${cols}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`foods fetch failed: ${res.status}`);
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    name_normalized: String(r.name_normalized),
    allergen_tags: (r.allergen_tags as string[]) ?? [],
    cuisine_tags: (r.cuisine_tags as string[]) ?? [],
    kcal_per_100g: Number(r.kcal_per_100g),
    protein_per_100g: Number(r.protein_per_100g),
    carbs_per_100g: Number(r.carbs_per_100g),
    fat_per_100g: Number(r.fat_per_100g),
    fiber_per_100g: Number(r.fiber_per_100g),
  }));
}

async function main() {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set — cannot run the live diet eval.");
    process.exit(2);
  }
  const limit = Number(process.argv[2]) || GOLDEN_INTAKES.length;
  const intakes = GOLDEN_INTAKES.slice(0, limit);
  const foods = await loadGlobalFoods();
  console.log(`Running diet-plan eval on ${intakes.length} intakes (${foods.length} foods)…\n`);

  let drafts = 0;
  let allergenSafe = 0;
  for (const fx of intakes) {
    const allergens = fx.intake.allergens ?? [];
    const diet = fx.intake.diet ?? "non_veg";
    const excluded = [...excludedAllergenTags(allergens)];
    const safe = filterSafeFoods(foods, allergens);
    const pool: PoolFood[] = safe.filter((f) => fitsDiet(f, diet));

    const targets = calculateTargets(fx.intake, fx.style);
    const constraints = compileConstraints(fx.intake, { cuisineBias: fx.cuisineBias });

    try {
      const res = await generateDietPlan(
        { targets, constraints, pool, excludedAllergenTags: excluded },
        realDietAgents,
      );
      const hits = res.versions.flatMap((v) => v.validation.dayTypes.flatMap((d) => d.allergenHits));
      const safeRun = hits.length === 0;
      const drafted = res.status === "draft";
      if (drafted) drafts += 1;
      if (safeRun) allergenSafe += 1;
      console.log(`${drafted ? "✓" : "✗"} ${safeRun ? "🛡 " : "⚠️ "} ${fx.name} — ${res.status}, ${res.versions.filter((v) => v.validation.ok).length}/2 valid`);
    } catch (err) {
      console.log(`✗ ⚠️  ${fx.name} — pipeline error: ${String(err)}`);
    }
  }

  await flushTracing();
  const draftRate = drafts / intakes.length;
  const safeRate = allergenSafe / intakes.length;
  console.log(`\nDraft rate: ${Math.round(draftRate * 100)}%  ·  Allergen-safe: ${Math.round(safeRate * 100)}%`);
  if (safeRate < ALLERGEN_SAFETY_GATE) {
    console.error("ALLERGEN SAFETY GATE FAILED — a plan contained an excluded allergen.");
    process.exit(1);
  }
  if (draftRate < PASS_THRESHOLD) {
    console.error(`Draft rate ${Math.round(draftRate * 100)}% below ${Math.round(PASS_THRESHOLD * 100)}% gate.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
