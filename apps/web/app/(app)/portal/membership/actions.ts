"use server";

import { revalidatePath } from "next/cache";

import { isStripeConfigured } from "@supertrainer/payments";

import { getSessionClaims } from "@/lib/onboarding/state";
import {
  applyTierChange,
  createBillingPortalSession,
  createCheckoutSession,
  previewTierChange,
  type TierChangePreview,
} from "@/lib/payments/checkout";
import {
  pauseSubscription,
  requestCancellation,
  resumeSubscription,
} from "@/lib/payments/lifecycle";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 8.2 — client-side membership actions. Each resolves the caller's OWN
// client row from the session (never trusting a client id from the request) and
// gates on the platform having Stripe configured.

async function currentClient(): Promise<{ orgId: string; clientId: string } | null> {
  const { orgId, userId } = await getSessionClaims();
  if (!orgId || !userId) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("clients")
    .select("id")
    .eq("profile_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  return data ? { orgId, clientId: data.id } : null;
}

function origin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

export interface RedirectResult {
  ok: boolean;
  url?: string;
  message?: string;
}

/** Start hosted checkout for a tier. Used by /pay and by "start membership". */
export async function startTierCheckout(tierId: string): Promise<RedirectResult> {
  if (!isStripeConfigured()) return { ok: false, message: "Payments aren’t available yet." };
  const who = await currentClient();
  if (!who) return { ok: false, message: "Sign in to continue." };

  const base = origin();
  const res = await createCheckoutSession({
    orgId: who.orgId,
    clientId: who.clientId,
    tierId,
    successUrl: `${base}/portal/membership?checkout=success`,
    cancelUrl: `${base}/portal/membership?checkout=canceled`,
  });
  if (!res.ok) {
    return {
      ok: false,
      message:
        res.reason === "payments_not_ready"
          ? "Your coach is still finishing payment setup — check back shortly."
          : "Couldn’t start checkout. Try again in a moment.",
    };
  }
  return { ok: true, url: res.url };
}

/** Open the Stripe Billing Portal to update a card / view invoices. */
export async function openBillingPortal(): Promise<RedirectResult> {
  if (!isStripeConfigured()) return { ok: false, message: "Payments aren’t available yet." };
  const who = await currentClient();
  if (!who) return { ok: false, message: "Sign in to continue." };
  const res = await createBillingPortalSession(
    who.orgId,
    who.clientId,
    `${origin()}/portal/membership`,
  );
  if (!res.ok) return { ok: false, message: "No billing details to manage yet." };
  return { ok: true, url: res.url };
}

export interface PreviewResult {
  ok: boolean;
  preview?: TierChangePreview;
  message?: string;
}

/** Preview a tier change (exact Stripe proration) before the client confirms. */
export async function previewChange(tierId: string): Promise<PreviewResult> {
  if (!isStripeConfigured()) return { ok: false, message: "Payments aren’t available yet." };
  const who = await currentClient();
  if (!who) return { ok: false, message: "Sign in to continue." };
  const res = await previewTierChange(who.orgId, who.clientId, tierId);
  if (!res.ok) return { ok: false, message: "Couldn’t preview that change." };
  return { ok: true, preview: res.preview };
}

/** Confirm a tier change after the client has seen the proration. */
export async function confirmChange(tierId: string): Promise<RedirectResult> {
  if (!isStripeConfigured()) return { ok: false, message: "Payments aren’t available yet." };
  const who = await currentClient();
  if (!who) return { ok: false, message: "Sign in to continue." };
  const res = await applyTierChange(who.orgId, who.clientId, tierId);
  if (!res.ok) return { ok: false, message: "Couldn’t change your plan. Try again." };
  revalidatePath("/portal/membership");
  return { ok: true };
}

/** Pause the membership (vacation). Billing stops; the plan pauses; expectations
 *  switch off (gap-fairness) until resumed. */
export async function pauseMembership(): Promise<RedirectResult> {
  if (!isStripeConfigured()) return { ok: false, message: "Payments aren’t available yet." };
  const who = await currentClient();
  if (!who) return { ok: false, message: "Sign in to continue." };
  const res = await pauseSubscription(who.orgId, who.clientId);
  if (!res.ok) return { ok: false, message: "Couldn’t pause your membership right now." };
  revalidatePath("/portal/membership");
  return { ok: true };
}

/** Resume a paused membership. */
export async function resumeMembership(): Promise<RedirectResult> {
  if (!isStripeConfigured()) return { ok: false, message: "Payments aren’t available yet." };
  const who = await currentClient();
  if (!who) return { ok: false, message: "Sign in to continue." };
  const res = await resumeSubscription(who.orgId, who.clientId);
  if (!res.ok) return { ok: false, message: "Couldn’t resume your membership right now." };
  revalidatePath("/portal/membership");
  return { ok: true };
}

/** Request cancellation (ends at period end). The trainer is flagged privately
 *  for a save offer; the client keeps access until the period ends. */
export async function cancelMembership(): Promise<RedirectResult> {
  if (!isStripeConfigured()) return { ok: false, message: "Payments aren’t available yet." };
  const who = await currentClient();
  if (!who) return { ok: false, message: "Sign in to continue." };
  const res = await requestCancellation(who.orgId, who.clientId);
  if (!res.ok) return { ok: false, message: "Couldn’t cancel right now. Try again." };
  revalidatePath("/portal/membership");
  return { ok: true };
}
