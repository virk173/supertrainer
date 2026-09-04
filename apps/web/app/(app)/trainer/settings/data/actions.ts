"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@supertrainer/db/queries";

import { graceUntil } from "@/lib/data/deletion";
import { runExportJob, signedExportUrl } from "@/lib/data/export";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 9.1 — trainer-facing data rights. Every action re-checks the staff role
// server-side and scopes every write to the caller's org (the service role
// bypasses RLS, so tenancy is verified here in code).

export interface DataActionResult {
  ok: boolean;
  url?: string;
  message?: string;
}

async function staffOrg(): Promise<{ orgId: string; userId: string } | null> {
  const { orgId, userId, role } = await getSessionClaims();
  if (!orgId || !userId) return null;
  if (role !== "owner" && role !== "staff") return null;
  return { orgId, userId };
}

/** Queue a full-organisation archive and build it immediately. */
export async function requestOrgExport(): Promise<DataActionResult> {
  const who = await staffOrg();
  if (!who) return { ok: false, message: "Only trainers can export workspace data." };

  const service = createServiceClient();
  const { data: existing } = await service
    .from("export_jobs")
    .select("id")
    .eq("org_id", who.orgId)
    .in("status", ["queued", "running"])
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: false, message: "An archive is already being built. It’ll appear here shortly." };
  }

  const { data: job, error } = await service
    .from("export_jobs")
    .insert({ org_id: who.orgId, scope: "org", requested_by: who.userId })
    .select("id")
    .single();
  if (error || !job) return { ok: false, message: "Couldn’t start the export. Try again." };

  await recordAudit(service, {
    orgId: who.orgId,
    actorProfileId: who.userId,
    action: "data.export_requested",
    entityType: "export_job",
    entityId: job.id,
    payload: { scope: "org" },
  });

  try {
    await runExportJob(job.id);
  } catch (err) {
    // The nightly worker retries; the row already carries the error.
    console.error("[data] inline export failed", job.id, err);
    return { ok: false, message: "The export didn’t finish. We’ll retry it tonight." };
  }

  revalidatePath("/trainer/settings/data");
  return { ok: true };
}

/** A short-lived signed link for one ready archive. */
export async function downloadExport(jobId: string): Promise<DataActionResult> {
  const who = await staffOrg();
  if (!who) return { ok: false, message: "Only trainers can download workspace data." };
  const url = await signedExportUrl(jobId, who.orgId);
  if (!url) return { ok: false, message: "That archive is no longer available. Export a fresh one." };
  return { ok: true, url };
}

/** Turn the monthly archive on or off. */
export async function setMonthlyExport(enabled: boolean): Promise<DataActionResult> {
  const who = await staffOrg();
  if (!who) return { ok: false, message: "Only trainers can change this." };
  const service = createServiceClient();
  const { error } = await service
    .from("orgs")
    .update({ data_export_monthly: enabled })
    .eq("id", who.orgId);
  if (error) return { ok: false, message: "Couldn’t save that. Try again." };
  revalidatePath("/trainer/settings/data");
  return { ok: true };
}

/** Open a deletion request. Nothing is destroyed now — a 30-day window starts,
 *  and the archive is built first so the trainer keeps a copy. */
export async function requestOrgDeletion(confirmation: string): Promise<DataActionResult> {
  const who = await staffOrg();
  if (!who) return { ok: false, message: "Only the workspace owner can do this." };
  const { role } = await getSessionClaims();
  if (role !== "owner") return { ok: false, message: "Only the workspace owner can delete it." };
  if (confirmation.trim().toUpperCase() !== "DELETE") {
    return { ok: false, message: "Type DELETE to confirm." };
  }

  const service = createServiceClient();
  const { data: open } = await service
    .from("deletion_requests")
    .select("id")
    .eq("org_id", who.orgId)
    .eq("status", "pending")
    .limit(1);
  if (open && open.length > 0) {
    return { ok: false, message: "A deletion is already scheduled." };
  }

  // Build the final archive first — we never destroy the only copy.
  const { data: job } = await service
    .from("export_jobs")
    .insert({ org_id: who.orgId, scope: "org", requested_by: who.userId })
    .select("id")
    .single();
  if (job) {
    try {
      await runExportJob(job.id);
    } catch (err) {
      console.error("[data] final export failed", job.id, err);
    }
  }

  const { data: req, error } = await service
    .from("deletion_requests")
    .insert({
      org_id: who.orgId,
      scope: "org",
      requested_by: who.userId,
      grace_until: graceUntil(new Date()),
      final_export_job_id: job?.id ?? null,
    })
    .select("id, grace_until")
    .single();
  if (error || !req) return { ok: false, message: "Couldn’t schedule the deletion. Try again." };

  await recordAudit(service, {
    orgId: who.orgId,
    actorProfileId: who.userId,
    action: "data.deletion_requested",
    entityType: "deletion_request",
    entityId: req.id,
    payload: { scope: "org", graceUntil: req.grace_until },
  });

  revalidatePath("/trainer/settings/data");
  return { ok: true };
}

/** Cancel a scheduled deletion any time before the window closes. */
export async function cancelOrgDeletion(): Promise<DataActionResult> {
  const who = await staffOrg();
  if (!who) return { ok: false, message: "Only the workspace owner can do this." };

  const service = createServiceClient();
  const { data: req } = await service
    .from("deletion_requests")
    .select("id")
    .eq("org_id", who.orgId)
    .eq("status", "pending")
    .maybeSingle();
  if (!req) return { ok: false, message: "There’s nothing scheduled." };

  await service
    .from("deletion_requests")
    .update({ status: "canceled", completed_at: new Date().toISOString() })
    .eq("id", req.id);

  await recordAudit(service, {
    orgId: who.orgId,
    actorProfileId: who.userId,
    action: "data.deletion_cancelled",
    entityType: "deletion_request",
    entityId: req.id,
    payload: {},
  });

  revalidatePath("/trainer/settings/data");
  return { ok: true };
}
