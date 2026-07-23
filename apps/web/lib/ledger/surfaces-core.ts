import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveCheckinStatus, type CheckinStatus } from "./checkin";

// Phase 3.3 — core writes for the logging surfaces (weigh-ins, check-ins,
// working sets, steps/sleep, progress photos). Each UPSERTS on the table's
// natural key, so an offline write replayed on reconnect is an idempotent no-op
// rather than a duplicate row (the offline queue's correctness rests on this).
// These take the db client explicitly so the server actions and the tests share
// the exact same write path.

export interface SurfaceCtx {
  orgId: string;
  clientId: string;
  tzDate: string;
}

export interface WorkoutSetInput {
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  weightKg?: number | null;
  reps?: number | null;
  rpe?: number | null;
}

export async function upsertWeighIn(
  db: SupabaseClient,
  ctx: SurfaceCtx,
  input: { weightKg: number; method: "prompt_reply" | "manual" },
): Promise<void> {
  const { error } = await db.from("weigh_ins").upsert(
    {
      org_id: ctx.orgId,
      client_id: ctx.clientId,
      tz_date: ctx.tzDate,
      weight_kg: input.weightKg,
      method: input.method,
    },
    { onConflict: "client_id,tz_date" },
  );
  if (error) throw error;
}

export async function hasWorkoutSets(
  db: SupabaseClient,
  clientId: string,
  tzDate: string,
): Promise<boolean> {
  const { count, error } = await db
    .from("workout_logs")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("tz_date", tzDate);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// Upsert the check-in, applying the auto-satisfy rule (working sets that day ->
// 'trained' regardless of the requested status). Returns the stored status.
export async function upsertCheckin(
  db: SupabaseClient,
  ctx: SurfaceCtx,
  requested: CheckinStatus | null,
): Promise<CheckinStatus> {
  const status = resolveCheckinStatus(
    requested,
    await hasWorkoutSets(db, ctx.clientId, ctx.tzDate),
  );
  const { error } = await db.from("gym_checkins").upsert(
    { org_id: ctx.orgId, client_id: ctx.clientId, tz_date: ctx.tzDate, status },
    { onConflict: "client_id,tz_date" },
  );
  if (error) throw error;
  return status;
}

export async function upsertWorkoutSets(
  db: SupabaseClient,
  ctx: SurfaceCtx,
  sets: WorkoutSetInput[],
): Promise<void> {
  if (sets.length === 0) return;
  const rows = sets.map((s) => ({
    org_id: ctx.orgId,
    client_id: ctx.clientId,
    tz_date: ctx.tzDate,
    exercise_id: s.exerciseId,
    exercise_name: s.exerciseName,
    set_number: s.setNumber,
    weight_kg: s.weightKg ?? null,
    reps: s.reps ?? null,
    rpe: s.rpe ?? null,
  }));
  const { error } = await db
    .from("workout_logs")
    .upsert(rows, { onConflict: "client_id,tz_date,exercise_id,set_number" });
  if (error) throw error;
  // Logging sets means they trained — auto-satisfy the day's check-in.
  await upsertCheckin(db, ctx, "trained");
}

export async function upsertWearable(
  db: SupabaseClient,
  ctx: SurfaceCtx,
  input: { steps?: number | null; sleepMin?: number | null },
): Promise<void> {
  const { error } = await db.from("wearable_daily").upsert(
    {
      org_id: ctx.orgId,
      client_id: ctx.clientId,
      tz_date: ctx.tzDate,
      steps: input.steps ?? null,
      sleep_min: input.sleepMin ?? null,
      source: "manual",
    },
    { onConflict: "client_id,tz_date" },
  );
  if (error) throw error;
}

export async function upsertProgressPhoto(
  db: SupabaseClient,
  ctx: SurfaceCtx,
  input: { pose: "front" | "side" | "back"; path: string },
): Promise<void> {
  const { error } = await db.from("progress_photos").upsert(
    { org_id: ctx.orgId, client_id: ctx.clientId, tz_date: ctx.tzDate, pose: input.pose, path: input.path },
    { onConflict: "client_id,tz_date,pose" },
  );
  if (error) throw error;
}
