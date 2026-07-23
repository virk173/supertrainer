// Split review mutations (Phase 5.3). DB cores for edit-capture, approve
// (→ splits_active + supersede), reject (→ re-queue), and video management.
// Client-injected and org-checked in code (service role bypasses RLS); the
// server actions wrap these with the trainer session. Volume/balance are
// recomputed in code on every edit (rule 4). Mirrors lib/plans/mutations.ts.

import {
  buildExerciseIndex,
  parseTrainingIntake,
  validateSplit,
  type ExerciseMeta,
  type Schedule,
  type SplitDay,
} from "@supertrainer/training-engine";
import type { Database, Json } from "@supertrainer/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { exerciseIdsInSplit, splitsActivePayload, type VideoRef } from "@/lib/splits/activate";
import { applySplitEdit, type SplitEdit } from "@/lib/splits/edit";
import { compileSplitPool } from "@/lib/splits/pool";
import { resolveVideo, type ExerciseVideo } from "@/lib/splits/videos";

type ServiceClient = SupabaseClient<Database>;

async function loadSplit(service: ServiceClient, splitId: string, orgId: string) {
  const { data: split } = await service
    .from("splits")
    .select("id, org_id, client_id, days, schedule, meta, status")
    .eq("id", splitId)
    .maybeSingle();
  if (!split || split.org_id !== orgId) throw new Error("split not found in org");
  return split;
}

// The client's injury-safe pool + a metadata index that ALSO covers every
// exercise currently in the split (so an overridden/edited exercise still has
// muscle data for the volume math; an out-of-pool id then correctly flags).
async function revalidationContext(
  service: ServiceClient,
  clientId: string,
  orgId: string,
  days: SplitDay[],
) {
  const { data: client } = await service
    .from("clients")
    .select("id, org_id, intake, health_flags")
    .eq("id", clientId)
    .maybeSingle();
  if (!client || client.org_id !== orgId) throw new Error("client/org mismatch");
  const parsed = parseTrainingIntake(client.intake, client.health_flags);
  const pool = parsed.ok
    ? (await compileSplitPool(service, orgId, parsed.intake.equipment, parsed.intake.experience, parsed.intake.injuries)).pool
    : [];
  const poolIds = new Set(pool.map((p) => p.id));

  const splitIds = [...exerciseIdsInSplit(days)];
  const { data: metaRows } = await service
    .from("exercises")
    .select("id, name, primary_muscles, secondary_muscles, movement_patterns")
    .in("id", splitIds.length ? splitIds : ["00000000-0000-0000-0000-000000000000"]);
  const metas = (metaRows ?? []) as unknown as ExerciseMeta[];
  const index = buildExerciseIndex([...(pool as unknown as ExerciseMeta[]), ...metas]);
  return { index, poolIds };
}

export async function applySplitEditAndCapture(
  service: ServiceClient,
  p: { splitId: string; orgId: string; editorId: string | null; edit: SplitEdit },
) {
  const split = await loadSplit(service, p.splitId, p.orgId);
  const { days: next, capture } = applySplitEdit(split.days as unknown as SplitDay[], p.edit);
  const schedule = split.schedule as unknown as Schedule;

  const { index, poolIds } = await revalidationContext(service, split.client_id, p.orgId, next);
  const validation = validateSplit(next, schedule, index, poolIds);

  const meta = { ...(split.meta as object), needsAttention: !validation.ok, validation };
  await service
    .from("splits")
    .update({ days: next as unknown as Json, meta: meta as unknown as Json })
    .eq("id", split.id);
  await service.from("draft_edits").insert({
    org_id: p.orgId,
    entity_type: "split",
    entity_id: split.id,
    path: capture.path,
    before: capture.before as Json,
    after: capture.after as Json,
    edit_kind: capture.edit_kind,
    editor_id: p.editorId,
  });
  return { ok: true as const, validation };
}

