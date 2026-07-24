"use server";

import { revalidatePath } from "next/cache";

import { approveDraft, dismissDraft, editDraft, rewriteDraft } from "@/lib/comms/queue";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 6.4 — the trainer queue's server actions. Each resolves the caller's org
// from the JWT (staff only) and the queue mutation re-verifies the draft belongs
// to that org in code (service role bypasses RLS).

async function staff(): Promise<{ orgId: string; userId: string } | null> {
  const { orgId, userId, role } = await getSessionClaims();
  if (!orgId || !userId || (role !== "owner" && role !== "staff")) return null;
  return { orgId, userId };
}

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
