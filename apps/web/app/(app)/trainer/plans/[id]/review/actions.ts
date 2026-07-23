"use server";

import { revalidatePath } from "next/cache";

import { trackServer } from "@/lib/analytics/server";
import { applyEditAndCapture, approvePlan, rejectPlan } from "@/lib/plans/mutations";
import type { PlanEdit } from "@/lib/plans/edit";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 4.3 — trainer review server actions. Session-guarded (staff only); the
// DB work + org check lives in lib/plans/mutations (service role).

async function requireStaff() {
  const { userId, orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) return null;
  return { userId, orgId };
}

export async function approvePlanAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  if (!s) return;
  const planId = String(formData.get("planId"));
  const versionLabel = String(formData.get("versionLabel") || "A");
  const effectiveFrom = new Date().toISOString().slice(0, 10);
  const res = await approvePlan(createServiceClient(), {
    planId,
    orgId: s.orgId,
    approverId: s.userId,
    versionLabel,
    effectiveFrom,
  });
  // Zero-edit-rate metric (ORIGINAL-SPEC §5): edits made before approval.
  await trackServer({
    orgId: s.orgId,
    event: "plan_approved",
    properties: { plan_id: planId, version: versionLabel, edit_count: res.editCount },
  });
  revalidatePath(`/trainer/plans/${planId}/review`);
}

export async function rejectPlanAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  if (!s) return;
  const planId = String(formData.get("planId"));
  const note = String(formData.get("note") || "").slice(0, 2000);
  await rejectPlan(createServiceClient(), { planId, orgId: s.orgId, note });
  await trackServer({ orgId: s.orgId, event: "plan_rejected", properties: { plan_id: planId } });
  revalidatePath(`/trainer/plans/${planId}/review`);
}

export async function editPlanItemAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  if (!s) return;
  const planId = String(formData.get("planId"));
  const kind = String(formData.get("kind")) as "resize" | "remove";
  const base = {
    versionLabel: String(formData.get("versionLabel")),
    dayType: String(formData.get("dayType")),
    slot: String(formData.get("slot")),
    foodId: String(formData.get("foodId")),
  };
  const edit: PlanEdit =
    kind === "resize"
      ? { kind: "resize", ...base, grams: Number(formData.get("grams")) || 1 }
      : { kind: "remove", ...base };
  await applyEditAndCapture(createServiceClient(), { planId, orgId: s.orgId, editorId: s.userId, edit });
  revalidatePath(`/trainer/plans/${planId}/review`);
}