async function resolveVideos(
  service: ServiceClient,
  orgId: string,
  exerciseIds: string[],
): Promise<(id: string) => VideoRef | null> {
  const { data } = await service
    .from("exercise_videos")
    .select("exercise_id, org_id, kind, storage_path, youtube_id")
    .in("exercise_id", exerciseIds.length ? exerciseIds : ["00000000-0000-0000-0000-000000000000"])
    .or(`org_id.is.null,org_id.eq.${orgId}`);
  const videos = (data ?? []) as ExerciseVideo[];
  return (id: string) => {
    const r = resolveVideo(id, orgId, videos);
    return r ? { kind: r.kind, ref: r.ref } : null;
  };
}

export async function approveSplit(
  service: ServiceClient,
  p: { splitId: string; orgId: string; approverId: string | null },
) {
  const split = await loadSplit(service, p.splitId, p.orgId);
  const days = split.days as unknown as SplitDay[];
  const schedule = split.schedule as unknown as Schedule;
  const ids = [...exerciseIdsInSplit(days)];

  // Supersede any currently-approved split for this client (one live split).
  await service
    .from("splits")
    .update({ status: "superseded" })
    .eq("client_id", split.client_id)
    .eq("status", "approved");

  await service
    .from("splits")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: p.approverId })
    .eq("id", split.id);

  // Resolve catalog names + winning video refs for splits_active.
  const { data: nameRows } = await service
    .from("exercises")
    .select("id, name")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const names = new Map((nameRows ?? []).map((r) => [r.id, r.name]));
  const videoOf = await resolveVideos(service, p.orgId, ids);

  const payload = splitsActivePayload(days, schedule, (id) => names.get(id) ?? id, videoOf);
  await service.from("splits_active").upsert(
    {
      client_id: split.client_id,
      org_id: split.org_id,
      split_id: split.id,
      days: payload.days as unknown as Json,
      schedule: payload.schedule as unknown as Json,
    },
    { onConflict: "client_id" },
  );

  // Client notification (P6 delivers it) — idempotent per split.
  await service.from("notifications").insert({
    org_id: split.org_id,
    client_id: split.client_id,
    kind: "split_ready",
    channel: "in_app",
    payload: { split_id: split.id } as unknown as Json,
    dedupe_key: `${split.client_id}:split_ready:${split.id}`,
  });

  // Zero-edit-rate metric.
  const { count } = await service
    .from("draft_edits")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "split")
    .eq("entity_id", split.id);

  return { ok: true as const, clientId: split.client_id, editCount: count ?? 0 };
}

export async function rejectSplit(
  service: ServiceClient,
  p: { splitId: string; orgId: string; note: string },
) {
  const split = await loadSplit(service, p.splitId, p.orgId);
  await service
    .from("splits")
    .update({ status: "archived", meta: { ...(split.meta as object), rejectNote: p.note } as unknown as Json })
    .eq("id", split.id);
  const { data: req } = await service
    .from("plan_requests")
    .insert({ org_id: split.org_id, client_id: split.client_id, kind: "split", trigger: "manual", status: "queued" })
    .select("id")
    .maybeSingle();
  return { ok: true as const, planRequestId: req?.id };
}

// Set (or replace) an org's video override for an exercise. Org-checked in code;
// upserts on the (exercise_id, org_id) natural key.
export async function setExerciseVideo(
  service: ServiceClient,
  p: {
    orgId: string;
    exerciseId: string;
    kind: "upload" | "youtube";
    storagePath?: string;
    youtubeId?: string;
    cueNotes?: string;
  },
) {
  const row = {
    exercise_id: p.exerciseId,
    org_id: p.orgId,
    kind: p.kind,
    storage_path: p.kind === "upload" ? (p.storagePath ?? null) : null,
    youtube_id: p.kind === "youtube" ? (p.youtubeId ?? null) : null,
    cue_notes: p.cueNotes ?? null,
  };
  const { data, error } = await service
    .from("exercise_videos")
    .upsert(row, { onConflict: "exercise_id,org_id" })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return { ok: true as const, id: data?.id };
}
