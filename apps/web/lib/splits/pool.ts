// The split pool compiler (Phase 5.2) — the coded step 0 of the pipeline map:
// exercise catalog ∩ equipment access ∩ experience gate, MINUS the injury
// exclusions (packages/ai filterExercisePool), producing the injury-safe
// candidate pool the selection agent may draw from. The injury filter runs in
// code BEFORE the model, exactly like the allergen net on the diet side — an
// excluded exercise can never reach the model, and the orchestrator re-checks
// every returned id against this pool (validate-after).

import { filterExercisePool, type ExerciseCandidate } from "@supertrainer/ai";
import type { ExperienceLevel, MovementPattern } from "@supertrainer/training-engine";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@supertrainer/db/types";

type ServiceClient = SupabaseClient<Database>;

export const POOL_EXERCISE_COLUMNS =
  "id, name, name_normalized, primary_muscles, secondary_muscles, movement_patterns, equipment, experience_min";

// Experience is a CEILING: a beginner sees only beginner lifts; an advanced
// client sees everything.
const EXPERIENCE_LADDER: Record<ExperienceLevel, ExperienceLevel[]> = {
  beginner: ["beginner"],
  intermediate: ["beginner", "intermediate"],
  advanced: ["beginner", "intermediate", "advanced"],
};

// The catalog row shape the pool compiler reads (carries what the injury filter
// + volume math + selection agent need).
interface PoolExerciseRow {
  id: string;
  name: string;
  name_normalized: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  movement_patterns: MovementPattern[];
  equipment: string[];
  experience_min: ExperienceLevel;
}

export interface CompiledSplitPool {
  pool: ExerciseCandidate[];
  // Auto-excluded exercises (for the P5.3 injury banner: what & why).
  excluded: { id: string; name: string; reasons: string[] }[];
  cautionCount: number;
}

// Compile the injury-safe candidate pool for a client. `overriddenIds` are
// exercises the trainer has explicitly un-excluded via the audited path (P5.1);
// they re-enter the pool flagged caution.
export async function compileSplitPool(
  service: ServiceClient,
  orgId: string,
  equipment: string[],
  experience: ExperienceLevel,
  injuries: string[],
  overriddenIds?: Set<string>,
): Promise<CompiledSplitPool> {
  const allowedLevels = EXPERIENCE_LADDER[experience];
  const { data, error } = await service
    .from("exercises")
    .select(POOL_EXERCISE_COLUMNS)
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .overlaps("equipment", equipment.length ? equipment : ["bodyweight"])
    .in("experience_min", allowedLevels);
  if (error) throw error;

  // Only strength-programmable rows: stretch/cardio/mobility have [] patterns and
  // are never selectable as a working set.
  const rows = ((data ?? []) as unknown as PoolExerciseRow[]).filter(
    (r) => Array.isArray(r.movement_patterns) && r.movement_patterns.length > 0,
  );

  const { allowed, excluded } = filterExercisePool(rows, injuries, {
    overriddenIds,
    idOf: (r) => r.id,
  });

  const pool: ExerciseCandidate[] = allowed.map((a) => ({
    id: a.exercise.id,
    name: a.exercise.name,
    primary_muscles: a.exercise.primary_muscles,
    secondary_muscles: a.exercise.secondary_muscles,
    movement_patterns: a.exercise.movement_patterns,
    equipment: a.exercise.equipment,
    experience_min: a.exercise.experience_min,
    ...(a.caution ? { caution: true, cautionReasons: a.reasons } : {}),
  }));

  return {
    pool,
    excluded: excluded.map((e) => ({ id: e.exercise.id, name: e.exercise.name, reasons: e.reasons })),
    cautionCount: pool.filter((p) => p.caution).length,
  };
}
