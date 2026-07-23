// @supertrainer/ai split-pipeline (Phase 5.2) — the multi-agent split generation
// pipeline: structure → selection → coded validate+retry → deterministic
// fallback → review. Agents are pure (data in, Zod-validated structured output
// out); the orchestrator is injectable so CI drives it deterministically and
// production passes the live agents. Mirrors diet-pipeline.

import { exerciseSelectionAgent } from "./selection-agent";
import { splitReviewAgent } from "./review-agent";
import { splitStructureAgent } from "./structure-agent";
import type { SplitPlanDeps } from "./orchestrator";

export { splitStructureAgent } from "./structure-agent";
export { exerciseSelectionAgent } from "./selection-agent";
export { splitReviewAgent } from "./review-agent";
export {
  generateSplit,
  type SplitPlanContext,
  type SplitPlanDeps,
  type SplitPlanResult,
} from "./orchestrator";
export * from "./schemas";
export { GOLDEN_SPLIT_INTAKES, type GoldenSplitIntake } from "./fixtures";

/** The production dependency set — the live LLM agents. */
export const realSplitAgents: SplitPlanDeps = {
  structure: splitStructureAgent,
  selection: exerciseSelectionAgent,
  review: splitReviewAgent,
};
