// Phase 5.1 — generate the exercise-catalog seed migration from free-exercise-db.
//
// Mirrors the P2.2/P3.1 foods approach (gen-foods-migration.ts): the shipped
// rows are GENERATED from the cited public-domain source so they can't drift.
// Run after editing the source JSON or the pattern overrides:
//
//   npx tsx packages/db/scripts/gen-exercises-migration.ts
//
// Source: packages/db/seed/free-exercise-db.json (yuhonas/free-exercise-db, the
// Unlicense — public domain) + exercise-pattern-overrides.json (hand-reviewed
// movement_patterns for ambiguous lifts). movement_patterns/experience/muscles/
// equipment are assigned by classify-movement.ts IN CODE. Output migration is
// committed; this script is the maintenance tool, not a runtime dependency.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  classifyExercise,
  type FebExercise,
  type MovementPattern,
} from "./classify-movement.ts";

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = join(here, "..", "seed");
const outFile = join(
  here,
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260724120100_exercises_seed.sql",
);

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function sqlTextArray(arr: string[]): string {
  if (arr.length === 0) return "array[]::text[]";
  return `array[${arr.map(sqlStr).join(", ")}]::text[]`;
}

function sqlPatternArray(arr: MovementPattern[]): string {
  if (arr.length === 0) return "array[]::public.movement_pattern[]";
  return `array[${arr.map(sqlStr).join(", ")}]::public.movement_pattern[]`;
}

function main() {
  const feb = JSON.parse(
    readFileSync(join(seedDir, "free-exercise-db.json"), "utf8"),
  ) as FebExercise[];
  const overridesDoc = JSON.parse(
    readFileSync(join(seedDir, "exercise-pattern-overrides.json"), "utf8"),
  ) as { overrides: Record<string, MovementPattern[]> };
  const overrides = overridesDoc.overrides;

  const seen = new Set<string>();
  const rows: string[] = [];
  let skipped = 0;
  let withPatterns = 0;

  for (const e of feb) {
    const c = classifyExercise(e, overrides);
    if (seen.has(c.name_normalized)) {
      // External data occasionally repeats a display name across ids; keep the
      // first (the global natural key is name_normalized), skip the rest.
      skipped++;
      continue;
    }
    seen.add(c.name_normalized);
    if (c.movement_patterns.length > 0) withPatterns++;

    rows.push(
      "  (" +
        [
          "'feb'",
          sqlStr(c.source_ref),
          sqlStr(c.name),
          sqlStr(c.name_normalized),
          sqlTextArray(c.aliases),
          sqlTextArray(c.primary_muscles),
          sqlTextArray(c.secondary_muscles),
          sqlPatternArray(c.movement_patterns),
          sqlTextArray(c.equipment),
          `'${c.experience_min}'`,
          c.force ? sqlStr(c.force) : "null",
          sqlTextArray(c.image_paths),
          sqlTextArray(c.instructions),
        ].join(", ") +
        ")",
    );
  }

  const sql = `-- Phase 5.1 — exercise catalog seed (GENERATED — do not edit by hand).
-- Source: packages/db/seed/free-exercise-db.json (yuhonas/free-exercise-db, the
--   Unlicense / public domain) + exercise-pattern-overrides.json.
-- Regenerate: npx tsx packages/db/scripts/gen-exercises-migration.ts
--
-- ${rows.length} global platform exercises (${withPatterns} with a strength movement
-- pattern; the remainder are stretch/cardio/mobility rows with [] patterns —
-- searchable but never auto-selected as a working set). movement_patterns /
-- experience_min / muscles / equipment are classifier-derived (in code), never
-- from a model. Idempotent on the (name_normalized, source) global key.

insert into public.exercises
  (source, source_ref, name, name_normalized, aliases, primary_muscles,
   secondary_muscles, movement_patterns, equipment, experience_min, force,
   image_paths, instructions)
values
${rows.join(",\n")}
on conflict (name_normalized, source) where org_id is null do nothing;
`;

  writeFileSync(outFile, sql);
  console.log(
    `Wrote ${outFile}\n  exercises: ${rows.length} (${withPatterns} with patterns, ${skipped} dup-name skipped)`,
  );
}

main();
