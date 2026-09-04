"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@supertrainer/db/queries";

import { graceUntil } from "@/lib/data/deletion";
import { runExportJob, signedExportUrl } from "@/lib/data/export";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 9.1 — the client's own data rights. Tenancy comes from the session: a
// client can only ever export or delete THEIR OWN record, never another's, and
// the client id is resolved here rather than accepted from the browser.

export interface PortalDataResult {
  ok: boolean;
  url?: string;
  message?: string;
}

async function currentClient(): Promise<{ orgId: string; userId: string; clientId: string } | null> {
  const { orgId, userId } = await getSessionClaims();
  if (!orgId || !userId) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("clients")
    .select("id")
    .eq("profile_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  return data ? { orgId, userId, clientId: data.id } : null;
}

/** Build an archive of everything this client has logged, said, and been sent. */
export async function requestMyExport(): Promise<PortalDataResult> {
  const me = await currentClient();
  if (!me) return { ok: false, message: "Sign in again to export your data." };

  const service = createServiceClient();
  const { data: busy } = await service
    .from("export_jobs")
    .select("id")
    .eq("client_id", me.clientId)
    .in("status", ["queued", "running"])
    .limit(1);
  if (busy && busy.length > 0) {
    return { ok: false, message: "Your copy is already being prepared." };
  }

  const { data: job, error } = await service
    .from("export_jobs")
    .insert({
      org_id: me.orgId,
      scope: "client",
      client_id: me.clientId,
      requested_by: me.userId,
    })
    .select("id")
    .single();
  if (error || !job) return { ok: false, message: "Couldn’t start that. Try again." };

  await recordAudit(service, {
    orgId: me.orgId,
    actorProfileId: me.userId,
    action: "data.export_requested",
    entityType: "export_job",
    entityId: job.id,
    payload: { scope: "client" },
  });

  try {
    await runExportJob(job.id);
  } catch (err) {
    console.error("[data] client export failed", job.id, err);
    return { ok: false, message: "That didn’t finish. We’ll retry it tonight." };
  }

  revalidatePath("/portal/me");
  return { ok: true };
}

/** Signed link for one of this client's own ready archives. */
export async function downloadMyExport(jobId: string): Promise<PortalDataResult> {
  const me = await currentClient();
  if (!me) return { ok: false, message: "Sign in again to download your data." };

  const service = createServiceClient();
  const { data: job } = await service
    .from("export_jobs")
    .select("client_id")
    .eq("id", jobId)
    .maybeSingle();
  // Tenancy verified in code — the service role bypasses RLS.
  if (!job || job.client_id !== me.clientId) {
    return { ok: false, message: "That archive is no longer available." };
  }
  const url = await signedExportUrl(jobId, me.orgId);
  if (!url) return { ok: false, message: "That link expired. Ask for a fresh copy." };
  return { ok: true, url };
}

/** Ask for everything to be erased. A grace window starts and the coach is told,
 *  so nothing disappears from under either of you without warning. */
export async function requestMyDeletion(): Promise<PortalDataResult> {
  const me = await currentClient();
  if (!me) return { ok: false, message: "Sign in again to make that request." };

  const service = createServiceClient();
  const { data: open } = await service
    .from("deletion_requests")
    .select("id")
    .eq("client_id", me.clientId)
    .eq("status", "pending")
    .limit(1);
  if (open && open.length > 0) return { ok: false, message: "That request is already in." };

  const until = graceUntil(new Date());
  const { data: req, error } = await service
    .from("deletion_requests")
    .insert({
      org_id: me.orgId,
      scope: "client",
      client_id: me.clientId,
      requested_by: me.userId,
      grace_until: until,
    })
    .select("id")
    .single();
  if (error || !req) return { ok: false, message: "Couldn’t make that request. Try again." };

  // Tell the coach in the thread they already read — system voice, not the
  // client's, and not a silent disappearance.
  await service.from("messages").insert({
    org_id: me.orgId,
    client_id: me.clientId,
    sender: "system",
    body: `This client asked for their data to be deleted. Everything is erased on ${new Date(
      until,
    ).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} unless they cancel.`,
  });

  await recordAudit(service, {
    orgId: me.orgId,
    actorProfileId: me.userId,
    action: "data.deletion_requested",
    entityType: "deletion_request",
    entityId: req.id,
    payload: { scope: "client", graceUntil: until },
  });

  revalidatePath("/portal/me");
  return { ok: true };
}

/** Change your mind, any time inside the window. */
export async function cancelMyDeletion(): Promise<PortalDataResult> {
  const me = await currentClient();
  if (!me) return { ok: false, message: "Sign in again to cancel that." };

  const service = createServiceClient();
  const { data: req } = await service
    .from("deletion_requests")
    .select("id")
    .eq("client_id", me.clientId)
    .eq("status", "pending")
    .maybeSingle();
  if (!req) return { ok: false, message: "There’s nothing to cancel." };

  await service
    .from("deletion_requests")
    .update({ status: "canceled", completed_at: new Date().toISOString() })
    .eq("id", req.id);

  await recordAudit(service, {
    orgId: me.orgId,
    actorProfileId: me.userId,
    action: "data.deletion_cancelled",
    entityType: "deletion_request",
    entityId: req.id,
    payload: { scope: "client" },
  });

  revalidatePath("/portal/me");
  return { ok: true };
}
