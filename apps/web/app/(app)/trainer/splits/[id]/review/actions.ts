"use server";

import { revalidatePath } from "next/cache";

import { trackServer } from "@/lib/analytics/server";
import { applySplitEditAndCapture, approveSplit, rejectSplit } from "@/lib/splits/mutations";
import type { SplitEdit } from "@/lib/splits/edit";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 5.3 — trainer split-review server actions. Session-guarded (staff only);
// the DB work + org check lives in lib/splits/mutations (service role). Mirrors
// the P4.3 plan-review actions.

async function requireStaff() {
  const { userId, orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) return null;
  return { userId, orgId };
}

export async function approveSplitAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  if (!s) return;
  const splitId = String(formData.get("splitId"));
  const res = await approveSplit(createServiceClient(), { splitId, orgId: s.orgId, approverId: s.userId });
  await trackServer({
    orgId: s.orgId,
    event: "split_approved",
    properties: { split_id: splitId, edit_count: res.editCount },
  });
  revalidatePath(`/trainer/splits/${splitId}/review`);
}

export async function rejectSplitAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  if (!s) return;
  const splitId = String(formData.get("splitId"));
  const note = String(formData.get("note") || "").slice(0, 2000);
  await rejectSplit(createServiceClient(), { splitId, orgId: s.orgId, note });
  await trackServer({ orgId: s.orgId, event: "split_rejected", properties: { split_id: splitId } });
  revalidatePath(`/trainer/splits/${splitId}/review`);
}

export async function editSplitAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  if (!s) return;
  const splitId = String(formData.get("splitId"));
  const kind = String(formData.get("kind"));
  const dayLabel = String(formData.get("dayLabel"));
  const exerciseId = String(formData.get("exerciseId"));

  let edit: SplitEdit;
  if (kind === "resize") {
    edit = {
      kind: "resize",
      dayLabel,
      exerciseId,
      sets: formData.get("sets") != null ? Number(formData.get("sets")) : undefined,
      rir: formData.get("rir") != null ? Number(formData.get("rir")) : undefined,
      reps: formData.get("reps") ? String(formData.get("reps")) : undefined,
    };
  } else {
    edit = { kind: "remove", dayLabel, exerciseId };
  }
  await applySplitEditAndCapture(createServiceClient(), { splitId, orgId: s.orgId, editorId: s.userId, edit });
  revalidatePath(`/trainer/splits/${splitId}/review`);
}
