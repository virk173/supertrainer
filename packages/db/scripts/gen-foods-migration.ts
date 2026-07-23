// Phase 3.1 — generate the Indian-foods seed migration from the cited JSON.
//
// Mirrors the P2.2 approach (the 128-food global seed was generated from
// packages/db/seed/preview-foods-seed.json so the shipped rows can't drift from
// their source). Run after editing either seed file:
//
//   npx tsx packages/db/scripts/gen-foods-migration.ts
//
// It re-writes supabase/migrations/20260722140200_indian_foods.sql with:
//   • idempotent INSERTs for the net-new global foods (on-conflict do-nothing on
//     the (name_normalized, source) partial key), allergen_tags computed by the
//     deterministic tagger (declared ∪ name/ingredient-derived, fail-closed);
//   • idempotent alias INSERTs that resolve their target food by name_normalized
//     at apply time (a target that doesn't exist is skipped, never errors).
//
// The output migration is committed; this script is the maintenance tool, not a
// runtime dependency.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tagFood } from "./tag-allergens.ts";

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = join(here, "..", "seed");
const outFile = join(here, "..", "..", "..", "supabase", "migrations", "20260722140200_indian_foods.sql");

interface FoodSeed {
  source: string;
  source_ref: string;
  name: string;
  cuisine_tags: string[];
  allergen_tags?: string[];
  serving_units: Record<string, number>;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  verified: boolean;
  ingredients_hint?: string;
}

interface AliasSeed {
  alias: string;
  food: string;
  locale?: string | null;
}

const VALID_SOURCES = new Set(["usda", "off", "ifct", "org_custom", "seed"]);

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function sqlTextArray(arr: string[]): string {
  if (arr.length === 0) return "array[]::text[]";
  return `array[${arr.map(sqlStr).join(", ")}]::text[]`;
}

function sqlJsonb(obj: unknown): string {
  return `${sqlStr(JSON.stringify(obj))}::jsonb`;
}

function num(n: number, field: string, name: string): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    throw new Error(`Food "${name}": ${field} must be a non-negative number, got ${JSON.stringify(n)}`);
  }
  return n;
}

function main() {
  const foodsDoc = JSON.parse(readFileSync(join(seedDir, "indian-foods-seed.json"), "utf8")) as {
    foods: FoodSeed[];
  };
  const aliasDoc = JSON.parse(readFileSync(join(seedDir, "food-aliases-seed.json"), "utf8")) as {
    aliases: AliasSeed[];
  };

  const seenNames = new Set<string>();
  const foodRows: string[] = [];
  let verifiedCount = 0;

  for (const f of foodsDoc.foods) {
    if (!VALID_SOURCES.has(f.source)) throw new Error(`Food "${f.name}": bad source "${f.source}"`);
    const nameNorm = f.name.toLowerCase().trim();
    if (seenNames.has(nameNorm)) throw new Error(`Duplicate food name_normalized in seed: "${nameNorm}"`);
    seenNames.add(nameNorm);

    const tags = tagFood(f.allergen_tags, f.name, f.ingredients_hint);
    if (f.verified) verifiedCount++;

    foodRows.push(
      "  (" +
        [
          sqlStr(f.source),
          sqlStr(f.source_ref),
          sqlStr(f.name),
          sqlStr(nameNorm),
          sqlTextArray(f.cuisine_tags),
          sqlTextArray(tags),
          sqlJsonb(f.serving_units),
          num(f.kcal, "kcal", f.name),
          num(f.protein, "protein", f.name),
          num(f.carbs, "carbs", f.name),
          num(f.fat, "fat", f.name),
          num(f.fiber, "fiber", f.name),
          f.verified ? "true" : "false",
        ].join(", ") +
        ")",
    );
  }

  const aliasRows: string[] = [];
  for (const a of aliasDoc.aliases) {
    const aliasNorm = a.alias.toLowerCase().trim();
    const targetNorm = a.food.toLowerCase().trim();
    const locale = a.locale ? sqlStr(a.locale) : "null";
    // Resolve the target food by name_normalized at apply time; a missing target
    // yields zero rows (skipped), never an error.
    aliasRows.push(
      `  insert into public.food_aliases (food_id, alias, alias_normalized, locale)\n` +
        `  select f.id, ${sqlStr(a.alias)}, ${sqlStr(aliasNorm)}, ${locale}\n` +
        `  from public.foods f\n` +
        `  where f.org_id is null and f.name_normalized = ${sqlStr(targetNorm)}\n` +
        `  on conflict do nothing;`,
    );
  }

  const sql = `-- Phase 3.1 — Indian foods seed (GENERATED — do not edit by hand).
-- Source: packages/db/seed/indian-foods-seed.json + food-aliases-seed.json
-- Regenerate: npx tsx packages/db/scripts/gen-foods-migration.ts
--
-- ${foodRows.length} net-new global staples (${verifiedCount} verified single-ingredient,
-- ${foodRows.length - verifiedCount} recipe estimates flagged verified=false) + ${aliasRows.length} search aliases.
-- allergen_tags are declared ∪ tagger-derived (fail-closed). All macros per 100 g.

insert into public.foods
  (source, source_ref, name, name_normalized, cuisine_tags, allergen_tags, serving_units,
   kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, verified)
values
${foodRows.join(",\n")}
on conflict (name_normalized, source) where org_id is null do nothing;

-- ── Search aliases (resolved to global foods by name_normalized) ─────────────
${aliasRows.join("\n")}
`;

  writeFileSync(outFile, sql);
  console.log(
    `Wrote ${outFile}\n  foods: ${foodRows.length} (${verifiedCount} verified)\n  aliases: ${aliasRows.length}`,
  );
}

main();
