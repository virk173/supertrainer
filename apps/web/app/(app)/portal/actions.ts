"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { trackServer } from "@/lib/analytics/server";
import { toKg, type CheckinStatus } from "@/lib/ledger/checkin";
import { getCurrentClientContext, tzDate } from "@/lib/ledger/log";
import {
  upsertCheckin,
  upsertProgressPhoto,
  upsertWearable,
  upsertWeighIn,
  upsertWorkoutSets,
  type SurfaceCtx,
} from "@/lib/ledger/surfaces-core";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 3.3 — portal logging-surface server actions. Session-derived tenancy
// (the caller can only write for their own client); the core writers upsert on
// natural keys so an offline queue can replay them safely.

async function ctx(): Promise<{ db: ReturnType<typeof createServiceClient>; c: SurfaceCtx; timezone: string }> {
  const cc = await getCurrentClientContext();
  if (!cc) throw new Error("No client for the current session");
  return {
    db: createServiceClient(),
    c: { orgId: cc.orgId, clientId: cc.clientId, tzDate: tzDate(cc.timezone) },
    timezone: cc.timezone,
  };
}

const WeighInSchema = z.object({ value: z.number().positive().max(1500), unit: z.enum(["kg", "lb"]) });

export async function logWeighInAction(input: z.infer<typeof WeighInSchema>) {
  const { value, unit } = WeighInSchema.parse(input);
  const { db, c } = await ctx();
  const weightKg = toKg(value, unit);
  await upsertWeighIn(db, c, { weightKg, method: "manual" });
  await trackServer({ orgId: c.orgId, clientId: c.clientId, event: "weigh_in_logged", properties: { weightKg } });
  return { ok: true as const, weightKg };
}

const CheckinSchema = z.object({ status: z.enum(["trained", "rest", "missed"]) });

export async function checkinAction(input: z.infer<typeof CheckinSchema>) {
  const { status } = CheckinSchema.parse(input);
  const { db, c } = await ctx();
  const stored = await upsertCheckin(db, c, status as CheckinStatus);
  await trackServer({ orgId: c.orgId, clientId: c.clientId, event: "gym_checkin", properties: { status: stored } });
  return { ok: true as const, status: stored };
}

const WorkoutSchema = z.object({
  sets: z
    .array(
      z.object({
        exerciseId: z.string().min(1).max(120),
        exerciseName: z.string().min(1).max(160),
        setNumber: z.number().int().positive().max(50),
        weightKg: z.number().min(0).max(1000).nullable().optional(),
        reps: z.number().int().min(0).max(1000).nullable().optional(),
        rpe: z.number().min(1).max(10).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function logWorkoutAction(input: z.infer<typeof WorkoutSchema>) {
  const { sets } = WorkoutSchema.parse(input);
  const { db, c } = await ctx();
  await upsertWorkoutSets(db, c, sets);
  await trackServer({ orgId: c.orgId, clientId: c.clientId, event: "workout_logged", properties: { sets: sets.length } });
  return { ok: true as const };
}

const WearableSchema = z.object({
  steps: z.number().int().min(0).max(100000).nullable().optional(),
  sleepMin: z.number().int().min(0).max(1440).nullable().optional(),
});

export async function logWearableAction(input: z.infer<typeof WearableSchema>) {
  const parsed = WearableSchema.parse(input);
  const { db, c } = await ctx();
  await upsertWearable(db, c, parsed);
  await trackServer({ orgId: c.orgId, clientId: c.clientId, event: "wearable_logged", properties: parsed });
  return { ok: true as const };
}

const PHOTO_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const ProgressPhotoSchema = z.object({
  pose: z.enum(["front", "side", "back"]),
  base64: z.string().min(1),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export async function saveProgressPhotoAction(input: z.infer<typeof ProgressPhotoSchema>) {
  const { pose, base64, mediaType } = ProgressPhotoSchema.parse(input);
  const { db, c } = await ctx();
  const ext = PHOTO_EXT[mediaType] ?? "jpg";
  const path = `${c.orgId}/${c.clientId}/${c.tzDate}-${pose}-${randomUUID()}.${ext}`;
  const { error } = await db.storage
    .from("progress-photos")
    .upload(path, Buffer.from(base64, "base64"), { contentType: mediaType, upsert: false });
  if (error) throw error;
  await upsertProgressPhoto(db, c, { pose, path });
  await trackServer({ orgId: c.orgId, clientId: c.clientId, event: "progress_photo_uploaded", properties: { pose } });
  return { ok: true as const, path };
}
