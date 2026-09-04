"use server";

import { revalidatePath } from "next/cache";

import { trainerCode } from "@/lib/growth/referrals";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 9.4 — the trainer's own controls. Nothing here can grant credit: the
// engine decides that from facts, on its own schedule.

export interface ReferralActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

async function staffOrg(): Promise<string | null> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) return null;
  return orgId;
}

/** Mint (or return) this org's referral code. */
export async function ensureReferralCode(): Promise<ReferralActionResult> {
  const orgId = await staffOrg();
  if (!orgId) return { ok: false, message: "Only trainers can do this." };
  try {
    const code = await trainerCode(orgId);
    revalidatePath("/trainer/settings/referrals");
    return { ok: true, code };
  } catch {
    return { ok: false, message: "Couldn’t create your link. Try again." };
  }
}

/** Turn the client "bring a friend" card on or off. Off by default — asking
 *  clients to recruit is a choice about the coaching relationship. */
export async function setClientReferrals(enabled: boolean): Promise<ReferralActionResult> {
  const orgId = await staffOrg();
  if (!orgId) return { ok: false, message: "Only trainers can do this." };
  const service = createServiceClient();
  const { error } = await service
    .from("orgs")
    .update({ client_referrals_enabled: enabled })
    .eq("id", orgId);
  if (error) return { ok: false, message: "Couldn’t save that." };
  revalidatePath("/trainer/settings/referrals");
  revalidatePath("/portal/me");
  return { ok: true };
}
