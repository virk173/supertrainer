"use server";

import { revalidatePath } from "next/cache";

import { getSessionClaims } from "@/lib/onboarding/state";
import { enrollPlatformSubscription, startClientCutover } from "@/lib/payments/cutover";

// Phase 8.6 — trainer cutover actions. Staff-only; org verified in the lib.

export interface CutoverActionResult {
  ok: boolean;
  message?: string;
}

/** Start cutover for one approved_manually client onto a chosen tier. */
export async function beginCutover(
  clientId: string,
  tierId: string,
  graceDays = 21,
): Promise<CutoverActionResult> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) return { ok: false, message: "Your session expired — sign in again." };
  if (role !== "owner" && role !== "staff") return { ok: false, message: "Only trainers can run cutover." };

  const res = await startClientCutover(orgId, clientId, tierId, graceDays);
  if (!res.ok) return { ok: false, message: "Couldn’t start cutover for that client." };
  revalidatePath("/trainer/settings/payments/cutover");
  return { ok: true };
}

/** Enrol this org into the platform base-fee plan (founder grace if flagged). */
export async function enrollPlatform(): Promise<CutoverActionResult> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) return { ok: false, message: "Your session expired — sign in again." };
  if (role !== "owner" && role !== "staff") return { ok: false, message: "Only trainers can enroll." };

  await enrollPlatformSubscription(orgId);
  revalidatePath("/trainer/settings/payments/cutover");
  return { ok: true };
}
