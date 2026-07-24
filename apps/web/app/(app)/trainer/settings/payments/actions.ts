"use server";

import { revalidatePath } from "next/cache";

import { isStripeConfigured } from "@supertrainer/payments";

import { getSessionClaims } from "@/lib/onboarding/state";
import {
  createOnboardingLink,
  refreshAccountStatus,
  runTierSync,
} from "@/lib/payments/connect";
import { setStepStatus } from "@/lib/onboarding/state";

// Phase 8.1 — trainer-facing Connect + sync actions. Every action re-checks the
// staff role server-side (never trusts the client) and gates on the platform
// having Stripe configured. Writes happen through the service role inside the
// connect lib, with org_id verified in code.

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

export interface ConnectActionResult {
  ok: boolean;
  url?: string;
  message?: string;
}

/** Begin (or resume) Stripe Connect onboarding — returns a one-time account-link
 *  URL the client redirects to. Stripe hosts the KYC flow. */
export async function startConnectOnboarding(): Promise<ConnectActionResult> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) return { ok: false, message: "Your session expired — sign in again." };
  if (role !== "owner" && role !== "staff") {
    return { ok: false, message: "Only trainers can set up payments." };
  }
  if (!isStripeConfigured()) {
    return { ok: false, message: "Payments aren’t available on this workspace yet." };
  }

  try {
    const base = `${appOrigin()}/trainer/settings/payments`;
    const url = await createOnboardingLink(orgId, {
      returnUrl: `${base}?connect=return`,
      refreshUrl: `${base}?connect=refresh`,
    });
    return { ok: true, url };
  } catch (err) {
    console.error("[payments] onboarding link failed:", err);
    return { ok: false, message: "Couldn’t start onboarding. Try again in a moment." };
  }
}

/** Pull the latest Connect account state from Stripe and refresh the panel. */
export async function refreshConnectStatus(): Promise<ConnectActionResult> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) return { ok: false, message: "Your session expired — sign in again." };
  if (role !== "owner" && role !== "staff") {
    return { ok: false, message: "Only trainers can manage payments." };
  }
  if (!isStripeConfigured()) {
    return { ok: false, message: "Payments aren’t available on this workspace yet." };
  }

  try {
    const status = await refreshAccountStatus(orgId);
    // Mark the onboarding checklist step done once the account can take charges.
    if (status.chargesEnabled) {
      await setStepStatus(orgId, "payments", "done");
    }
    revalidatePath("/trainer/settings/payments");
    return { ok: true };
  } catch (err) {
    console.error("[payments] status refresh failed:", err);
    return { ok: false, message: "Couldn’t refresh your account status." };
  }
}

export interface SyncActionResult {
  ok: boolean;
  message?: string;
  applied?: number;
  blocked?: boolean;
}

/** Sync the org's tiers to Stripe Products/Prices on the connected account. */
export async function syncTiers(): Promise<SyncActionResult> {
  const { orgId, userId, role } = await getSessionClaims();
  if (!orgId) return { ok: false, message: "Your session expired — sign in again." };
  if (role !== "owner" && role !== "staff") {
    return { ok: false, message: "Only trainers can sync tiers." };
  }
  if (!isStripeConfigured()) {
    return { ok: false, message: "Payments aren’t available on this workspace yet." };
  }

  try {
    const result = await runTierSync(orgId, userId);
    revalidatePath("/trainer/settings/payments");
    if (result.blocked) {
      return {
        ok: false,
        blocked: true,
        message:
          "Your tiers use more than one currency. A connected account bills in a single currency — set every tier to the same one, then sync.",
      };
    }
    return { ok: true, applied: result.applied.length };
  } catch (err) {
    console.error("[payments] tier sync failed:", err);
    return { ok: false, message: "Couldn’t sync your tiers to Stripe. Try again." };
  }
}
