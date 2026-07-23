// Diet-pipeline schemas + typed handoffs (Phase 4.2). The agents SELECT and
// STRUCTURE; every number is computed and checked in code (nutrition-engine).
// Each agent's Zod schema doubles as its extraction contract (fields .describe()d
// so the model knows what each means).

import { z } from "zod";

import type {
  Constraints,
  DayTypeTarget,
  FoodMacroRow,
  PlannedDayType,
  TargetResult,
} from "@supertrainer/nutrition-engine";

import type { DietProfile } from "../style/schemas";

// ── Structure agent output: a meal skeleton per day type ──────────────────────
export const DaySkeletonSchema = z.object({
  dayType: z.string().describe("day-type name this skeleton is for (e.g. standard / high / low)"),
  slots: z
    .array(
      z.object({
        slot: z.string().describe("meal slot name: breakfast | lunch | dinner | snack"),
        timing: z.string().optional().describe("target clock time HH:MM, from the client's meal times"),
        cuisineIntent: z
          .string()
          .optional()
          .describe("a dish idea or cuisine for this slot, honoring the trainer's structure"),
      }),
    )
    .describe("ordered meal slots for this day type"),
});
export type DaySkeleton = z.infer<typeof DaySkeletonSchema>;

export const StructureOutputSchema = z.object({
  dayTypes: z.array(DaySkeletonSchema).describe("one skeleton per requested day type"),
});

// ── Recipe agent output: planned meals (food_id + grams), 2 versions ──────────
export const PlannedItemSchema = z.object({
  food_id: z.string().describe("MUST be an id from the provided food pool — never invent one"),
  grams: z.number().describe("gram weight of this food; you pick the weight, code computes the macros"),
});
export const PlannedMealSchema = z.object({
  slot: z.string().describe("the meal slot this fills"),
  items: z.array(PlannedItemSchema).describe("foods in this meal"),
  prepNote: z.string().optional().describe("one short line on how to prepare it"),
});
export const PlannedDayTypeSchema = z.object({
  name: z.string().describe("day-type name (matches a skeleton dayType)"),
  meals: z.array(PlannedMealSchema),
});
export const PlanVersionSchema = z.object({
  label: z.string().describe("a short label, e.g. 'Version A'"),
  dayTypes: z.array(PlannedDayTypeSchema),
});
export type PlanVersion = z.infer<typeof PlanVersionSchema>;

export const RecipeOutputSchema = z.object({
  versions: z
    .array(PlanVersionSchema)
    .describe("exactly two distinct plan versions with the same targets but different food rotations"),
});

// ── Review agent output ───────────────────────────────────────────────────────
export const ReviewCritiqueSchema = z.object({
  styleMatchScore: z
    .number()
    .describe("0-100: how well the plan matches the trainer's style profile"),
  practicalityFlags: z
    .array(z.string())
    .describe("practical concerns for the trainer, e.g. 'dinner needs 45min prep'"),
  varietyNotes: z.string().describe("one note on food variety/repetition across the week"),
});
export type ReviewCritique = z.infer<typeof ReviewCritiqueSchema>;

// ── Food candidate injected into the recipe agent (the model only sees this) ──
export interface FoodCandidate {
  id: string;
  name: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  cuisineTags?: string[];
}

// ── Typed agent I/O (the pipeline's handoffs) ─────────────────────────────────
export interface StructureAgentInput {
  targets: TargetResult;
  constraints: Constraints;
  styleProfile?: DietProfile;
}
export interface RecipeAgentInput {
  skeletons: DaySkeleton[];
  candidates: FoodCandidate[];
  targets: DayTypeTarget[];
  constraints: Constraints;
  /** Validator feedback from a failed first pass, injected on the single retry. */
  feedback?: string;
}
export interface ReviewAgentInput {
  plan: PlanVersion;
  styleProfile?: DietProfile;
}

export type StructureAgent = (input: StructureAgentInput) => Promise<DaySkeleton[]>;
export type RecipeAgent = (input: RecipeAgentInput) => Promise<PlanVersion[]>;
export type ReviewAgent = (input: ReviewAgentInput) => Promise<ReviewCritique>;

// A food row carrying its display name, for the pipeline pool (validator uses
// the macro/allergen fields; the recipe candidates use id+name+macros).
export type PoolFood = FoodMacroRow & { name: string; cuisine_tags?: string[] };

// PlanVersion is shape-compatible with nutrition-engine's PlanVersionInput; this
// documents the intent that a validated version is a PlannedDayType[] carrier.
export type ValidatedDayTypes = PlannedDayType[];
