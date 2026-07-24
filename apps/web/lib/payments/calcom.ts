import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

import { creditsRemaining, periodMonth } from "./credits-math";

// Phase 8.5 — video-call credits. Simplest reliable path (per the brief): the
// trainer connects their own Cal.com booking link (stored on the tier), the
// client books through the embed, and a Cal.com booking webhook decrements a
// monthly credit. A platform-provisioned managed-user integration is a
// documented follow-up. Credit math (./credits-math) is coded + tested (rule 4).

export { creditsRemaining, periodMonth };

interface TierFeatures {
  video_calls_per_month?: number;
}

/** Monthly grant: for every active, non-demo subscription whose tier includes
 *  video calls, ensure a credit row for the current month. Idempotent (unique on
 *  client_id, period_month) — a re-run never doubles a client's credits. */
export async function grantMonthlyCredits(
  orgId: string,
  now = new Date(),
): Promise<{ granted: number }> {
  const service = createServiceClient();
  const month = periodMonth(now);

  const { data: subs } = await service
    .from("subscriptions")
    .select("id, client_id, status, clients:client_id (is_demo), tiers:tier_id (features)")
    .eq("org_id", orgId)
    .in("status", ["active", "trialing"]);

  let granted = 0;
  for (const s of subs ?? []) {
    const client = s.clients as { is_demo?: boolean } | null;
    if (client?.is_demo) continue;
    const tier = s.tiers as { features?: TierFeatures } | null;
    const calls = tier?.features?.video_calls_per_month ?? 0;
    if (calls <= 0) continue;

    const { error } = await service.from("call_credits").upsert(
      {
        org_id: orgId,
        client_id: s.client_id,
        subscription_id: s.id,
        period_month: month,
        credits_total: calls,
      },
      { onConflict: "client_id,period_month", ignoreDuplicates: true },
    );
    if (!error) granted += 1;
  }
  return { granted };
}

/** Record a booking → increment credits_used for the BOOKING month (not the
 *  webhook-processing month — a delivery that crosses a UTC month boundary still
 *  decrements the right period). Verifies the client belongs to the org named in
 *  the webhook metadata (defense-in-depth on the HMAC-gated endpoint). Called by
 *  the Cal.com booking webhook. Returns remaining after the booking. */
export async function recordBooking(
  orgId: string,
  clientId: string,
  bookingAt = new Date(),
): Promise<{ ok: boolean; remaining?: number; reason?: string }> {
  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id, org_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client || client.org_id !== orgId) return { ok: false, reason: "client_not_in_org" };

  const month = periodMonth(bookingAt);
  const { data: row } = await service
    .from("call_credits")
    .select("id, credits_total, credits_used")
    .eq("client_id", clientId)
    .eq("period_month", month)
    .maybeSingle();
  if (!row) return { ok: false, reason: "no_credits_for_month" };

  const used = row.credits_used + 1;
  await service.from("call_credits").update({ credits_used: used }).eq("id", row.id);
  return { ok: true, remaining: creditsRemaining(row.credits_total, used) };
}

/** A client's current-month credit balance for the portal booking card. */
export async function getClientCredits(
  clientId: string,
  now = new Date(),
): Promise<{ total: number; used: number; remaining: number } | null> {
  const service = createServiceClient();
  const { data: row } = await service
    .from("call_credits")
    .select("credits_total, credits_used")
    .eq("client_id", clientId)
    .eq("period_month", periodMonth(now))
    .maybeSingle();
  if (!row) return null;
  return {
    total: row.credits_total,
    used: row.credits_used,
    remaining: creditsRemaining(row.credits_total, row.credits_used),
  };
}
