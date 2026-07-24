// Phase 2.5's health-flag gate was ABSORBED into the Phase 6.3 comms-router
// (docs/plan/PHASE-6 §6.3). This module now re-exports it so every P2.5 call site
// (the interview engine's detectHealthFlags, interview.spec's keywordHealthFlags)
// keeps working unchanged. New code should import from ./comms-router directly.
export {
  HEALTH_FLAG_CATEGORIES,
  keywordHealthFlags,
  detectHealthFlags,
  type HealthFlagCategory,
  type HealthFlagResult,
} from "./comms-router/health";
