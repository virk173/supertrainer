// Diet-pipeline orchestrator (Phase 4.2). Sequences structure → recipe →
// (coded validate + one retry) → review, with typed handoffs. The AGENTS are
// injectable (DietPlanDeps) so the merge-gating CI test drives the real control
// flow with deterministic stand-ins, and production passes the live LLM agents.
// Every number is checked in code (validatePlanVersion) — the model never does
// arithmetic (CLAUDE.md rule 4), and every planned food is re-checked against the
// safe pool + allergen tags (validate-after, mirroring the preview generator).

import {
  assembleMeals,
  fitPortions,
  validatePlanVersion,
  type Constraints,
  type DayTypeTarget,
  type FoodMacroRow,
  type PlanProtocol,
  type PlannedDayType,
  type PlanVersionInput,
  type TargetResult,
  type ValidationResult,
} from "@supertrainer/nutrition-engine";

import type { DietProfile } from "../style/schemas";
import type {
  FoodCandidate,
  PlanVersion,
  PoolFood,
  RecipeAgent,
  ReviewAgent,
  ReviewCritique,
  StructureAgent,
} from "./schemas";

export interface DietPlanContext {
  targets: TargetResult;
  constraints: Constraints;
  styleProfile?: DietProfile;
  /** The allergen + diet-filtered safe pool (built by the caller). */
  pool: PoolFood[];
  /** Canonical allergen tags to exclude (backstop re-check in the validator). */
  excludedAllergenTags: string[];
}

export interface DietPlanDeps {
  structure: StructureAgent;
  recipe: RecipeAgent;
  review: ReviewAgent;
}

export interface ValidatedVersion {
  label: string;
  dayTypes: PlannedDayType[];
  validation: ValidationResult;
  /** True if ≥1 day type fell back to the deterministic fill (LLM couldn't hit). */
  autofilled?: boolean;
}

export interface DietPlanResult {
  status: "draft" | "needs_attention";
  versions: ValidatedVersion[];
  critique: ReviewCritique | null;
  protocol: PlanProtocol;
  fastWindow?: TargetResult["fastWindow"];
  report: string;
  retried: boolean;
}

const MIN_GRAMS = 1;
const MAX_GRAMS = 1000;

function poolToCandidates(pool: PoolFood[]): FoodCandidate[] {
  return pool.map((f) => ({
    id: f.id,
    name: f.name,
    kcalPer100g: f.kcal_per_100g,
    proteinPer100g: f.protein_per_100g,
    carbsPer100g: f.carbs_per_100g,
    fatPer100g: f.fat_per_100g,
    cuisineTags: f.cuisine_tags,
  }));
}

// Validate-after: keep only items whose food_id is in the safe pool, dedupe
// within a meal, clamp grams. A hallucinated or unsafe id can never survive.
function sanitizeVersion(version: PlanVersion, poolIds: Set<string>): PlanVersionInput {
  return {
    label: version.label,
    dayTypes: version.dayTypes.map((dt) => ({
      name: dt.name,
      meals: dt.meals.map((meal) => {
        const items: { food_id: string; grams: number }[] = [];
        const seen = new Set<string>();
        for (const it of meal.items) {
          if (!poolIds.has(it.food_id) || seen.has(it.food_id)) continue;
          seen.add(it.food_id);
          items.push({
            food_id: it.food_id,
            grams: Math.max(MIN_GRAMS, Math.min(MAX_GRAMS, Math.round(it.grams))),
          });
        }
        return { slot: meal.slot, items, ...(meal.prepNote ? { prepNote: meal.prepNote } : {}) };
      }),
    })),
  };
}

const countValid = (vs: ValidatedVersion[]) => vs.filter((v) => v.validation.ok).length;

