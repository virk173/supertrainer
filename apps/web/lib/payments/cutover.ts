import "server-only";

import { recordAudit } from "@supertrainer/db/queries";
import { founderGraceEnabled } from "@supertrainer/payments";

import { createServiceClient } from "@/lib/supabase/server";

import { cutoverStatus, summarizeCutover, type CutoverProgress, type CutoverState } from "./cutover-state";
import { graceUntil } from "./dunning";

// Phase 8.6 — beta cutover orchestration (service-role; org verified in code).

export interface CutoverClient {
  clientId: string;
  name: string;
  state: CutoverState;
  tierId: string | null;
  graceUntil: string | null;
}

export interface CutoverView {
  clients: CutoverClient[];
  progress: CutoverProgress;
}

function name(row: { intake?: unknown }): string {
  const n = row.intake && typeof row.intake === "object" ? (row.intake as { name?: unknown }).name : undefined;
  return typeof n === "string" ? n : "Client";
}

/** The org's cutover picture: every approved_manually active client + its state. */
export async function getCutoverList(orgId: string, now = new Date()): Promise<CutoverView> {
  const service = createServiceClient();
  const { data: clients } = await service
    .from("clients")
    .select("id, intake, approved_manually")
    .eq("org_id", orgId)
    .eq("approved_manually", true)
    .eq("is_demo", false);

  const ids = (clients ?? []).map((c) => c.id);
  const subByClient = new Map<string, { status: string; tier_id: string | null; grace_until: string | null }>();
  if (ids.length > 0) {
    const { data: subs } = await service
      .from("subscriptions")
      .select("client_id, status, tier_id, grace_until, created_at")
      .in("client_id", ids)
      .order("created_at", { ascending: false });
    for (const s of subs ?? []) {
      if (!subByClient.has(s.client_id)) {
        subByClient.set(s.client_id, { status: s.status, tier_id: s.tier_id, grace_until: s.grace_until });
      }
    }
  }

  const list: CutoverClient[] = (clients ?? []).map((c) => {
    const sub = subByClient.get(c.id) ?? null;
    return {
      clientId: c.id,
      name: name(c),
      state: cutoverStatus({
        approvedManually: c.approved_manually,
        subStatus: sub?.status ?? null,
        graceUntil: sub?.grace_until ?? null,
        now,
      }),
      tierId: sub?.tier_id ?? null,
      graceUntil: sub?.grace_until ?? null,
    };
  });

  return { clients: list, progress: summarizeCutover(list.map((c) => c.state)) };
}

/** Start cutover for one client: an incomplete subscription with a capture
 *  window (full access until it elapses) + a system-voice "set up your
 *  membership" nudge. Checkout (8.2) then flips them captured. */
export async function startClientCutover(
  orgId: string,
  clientId: string,
  tierId: string,
  graceDays = 21,
  now = new Date(),
): Promise<{ ok: boolean; reason?: string }> {
  const service = createServiceClient();

  const { data: client } = await service
    .from("clients")
    .select("id, org_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client || client.org_id !== orgId) return { ok: false, reason: "client_not_found" };

  const { data: tier } = await service
    .from("tiers")
    .select("id, org_id")
    .eq("id", tierId)
    .maybeSingle();
  if (!tier || tier.org_id !== orgId) return { ok: false, reason: "tier_not_found" };

  // Reuse the subscriptions row: incomplete + a grace window = full access.
  const { data: existing } = await service
    .from("subscriptions")
    .select("id, status")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Never downgrade a client who already has a live subscription (a stale tab or
  // double-submit racing a completed checkout) back to 'incomplete'.
  if (existing && (existing.status === "active" || existing.status === "trialing")) {
    return { ok: false, reason: "already_subscribed" };
  }

  const patch = {
    org_id: orgId,
    client_id: clientId,
    tier_id: tierId,
    status: "incomplete" as const,
    grace_until: graceUntil(now, graceDays),
  };
  if (existing) {
    await service.from("subscriptions").update(patch).eq("id", existing.id);
  } else {
    await service.from("subscriptions").insert(patch);
  }

  // System-voice thread card (P6) — the trainer never chases; the system invites.
  await service.from("notifications").upsert(
    {
      org_id: orgId,
      client_id: clientId,
      kind: "membership_setup",
      payload: { tier_id: tierId },
      channel: "in_app",
      status: "queued",
      dedupe_key: `cutover:${clientId}`,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );

  await recordAudit(service, {
    orgId,
    action: "cutover.started",
    entityType: "client",
    entityId: clientId,
    payload: { tier_id: tierId, grace_days: graceDays },
  });
  return { ok: true };
}

/** Enrol the trainer's org into the platform base-fee subscription with founder
 *  grace: existing (beta) orgs get a 60-day trial + founder pricing for life when
 *  the founder flag is on; new orgs get the standard 14-day trial. */
export async function enrollPlatformSubscription(
  orgId: string,
  now = new Date(),
): Promise<{ ok: boolean }> {
  const service = createServiceClient();
  const founder = founderGraceEnabled();
  const trialDays = founder ? 60 : 14;
  const trialEnd = new Date(now.getTime() + trialDays * 86_400_000).toISOString();

  await service.from("platform_subscriptions").upsert(
    {
      org_id: orgId,
      status: "trialing",
      trial_end: trialEnd,
      founder_pricing: founder,
    },
    { onConflict: "org_id", ignoreDuplicates: true },
  );
  await recordAudit(service, {
    orgId,
    action: "platform_sub.enrolled",
    entityType: "org",
    entityId: orgId,
    payload: { founder, trial_days: trialDays },
  });
  return { ok: true };
}

/** Hand uncaptured (grace-expired) cutover clients to the 8.4 dunning restricted
 *  state — never a hard cut. Idempotent + non-clobbering: it targets ONLY rows
 *  still 'incomplete' with an elapsed grace window, so a client already handed to
 *  dunning is not re-processed (no unbounded audit rows), and a trainer's
 *  extend-grace (which resets the row to 'incomplete' with a future window) is not
 *  reverted the next day. Called by the cutover cron. Returns the count moved. */
export async function expireCutoverGrace(orgId: string, now = new Date()): Promise<number> {
  const service = createServiceClient();
  const nowIso = now.toISOString();
  const { data: rows } = await service
    .from("subscriptions")
    .select("id, client_id, grace_until")
    .eq("org_id", orgId)
    .eq("status", "incomplete")
    .not("grace_until", "is", null)
    .lt("grace_until", nowIso);

  let moved = 0;
  for (const row of rows ?? []) {
    await service
      .from("subscriptions")
      .update({ status: "past_due", pause_reason: "dunning", dunning_stage: 3 })
      .eq("id", row.id);
    await service.from("clients").update({ status: "paused" }).eq("id", row.client_id).eq("org_id", orgId);
    await recordAudit(service, {
      orgId,
      action: "cutover.grace_expired",
      entityType: "client",
      entityId: row.client_id,
    });
    moved += 1;
  }
  return moved;
}
