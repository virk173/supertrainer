export { getClaudeClient } from "./claude";
export {
  MODEL_IDS,
  modelRouter,
  type AiTask,
  type ModelId,
} from "./modelRouter";
export {
  zodOutput,
  AiOutputValidationError,
  type ZodOutputParams,
} from "./zodOutput";
export {
  AiDegradedError,
  CircuitBreaker,
  callWithResilience,
  classifyAiError,
  fallbackModelFor,
  isAiApiError,
  isAiDegraded,
  isFallbackEligible,
  isRetryable,
  resetAiCircuitForTests,
  type AiErrorKind,
} from "./resilience";
export {
  flushTracing,
  withAiTask,
  withPlanTrace,
  currentAiTask,
  recordGeneration,
  type GenerationRecord,
} from "./tracing";
export {
  dietStyleExtractor,
  trainingStyleExtractor,
  voiceStyleExtractor,
  extractStyleProfile,
} from "./style/extractors";
export { visionExtractText, type VisionMediaType } from "./style/vision";
export {
  serializeStyleProfile,
  serializeConfirmedStyles,
  STYLE_DOMAINS,
  type ConfirmedStyleRow,
} from "./style/serialize";
export {
  mapColumns,
  IMPORT_FIELDS,
  ColumnMappingSchema,
  type ImportField,
  type ColumnMapping,
} from "./import/mapColumns";
export {
  type AllergenTag,
  ALLERGEN_TAGS,
  type FoodLike,
  excludedAllergenTags,
  isFoodSafe,
  filterSafeFoods,
  allergenLabels,
} from "./allergens";
export {
  type MovementPattern,
  type InjuryTag,
  INJURY_TAGS,
  type ExerciseLike,
  type ExclusionStatus,
  type ExclusionReason,
  type ExclusionVerdict,
  type AssessedExercise,
  type FilteredPool,
  resolveInjuryTags,
  assessExercise,
  filterExercisePool,
  injuryLabels,
} from "./injury-exclusions";
export {
  PreviewDraftSchema,
  type PreviewDraft,
  type PreviewCandidate,
  type PreviewAgentInput,
  generatePreviewDraft,
} from "./preview";
export {
  type HealthFlagCategory,
  HEALTH_FLAG_CATEGORIES,
  type HealthFlagResult,
  keywordHealthFlags,
  detectHealthFlags,
} from "./escalation";
export {
  ClientBriefSchema,
  type ClientBrief,
  type ClientBriefInput,
  generateClientBrief,
} from "./brief";
export {
  LEAD_INTENT_BANDS,
  LeadIntentSchema,
  type LeadIntent,
  type LeadIntentInput,
  scoreLeadIntent,
} from "./leadIntent";
export {
  INTERVIEW_SECTIONS,
  SECTION_DAY,
  SECTION_SCHEMAS,
  type InterviewSection,
  type SectionAnswers,
  type InterviewTurnInput,
  type InterviewTurnOutput,
  interviewTurn,
  isSectionComplete,
  nextSection,
  isInterviewComplete,
} from "./interview";
export {
  StyleDomain,
  DietProfileSchema,
  TrainingProfileSchema,
  VoiceProfileSchema,
  PROFILE_SCHEMAS,
  type DietProfile,
  type TrainingProfile,
  type VoiceProfile,
  type StyleProfileByDomain,
} from "./style/schemas";
export {
  ParsedMealItemSchema,
  ParsedMealSchema,
  type ParsedMealItem,
  type ParsedMeal,
  parseMealText,
  proposeMealFromPhoto,
} from "./meal";
export {
  type SttMediaType,
  SttNotConfiguredError,
  transcribeAudio,
  isSttConfigured,
} from "./voice";
export {
  structureAgent,
  recipeAgent,
  reviewAgent,
  generateDietPlan,
  realDietAgents,
  DaySkeletonSchema,
  StructureOutputSchema,
  PlanVersionSchema,
  RecipeOutputSchema,
  ReviewCritiqueSchema,
  type DaySkeleton,
  type PlanVersion,
  type ReviewCritique,
  type FoodCandidate,
  type PoolFood,
  type StructureAgent,
  type RecipeAgent,
  type ReviewAgent,
  type StructureAgentInput,
  type RecipeAgentInput,
  type ReviewAgentInput,
  type DietPlanContext,
  type DietPlanDeps,
  type DietPlanResult,
  type ValidatedVersion,
  GOLDEN_INTAKES,
  type GoldenIntake,
} from "./diet-pipeline";
export {
  splitStructureAgent,
  exerciseSelectionAgent,
  splitReviewAgent,
  generateSplit,
  realSplitAgents,
  SplitSkeletonSchema,
  SkeletonDaySchema,
  SplitDraftSchema,
  SplitDayDraftSchema,
  PlannedExerciseSchema,
  SplitReviewCritiqueSchema,
  type SplitSkeleton,
  type SplitDraft,
  type SplitReviewCritique,
  type ExerciseCandidate,
  type SplitStructureAgent,
  type SplitSelectionAgent,
  type SplitReviewAgent,
  type SplitStructureInput,
  type SplitSelectionInput,
  type SplitReviewInput,
  type SplitPlanContext,
  type SplitPlanDeps,
  type SplitPlanResult,
  GOLDEN_SPLIT_INTAKES,
  type GoldenSplitIntake,
} from "./split-pipeline";
