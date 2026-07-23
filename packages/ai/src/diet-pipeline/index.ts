// @supertrainer/ai diet-pipeline (Phase 4.2) — the multi-agent generation
// pipeline: structure → recipe → coded validate+retry → review. Agents are pure
// (data in, Zod-validated structured output out); the orchestrator is injectable
// so CI drives it deterministically and production passes the live agents.

import { recipeAgent } from "./recipe-agent";
import { reviewAgent } from "./review-agent";
import { structureAgent } from "./structure-agent";
import type { DietPlanDeps } from "./orchestrator";

export { structureAgent } from "./structure-agent";
export { recipeAgent } from "./recipe-agent";
export { reviewAgent } from "./review-agent";
export { generateDietPlan } from "./orchestrator";
export type {
  DietPlanContext,
  DietPlanDeps,
  DietPlanResult,
  ValidatedVersion,
} from "./orchestrator";
export * from "./schemas";
export { GOLDEN_INTAKES, type GoldenIntake } from "./fixtures";

/** The production dependency set — the live LLM agents. */
export const realDietAgents: DietPlanDeps = {
  structure: structureAgent,
  recipe: recipeAgent,
  review: reviewAgent,
};
