import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { filterExercisePool } from "../../src/injury-exclusions";
import {
  generateSplit,
  realSplitAgents,
  type ExerciseCandidate,
} from "../../src/split-pipeline";
import { GOLDEN_SPLIT_INTAKES } from "../../src/split-pipeline/fixtures";
import { flushTracing } from "../../src/tracing";

// Split-designer eval (Phase 5.2 §⑥). Runs the LIVE multi-agent pipeline over the
// 10 golden intakes and checks each produces a validated draft with ZERO
// injury-excluded exercises (a hard gate). The CI merge gate uses a deterministic
// filler instead (apps/web/tests/e2e/split-fixtures.spec.ts) — this exercises the
// real agents. Usage: `npm run eval:split` (optionally `-- <N>` for the first N).

const INJURY_SAFETY_GATE = 1.0; // 100% — no split may contain an excluded exercise
const PASS_THRESHOLD = 0.7; // drafts that fully validate (injury cases may need_attention)

const EXPERIENCE_LADDER: Record<string, string[]> = {
  beginner: ["beginner"],
  intermediate: ["beginner", "intermediate"],
  advanced: ["beginner", "intermediate", "advanced"],
};

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

interface ExRow {
  id: string;
  name: string;
  name_normalized: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  movement_patterns: ExerciseCandidate["movement_patterns"];
  equipment: string[];
  experience_min: "beginner" | "intermediate" | "advanced";
}

async function loadGlobalExercises(): Promise<ExRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (start local Supabase)");
  const cols = "id,name,name_normalized,primary_muscles,secondary_muscles,movement_patterns,equipment,experience_min";
  const res = await fetch(`${url}/rest/v1/exercises?org_id=is.null&select=${cols}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`exercises fetch failed: ${res.status}`);
  return (await res.json()) as ExRow[];
}

function compilePool(rows: ExRow[], equipment: string[], experience: string, injuries: string[]) {
  const allowed = new Set(EXPERIENCE_LADDER[experience] ?? ["beginner"]);
  const filtered = rows.filter(
    (r) =>
      r.movement_patterns.length > 0 &&
      allowed.has(r.experience_min) &&
      r.equipment.some((e) => equipment.includes(e)),
  );
  const { allowed: safe, excluded } = filterExercisePool(filtered, injuries, { idOf: (r) => r.id });
  const pool: ExerciseCandidate[] = safe.map((a) => ({
    id: a.exercise.id,
    name: a.exercise.name,
    primary_muscles: a.exercise.primary_muscles,
    secondary_muscles: a.exercise.secondary_muscles,
    movement_patterns: a.exercise.movement_patterns,
    equipment: a.exercise.equipment,
    experience_min: a.exercise.experience_min,
    ...(a.caution ? { caution: true, cautionReasons: a.reasons } : {}),
  }));
  return { pool, excludedIds: new Set(excluded.map((e) => e.exercise.id)) };
}

async function main() {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set — cannot run the live split eval.");
    process.exit(2);
  }
  const limit = Number(process.argv[2]) || GOLDEN_SPLIT_INTAKES.length;
  const intakes = GOLDEN_SPLIT_INTAKES.slice(0, limit);
  const rows = await loadGlobalExercises();
  console.log(`Running split-designer eval on ${intakes.length} intakes (${rows.length} exercises)…\n`);

  let drafts = 0;
  let injurySafe = 0;
  for (const fx of intakes) {
    const { pool, excludedIds } = compilePool(rows, fx.intake.equipment, fx.intake.experience, fx.intake.injuries);
    try {
      const res = await generateSplit(
        {
          availability: { daysPerWeek: fx.intake.daysPerWeek },
          experience: fx.intake.experience,
          goal: fx.intake.goal,
          styleProfile: fx.styleProfile,
          pool,
        },
        realSplitAgents,
      );
      const emittedExcluded = res.days.some((d) => d.exercises.some((e) => excludedIds.has(e.exercise_id)));
      const safeRun = !emittedExcluded;
      const drafted = res.status === "draft";
      if (drafted) drafts += 1;
      if (safeRun) injurySafe += 1;
      console.log(`${drafted ? "✓" : "✗"} ${safeRun ? "🛡 " : "⚠️ "} ${fx.name} — ${res.status} (${res.archetype}, bal ${res.validation.balance.ratio.toFixed(2)})`);
    } catch (err) {
      console.log(`✗ ⚠️  ${fx.name} — pipeline error: ${String(err)}`);
    }
  }

  await flushTracing();
  const draftRate = drafts / intakes.length;
  const safeRate = injurySafe / intakes.length;
  console.log(`\nDraft rate: ${Math.round(draftRate * 100)}%  ·  Injury-safe: ${Math.round(safeRate * 100)}%`);
  if (safeRate < INJURY_SAFETY_GATE) {
    console.error("INJURY SAFETY GATE FAILED — a split contained an excluded exercise.");
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
