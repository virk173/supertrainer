// @supertrainer/training-engine — coded volume / balance / validation math for
// training splits (Phase 5.2), the training-side mirror of nutrition-engine.
// Pure, zero AI imports, zero DB access: every set/volume/balance number a split
// is validated against is computed here, never by the model (CLAUDE.md rule 4).

export * from "./types";
export {
  labelFrequency,
  daySetsPerMuscle,
  weeklySetVolume,
  pushPullBalance,
  consecutiveMuscleOverlap,
  type PushPullBalance,
} from "./volume";
export {
  muscleBounds,
  validateSplit,
  buildExerciseIndex,
  type SplitValidationIssue,
  type SplitValidationResult,
} from "./validator";
export { assembleSplitDay, type MuscleTarget } from "./assemble";
export {
  buildWeeklySchedule,
  buildDefaultSkeleton,
  type Skeleton,
  type SkeletonDay,
  type SkeletonMuscleTarget,
} from "./skeleton";
export {
  parseTrainingIntake,
  normalizeEquipmentAccess,
  normalizeExperience,
  type ParseTrainingResult,
} from "./parse";
export {
  estimated1RM,
  parseRepTop,
  proposeProgression,
  type ProgressionStyle,
  type ExerciseSession,
  type ProgressionContext,
  type ProgressionKind,
  type ProgressionProposal,
} from "./progression";
