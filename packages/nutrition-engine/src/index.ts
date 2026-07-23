// @supertrainer/nutrition-engine — coded TDEE/macro calculation + constraint
// compiler (Phase 4.1). Pure, zero AI imports, zero DB access: the deterministic
// numbers a diet plan is built on (CLAUDE.md rule 4). The P4.2 pipeline consumes
// these outputs and the P4.2 validator recomputes against them.

export * from "./types";
export { mifflinStJeorBMR, activityFactor, tdee } from "./tdee";
export { calculateTargets } from "./targets";
export { compileConstraints } from "./constraints";
export { parseIntake, type ParseIntakeResult } from "./parse";
