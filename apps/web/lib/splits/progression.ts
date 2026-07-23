// Monthly progression context + application (Phase 5.4). Reads the client's
// active split + the last 28 days of workout_logs into the coded progression
// engine's inputs (all arithmetic in code — rule 4), then applies the per-exercise
// proposals to produce the next draft's days. Non-logging clients yield thin
// contexts → the engine's conservative hold. Mirrors lib/plans/adjust-context.ts.

import {
  parseRepTop,
  proposeProgression,
  type ExerciseSession,
  type ProgressionContext,
  type ProgressionProposal,
  type ProgressionStyle,
  type SplitDay,
} from "@supertrainer/training-engine";
import type { Database } from "@supertrainer/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

const CYCLE_DAYS = 28;

interface ActiveExerciseLite {
  exercise_id: string;
  name: string;
  target_sets: number;
  target_reps: string;
}

// Build a per-exercise progression context from the active split + logged sets.
export async function compileProgressionContext(
  service: ServiceClient,
  clientId: string,
  orgId: string,
  asOf: Date,
): Promise<{ contexts: ProgressionContext[]; activeSplitId: string | null } | null> {
  const { data: active } = await service
    .from("splits_active")
    .select("org_id, split_id, days")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!active || active.org_id !== orgId) return null;

  // Flatten the active split's day map → the prescribed exercises.
  const prescribed = new Map<string, ActiveExerciseLite>();
  const dayMap = (active.days ?? {}) as unknown as Record<string, ActiveExerciseLite[]>;
  for (const list of Object.values(dayMap)) {
    for (const e of list ?? []) if (!prescribed.has(e.exercise_id)) prescribed.set(e.exercise_id, e);
  }

  const since = new Date(asOf.getTime() - CYCLE_DAYS * 86400000).toISOString().slice(0, 10);
  const { data: logs } = await service
    .from("workout_logs")
    .select("exercise_id, tz_date, weight_kg, reps")
    .eq("client_id", clientId)
    .gte("tz_date", since)
    .order("tz_date", { ascending: true });

  // Per exercise per day, keep the TOP set (heaviest; ties → most reps).
  const topByExDate = new Map<string, ExerciseSession>();
  for (const l of logs ?? []) {
    if (l.weight_kg == null || l.reps == null) continue;
    const key = `${l.exercise_id}|${l.tz_date}`;
    const existing = topByExDate.get(key);
    if (
      !existing ||
      l.weight_kg > existing.weightKg ||
      (l.weight_kg === existing.weightKg && l.reps > existing.reps)
    ) {
      topByExDate.set(key, { tzDate: l.tz_date, weightKg: l.weight_kg, reps: l.reps });
    }
  }
  const sessionsByEx = new Map<string, ExerciseSession[]>();
  for (const [key, s] of topByExDate) {
    const exId = key.split("|")[0];
    (sessionsByEx.get(exId) ?? sessionsByEx.set(exId, []).get(exId)!).push(s);
  }
  for (const list of sessionsByEx.values()) list.sort((a, b) => a.tzDate.localeCompare(b.tzDate));

  const contexts: ProgressionContext[] = [];
  for (const [exId, ex] of prescribed) {
    contexts.push({
      exerciseId: exId,
      name: ex.name,
      sessions: sessionsByEx.get(exId) ?? [],
      currentSets: ex.target_sets,
      repTop: parseRepTop(ex.target_reps),
    });
  }
  return { contexts, activeSplitId: active.split_id };
}

export interface ProgressionResult {
  days: SplitDay[];
  proposals: ProgressionProposal[];
}

// Apply the coded proposals to the current split days. add_set changes structure
// (sets+1); load/deload/rotate/reps changes ride as reasons the trainer applies
// (the split stores sets/reps/RIR, not absolute loads). Returns the next draft's
// days + the full proposal list for the review surface's per-exercise diff.
export function applyProgression(
  currentDays: SplitDay[],
  contexts: ProgressionContext[],
  style: ProgressionStyle,
): ProgressionResult {
  const proposals = contexts.map((c) => proposeProgression(c, style));
  const byId = new Map(proposals.map((p) => [p.exerciseId, p]));
  const days: SplitDay[] = currentDays.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const p = byId.get(ex.exercise_id);
      if (!p) return ex;
      const tip = p.reason;
      if (p.changeKind === "add_set") {
        return { ...ex, sets: p.newSets, tips: tip };
      }
      // Non-structural changes: surface the reasoning as the coaching cue.
      return { ...ex, tips: tip };
    }),
  }));
  return { days, proposals };
}
