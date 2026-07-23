// Phase 3.1 verification (the sub-phase's Definition of Done, runnable):
//   • spot-check 10 known foods vs published macros
//   • "2 rotis" resolves to 80 g with correct kcal (search + resolveGrams)
//   • regional aliases resolve ("chawal" -> White rice)
//   • the USDA importer is idempotent (import the sample bundle twice -> no dupes)
//
// Requires a running local Supabase and service-role env:
//   export $(npx supabase status -o env | grep -E 'API_URL|SERVICE_ROLE_KEY' \
//     | sed 's/API_URL/SUPABASE_URL/; s/SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY/')
//   npx tsx packages/db/scripts/verify-nutrition.ts

import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { searchFoods, resolveGrams } from "../src/queries.ts";
import { importUsda } from "./import-usda.ts";

const here = dirname(fileURLToPath(import.meta.url));

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see file header).");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function foodByName(name: string) {
  const { data, error } = await db
    .from("foods")
    .select("name_normalized, kcal_per_100g, serving_units, allergen_tags")
    .is("org_id", null)
    .eq("name_normalized", name)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function main() {
  // 1 ── Spot-check 10 foods vs published per-100g kcal.
  const expected: Array<[string, number]> = [
    ["chicken breast, cooked", 165],
    ["roti (whole wheat)", 297],
    ["paneer (whole milk)", 296],
    ["white rice, cooked", 130],
    ["pigeon pea (toor dal), cooked", 121],
    ["almonds", 579],
    ["banana", 89],
    ["chana dal (split chickpea), cooked", 120],
    ["gulab jamun", 300],
    ["masala chai (with milk & sugar)", 65],
  ];
  for (const [name, kcal] of expected) {
    const f = await foodByName(name);
    check(`spot-check ${name} = ${kcal} kcal`, !!f && Number(f.kcal_per_100g) === kcal,
      f ? `got ${f.kcal_per_100g}` : "not found");
  }

  // 2 ── "2 rotis" -> 80 g -> correct kcal, through the real search + resolver.
  const rotiHits = await searchFoods(db as never, "roti", { locale: "indian" });
  const roti = rotiHits[0];
  check("search 'roti' -> Roti (whole wheat)", roti?.name_normalized === "roti (whole wheat)",
    roti?.name);
  if (roti) {
    const portion = resolveGrams(
      { name_normalized: roti.name_normalized, serving_units: roti.serving_units as Record<string, number> },
      2, "rotis",
    );
    check("resolveGrams(2 rotis) = 80 g", portion?.grams === 80, `got ${portion?.grams}`);
    const kcal = portion ? Math.round((Number(roti.kcal_per_100g) * portion.grams) / 100) : 0;
    check("2 rotis kcal = 238", kcal === 238, `got ${kcal}`);
  }

  // 3 ── Portion via a defined household unit + a mass unit.
  const dal = await foodByName("chana dal (split chickpea), cooked");
  if (dal) {
    const p = resolveGrams({ name_normalized: dal.name_normalized, serving_units: dal.serving_units as Record<string, number> }, 1, "katori");
    check("resolveGrams(1 katori dal) = 150 g", p?.grams === 150, `got ${p?.grams}`);
  }
  const chicken = await foodByName("chicken breast, cooked");
  if (chicken) {
    const p = resolveGrams({ name_normalized: chicken.name_normalized, serving_units: chicken.serving_units as Record<string, number> }, 200, "g");
    check("resolveGrams(200 g chicken) = 200 g", p?.grams === 200, `got ${p?.grams}`);
  }

  // 4 ── Alias resolution.
  const chawal = await searchFoods(db as never, "chawal");
  check("alias 'chawal' -> White rice", chawal[0]?.name_normalized === "white rice, cooked", chawal[0]?.name);
  const chai = await searchFoods(db as never, "chai");
  check("alias 'chai' -> Masala chai", chai[0]?.name_normalized === "masala chai (with milk & sugar)", chai[0]?.name);

  // 5 ── USDA importer idempotency (sample bundle, run twice).
  const fixtureDir = join(here, "fixtures", "usda-sample");
  const stateFile = join(fixtureDir, ".import-usda-state.json");
  try {
    await importUsda({ dir: fixtureDir, client: db as never, reset: true });
    const countFixture = async () => {
      const { count } = await db
        .from("foods")
        .select("id", { count: "exact", head: true })
        .is("org_id", null)
        .like("source_ref", "USDA FDC 99990%");
      return count ?? 0;
    };
    const after1 = await countFixture();
    check("USDA import inserts 2 sample foods (branded + no-energy skipped)", after1 === 2, `got ${after1}`);

    const kale = await foodByName("kale, raw (fdc sample)");
    check("sample kale kcal=35, no allergens", !!kale && Number(kale.kcal_per_100g) === 35 && (kale.allergen_tags as string[]).length === 0);
    const almonds = await foodByName("almonds, dry roasted (fdc sample)");
    check("sample almonds kcal=598, tree_nut tagged, handful=28 g",
      !!almonds && Number(almonds.kcal_per_100g) === 598 &&
      (almonds.allergen_tags as string[]).includes("tree_nut") &&
      (almonds.serving_units as Record<string, number>).handful === 28);

    await importUsda({ dir: fixtureDir, client: db as never, reset: true });
    const after2 = await countFixture();
    check("USDA re-import is idempotent (still 2, no dupes)", after2 === 2, `got ${after2}`);
  } finally {
    await db.from("foods").delete().is("org_id", null).like("source_ref", "USDA FDC 99990%");
    if (existsSync(stateFile)) rmSync(stateFile);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
