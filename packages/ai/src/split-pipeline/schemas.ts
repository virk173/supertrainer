// Split-pipeline schemas + typed handoffs (Phase 5.2). The agents SELECT and
// STRUCTURE; every set/volume/balance number is computed and checked in code
// (training-engine). Each agent's Zod schema doubles as its extraction contract.
// Mirrors diet-pipeline/schemas.ts.

import { z } from "zod";

import type {
  ExperienceLevel,
  ExerciseMeta,
  Skeleton,
  SplitDay,
  StyleVolumeBounds,
} from "@supertrainer/training-engine";

import type { TrainingProfile } from "../style/schemas";

// ── Structure agent output: the split skeleton (archetype + day muscle targets)─
export const SkeletonMuscleTargetSchema = z.object({
  muscle: z.string().describe("normalized muscle group, e.g. chest / lats / quads / hamstrings"),
  sets: z.number().describe("per-DAY working sets to allocate to this muscle on this day"),
});
export const SkeletonDaySchema = z.object({
  label: z.string().describe("the day label, e.g. 'Push', 'Upper A', 'Full Body'"),
  focus: z.string().describe("one-line focus of the day"),
  muscleTargets: z.array(SkeletonMuscleTargetSchema).describe("per-muscle per-day set targets"),
});
export const SplitSkeletonSchema = z.object({
  archetype: z.string().describe("the split archetype name, e.g. 'push/pull/legs', from the trainer's style"),
  days: z.array(SkeletonDaySchema).describe("one entry per DISTINCT training day label"),
});
export type SplitSkeleton = z.infer<typeof SplitSkeletonSchema>;

// ── Selection agent output: prescribed exercises per day (ids from pool ONLY) ──
export const PlannedExerciseSchema = z.object({
  exercise_id: z.string().describe("MUST be an id from the provided exercise pool — never invent one"),
  sets: z.number().describe("number of working sets"),
  reps: z.string().describe("a rep range as text, e.g. '8-12' (do not compute anything)"),
  rir: z.number().describe("reps-in-reserve target for the working sets"),
  tips: z.string().optional().describe("one short coaching cue for this exercise"),
});
export const SplitDayDraftSchema = z.object({
  label: z.string().describe("matches a skeleton day label"),
  exercises: z.array(PlannedExerciseSchema),
  warmup: z.string().optional().describe("a short warmup block for this day"),
});
export const SplitDraftSchema = z.object({
  days: z.array(SplitDayDraftSchema).describe("one filled day per skeleton day"),
});
export type SplitDraft = z.infer<typeof SplitDraftSchema>;

// ── Review agent output ───────────────────────────────────────────────────────
export const SplitReviewCritiqueSchema = z.object({
  styleMatchScore: z
    .number()
    .describe("0-100: how well the split matches the trainer's programming style"),
  practicalityFlags: z
    .array(z.string())
    .describe("practical concerns, e.g. 'leg day is 90 min for a 45-min slot'"),
  balanceNotes: z.string().describe("one note on movement/volume balance across the week"),
});
export type SplitReviewCritique = z.infer<typeof SplitReviewCritiqueSchema>;

// ── Exercise candidate injected into the selection agent (the model only sees
// the injury-safe pool) ──────────────────────────────────────────────────────
export interface ExerciseCandidate extends ExerciseMeta {
  equipment: string[];
  experience_min: ExperienceLevel;
  // Set by the pool compiler when the exercise is allowed-but-flagged for an
  // injured client; the model should prefer non-caution options.
  caution?: boolean;
  cautionReasons?: string[];
}

// ── Typed agent I/O (the pipeline's handoffs) ─────────────────────────────────
export interface SplitStructureInput {
  availability: { daysPerWeek: number };
  experience: ExperienceLevel;
  goal?: string;
  styleProfile?: TrainingProfile;
}
export interface SplitSelectionInput {
  skeleton: SplitSkeleton;
  candidates: ExerciseCandidate[];
  styleProfile?: TrainingProfile;
  /** Validator feedback from a failed first pass, injected on the single retry. */
  feedback?: string;
}
export interface SplitReviewInput {
  days: SplitDay[];
  archetype: string;
  styleProfile?: TrainingProfile;
}

export type SplitStructureAgent = (input: SplitStructureInput) => Promise<SplitSkeleton>;
export type SplitSelectionAgent = (input: SplitSelectionInput) => Promise<SplitDraft>;
export type SplitReviewAgent = (input: SplitReviewInput) => Promise<SplitReviewCritique>;

// Re-export the engine types the orchestrator threads through, for convenience.
export type { Skeleton, StyleVolumeBounds };
