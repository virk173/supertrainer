// parseTrainingIntake (Phase 5.2) — maps the raw, untyped clients.intake Json
// (+ clients.health_flags) into a typed TrainingIntake, or reports why it can't.
// Mirrors nutrition-engine parseIntake: the pipeline calls this before any pool
// work; a missing training answer surfaces as a structured problem, never a
// throw. Equipment access and experience are free text in the interview, so they
// are normalized here (in code) to the catalog's equipment tokens + the fixed
// experience ladder.

import type { ExperienceLevel, TrainingIntake } from "./types";

export type ParseTrainingResult =
  | { ok: true; intake: TrainingIntake }
  | { ok: false; issues: string[] };

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

const EQUIPMENT_TOKENS = [
  "bodyweight",
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "kettlebell",
  "bands",
] as const;

const FULL_GYM = [...EQUIPMENT_TOKENS];

// Free-text equipment access → catalog equipment tokens. "full gym" → everything;
// "home dumbbells" → dumbbell + bodyweight; "bodyweight only" → bodyweight. You
// can ALWAYS do bodyweight, so it's implicit unless the pool would be empty.
export function normalizeEquipmentAccess(text: string): string[] {
  const s = text.toLowerCase();
  // A commercial/full gym → everything. A bare "gym" counts too, EXCEPT "home
  // gym", which usually means a limited home setup — fall through to detect its
  // actual equipment rather than over-granting barbell/machine/cable.
  const fullGym =
    /\b(full gym|commercial gym|big gym|globo|fitness cent(?:er|re))\b/.test(s) ||
    (/\bgym\b/.test(s) && !/\bhome\b/.test(s));
  if (fullGym) return [...FULL_GYM];
  // Detect real (weighted) equipment separately from an explicit bodyweight-only
  // signal — so "bodyweight only" narrows, but an unrecognized phrase doesn't.
  const found = new Set<string>();
  if (/\bbarbell|squat rack|power rack|\brack\b/.test(s)) found.add("barbell");
  if (/\bdumbbell|\bdb\b|free weights?|adjustable\b/.test(s)) found.add("dumbbell");
  if (/\bcable|pulley|functional trainer\b/.test(s)) found.add("cable");
  if (/\bmachine|smith|leg press|selectorized\b/.test(s)) found.add("machine");
  if (/\bkettlebell|\bkb\b/.test(s)) found.add("kettlebell");
  if (/\bband|resistance band\b/.test(s)) found.add("bands");
  const explicitBodyweight =
    /\bbodyweight|body weight|calisthenic|no equipment|nothing|home only\b/.test(s);

  // Any weighted equipment → that set, plus implicit bodyweight.
  if (found.size > 0) return [...found, "bodyweight"];
  // Explicitly bodyweight-only → just bodyweight.
  if (explicitBodyweight) return ["bodyweight"];
  // Nothing recognizable → assume a full gym (the common case; the trainer
  // narrows it in review). Over-including is caught by validation + review;
  // silently narrowing to bodyweight would hide viable programming.
  return [...FULL_GYM];
}

// Free-text experience → the fixed ladder. Fail toward the LESS-loaded gate
// (beginner) on ambiguity so an unproven lifter isn't handed advanced lifts.
export function normalizeExperience(text: string | undefined): ExperienceLevel {
  if (!text) return "beginner";
  const s = text.toLowerCase();
  if (/\b(advanced|expert|experienced|elite|competit|many years|10\+? ?years?)\b/.test(s)) {
    return "advanced";
  }
  if (/\b(beginner|novice|new|just start|never|none|first time|0 ?years?|couple months|few months)\b/.test(s)) {
    return "beginner";
  }
  if (/\b(intermediate|some experience|a year|1-2 ?years?|2-3 ?years?)\b/.test(s)) {
    return "intermediate";
  }
  // A bare number of years: >=3 → advanced, >=1 → intermediate, else beginner.
  const years = s.match(/(\d+(?:\.\d+)?)\s*years?/);
  if (years) {
    const n = Number(years[1]);
    if (n >= 3) return "advanced";
    if (n >= 1) return "intermediate";
    return "beginner";
  }
  return "beginner";
}

// Collect free-text injury history from health_flags. The interview stores a
// health disclosure at health_flags.interview {categories, matched, excerpt}; an
// explicit health_flags.injuries array (future intake) is also honored.
function gatherInjuries(healthFlags: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (Array.isArray(healthFlags.injuries)) {
    for (const v of healthFlags.injuries) if (typeof v === "string") out.push(v);
  }
  const interview = asRecord(healthFlags.interview);
  const categories = Array.isArray(interview.categories) ? interview.categories : [];
  if (categories.includes("injury")) {
    if (typeof interview.excerpt === "string") out.push(interview.excerpt);
    if (Array.isArray(interview.matched)) {
      for (const m of interview.matched) if (typeof m === "string") out.push(m);
    }
  }
  return out;
}

export function parseTrainingIntake(
  rawIntake: unknown,
  rawHealthFlags?: unknown,
): ParseTrainingResult {
  const intake = asRecord(rawIntake);
  const stageB = asRecord(intake.stage_b);
  const training = asRecord(stageB.training);
  const healthFlags = asRecord(rawHealthFlags);

  const daysRaw =
    typeof training.daysPerWeek === "number"
      ? training.daysPerWeek
      : typeof intake.trainingDaysPerWeek === "number"
        ? intake.trainingDaysPerWeek
        : undefined;

  const issues: string[] = [];
  if (daysRaw === undefined || !Number.isFinite(daysRaw)) {
    issues.push("training.daysPerWeek: missing");
  } else if (daysRaw < 1 || daysRaw > 7) {
    issues.push(`training.daysPerWeek: must be 1–7, got ${daysRaw}`);
  }
  if (issues.length) return { ok: false, issues };

  const equipmentText =
    typeof training.equipmentAccess === "string" ? training.equipmentAccess : "";
  const experienceText =
    typeof training.experience === "string" ? training.experience : undefined;

  return {
    ok: true,
    intake: {
      daysPerWeek: daysRaw as number,
      equipment: normalizeEquipmentAccess(equipmentText),
      experience: normalizeExperience(experienceText),
      goal: typeof intake.goal === "string" ? intake.goal : undefined,
      injuries: gatherInjuries(healthFlags),
    },
  };
}
