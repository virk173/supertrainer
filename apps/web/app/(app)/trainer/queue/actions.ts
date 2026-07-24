"use server";

import { revalidatePath } from "next/cache";

import { approveDraft, dismissDraft, editDraft, rewriteDraft } from "@/lib/comms/queue";
import { getSessionClaims } from "@/lib/onboarding/state";
import { getQueueData, type QueueData } from "@/lib/trainer/queue";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 6.4 / 7.3 — the trainer queue's server actions. Each resolves the
// caller's org from the JWT (staff only) and the mutation re-verifies the row
// belongs to that org in code (service role bypasses RLS). The `*Action`
// form-data variants stay for progressive enhancement; the `*Json` variants back
// the 7.3 split-view (optimistic UI, keyboard approve).

async function staff(): Promise<{ orgId: string; userId: string } | null> {
  const { orgId, userId, role } = await getSessionClaims();
  if (!orgId || !userId || (role !== "owner" && role !== "staff")) return null;
  return { orgId, userId };
}

type Ok = { ok: boolean };

export async function approveDraftAction(formData: FormData): Promise<void> {
  const s = await staff();
  if (!s) return;
  await approveDraft(createServiceClient(), s.orgId, String(formData.get("draftId")));
  revalidatePath("/trainer/queue");
}

export async function editDraftAction(formData: FormData): Promise<void> {
  const s = await staff();
  if (!s) return;
  await editDraft(
    createServiceClient(),
    s.orgId,
    String(formData.get("draftId")),
    String(formData.get("text") ?? ""),
    s.userId,
  );
  revalidatePath("/trainer/queue");
}

export async function dismissDraftAction(formData: FormData): Promise<void> {
  const s = await staff();
  if (!s) return;
  await dismissDraft(createServiceClient(), s.orgId, String(formData.get("draftId")));
  revalidatePath("/trainer/queue");
}

export async function rewriteDraftAction(formData: FormData): Promise<void> {
  const s = await staff();
  if (!s) return;
  await rewriteDraft(createServiceClient(), s.orgId, String(formData.get("draftId")));
  revalidatePath("/trainer/queue");
}

export async function approveDraftJson(draftId: string): Promise<Ok> {
  const s = await staff();
  if (!s) return { ok: false };
  const result = await approveDraft(createServiceClient(), s.orgId, draftId);
  revalidatePath("/trainer/queue");
  return result;
}

export async function editDraftJson(draftId: string, text: string): Promise<Ok> {
  const s = await staff();
  if (!s) return { ok: false };
  const result = await editDraft(createServiceClient(), s.orgId, draftId, text, s.userId);
  revalidatePath("/trainer/queue");
  return result;
}

export async function rewriteDraftJson(draftId: string): Promise<Ok> {
  const s = await staff();
  if (!s) return { ok: false };
  const result = await rewriteDraft(createServiceClient(), s.orgId, draftId);
  revalidatePath("/trainer/queue");
  return result;
}

export async function dismissDraftJson(draftId: string): Promise<Ok> {
  const s = await staff();
  if (!s) return { ok: false };
  const result = await dismissDraft(createServiceClient(), s.orgId, draftId);
  revalidatePath("/trainer/queue");
  return result;
}

// Undo a dismiss — put the draft back in the pending queue (org-verified).
export async function undismissDraftJson(draftId: string): Promise<Ok> {
  const s = await staff();
  if (!s) return { ok: false };
  const service = createServiceClient();
  const { data } = await service
    .from("drafts")
    .select("id, org_id, status")
    .eq("id", draftId)
    .maybeSingle();
  if (!data || data.org_id !== s.orgId || data.status !== "dismissed") return { ok: false };
  await service.from("drafts").update({ status: "pending" }).eq("id", draftId);
  revalidatePath("/trainer/queue");
  return { ok: true };
}

async function setEscalationStatus(
  escalationId: string,
  orgId: string,
  status: "open" | "resolved",
): Promise<Ok> {
  const service = createServiceClient();
  const { data } = await service
    .from("escalations")
    .select("id, org_id")
    .eq("id", escalationId)
    .maybeSingle();
  if (!data || data.org_id !== orgId) return { ok: false };
  await service
    .from("escalations")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", escalationId);
  revalidatePath("/trainer/queue");
  return { ok: true };
}

export async function resolveEscalationJson(escalationId: string): Promise<Ok> {
  const s = await staff();
  if (!s) return { ok: false };
  return setEscalationStatus(escalationId, s.orgId, "resolved");
}

export async function reopenEscalationJson(escalationId: string): Promise<Ok> {
  const s = await staff();
  if (!s) return { ok: false };
  return setEscalationStatus(escalationId, s.orgId, "open");
}

// Realtime refresh: recompute the whole queue when a stream changes.
export async function refreshQueueAction(): Promise<QueueData | null> {
  const s = await staff();
  if (!s) return null;
  return getQueueData(s.orgId, new Date());
}