export async function generateDietPlan(
  ctx: DietPlanContext,
  deps: DietPlanDeps,
): Promise<DietPlanResult> {
  const poolMap = new Map<string, FoodMacroRow>(ctx.pool.map((f) => [f.id, f]));
  const poolIds = new Set(poolMap.keys());
  const targets = ctx.targets.dayTypes;
  const candidates = poolToCandidates(ctx.pool);

  const skeletons = await deps.structure({
    targets: ctx.targets,
    constraints: ctx.constraints,
    styleProfile: ctx.styleProfile,
  });

  const targetByName = new Map<string, DayTypeTarget>(targets.map((t) => [t.name, t]));
  // Code fits the grams on the model's food choices so each day type lands on
  // its kcal/protein target (rule 4 — the model selects, code computes).
  const fitVersion = (sanitized: PlanVersionInput): PlanVersionInput => ({
    label: sanitized.label,
    dayTypes: sanitized.dayTypes.map((dt) => {
      const target = targetByName.get(dt.name);
      if (!target) return dt;
      return {
        name: dt.name,
        meals: fitPortions(dt.meals, { kcal: target.kcal, protein_g: target.protein_g }, poolMap),
      };
    }),
  });

  const validateAll = (versions: PlanVersion[]): ValidatedVersion[] =>
    versions.map((v) => {
      const fitted = fitVersion(sanitizeVersion(v, poolIds));
      return {
        label: fitted.label,
        dayTypes: fitted.dayTypes,
        validation: validatePlanVersion(fitted, targets, poolMap, ctx.excludedAllergenTags),
      };
    });

  let versions = await deps.recipe({ skeletons, candidates, targets, constraints: ctx.constraints });
  let validated = validateAll(versions);
  let retried = false;

  // Retry the recipe ONCE if not every version validates, feeding back the exact
  // gaps ("day type X: protein 143g vs target 160g …"). Keep the better attempt.
  if (countValid(validated) < validated.length) {
    const feedback = validated
      .filter((v) => !v.validation.ok)
      .map((v) => v.validation.feedback)
      .filter(Boolean)
      .join("\n");
    retried = true;
    const retryVersions = await deps.recipe({
      skeletons,
      candidates,
      targets,
      constraints: ctx.constraints,
      feedback,
    });
    const retryValidated = validateAll(retryVersions);
    if (countValid(retryValidated) >= countValid(validated)) validated = retryValidated;
  }

  // Guarantee a usable draft: any day type still off-target gets the deterministic
  // fill (assembleMeals always hits when the pool can). The trainer refines it in
  // review (P4.3). needs_attention is reserved for a pool that genuinely can't
  // meet the targets — this is a deliberate improvement over blocking the trainer.
  const slotsFor = (name: string): string[] => {
    const sk = skeletons.find((s) => s.dayType === name);
    const slots = sk?.slots.map((s) => s.slot) ?? [];
    return slots.length ? slots : Array.from({ length: ctx.constraints.mealsPerDay }, (_, i) => `meal${i + 1}`);
  };
  validated = validated.map((vv) => {
    if (vv.validation.ok) return vv;
    let autofilled = false;
    const dayTypes: PlannedDayType[] = vv.dayTypes.map((dt) => {
      const dtVal = vv.validation.dayTypes.find((d) => d.dayType === dt.name);
      const target = targetByName.get(dt.name);
      if (dtVal?.ok || !target) return dt;
      autofilled = true;
      return { name: dt.name, meals: assembleMeals(ctx.pool, { kcal: target.kcal, protein_g: target.protein_g }, slotsFor(dt.name)) };
    });
    const fixed: PlanVersionInput = { label: vv.label, dayTypes };
    return {
      label: vv.label,
      dayTypes,
      validation: validatePlanVersion(fixed, targets, poolMap, ctx.excludedAllergenTags),
      autofilled,
    };
  });

  const best = validated.find((v) => v.validation.ok);
  const status: DietPlanResult["status"] = best ? "draft" : "needs_attention";
  const report = validated
    .filter((v) => !v.validation.ok)
    .map((v) => `${v.label}:\n${v.validation.feedback}`)
    .join("\n\n");

  // Review only a valid version (nothing to critique if none passed).
  let critique: ReviewCritique | null = null;
  if (best) {
    critique = await deps.review({
      plan: { label: best.label, dayTypes: best.dayTypes },
      styleProfile: ctx.styleProfile,
    });
  }

  return {
    status,
    versions: validated,
    critique,
    protocol: ctx.targets.protocol,
    ...(ctx.targets.fastWindow ? { fastWindow: ctx.targets.fastWindow } : {}),
    report,
    retried,
  };
}
