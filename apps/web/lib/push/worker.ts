import type { SupabaseClient } from "@supabase/supabase-js";

import { tzTime } from "@/lib/ledger/tz";
import { decideLadder, type LadderStage } from "@/lib/push/ladder";
import { sendDigestEmail } from "@/lib/push/digest";
import { sendWebPush, type PushFn } from "@/lib/push/send";
import { type QuietHours } from "@/lib/reminders/decide";

// Phase 6.2 — the delivery worker: drains the P3.6 `notifications` queue, walks
// each row up the ladder (decideLadder), sends the web push, prunes dead endpoints
// (404/410 → soft-revoke), auto-downgrades a client whose every endpoint has died,
// and folds the evening's still-unread items into one email digest per client.
// The pusher + digest sender are injectable so CI drives the real control flow
// with zero network. Idempotent: it re-reads `stage` each tick, so re-runs are safe.

const DEFAULT_QUIET: QuietHours = { start: "21:30", end: "07:30" };
// After this many failed (non-dead) push attempts, fall back to the badge rather
// than retry forever.
const MAX_PUSH_ATTEMPTS = 3;
const ACTIVE_STAGES: LadderStage[] = ["queued", "pushed", "badged"];

export interface DeliveryOptions {
  clientIds?: string[];
  push?: PushFn;
  sendDigest?: (to: string, params: Parameters<typeof sendDigestEmail>[1]) => Promise<{ sent: boolean }>;
}

export interface DeliveryResult {
  pushed: number;
  badged: number;
  digested: number;
  pruned: number;
  degraded: number;
  emailed: number;
}

interface NotifRow {
  id: string;
  org_id: string;
  client_id: string;
  kind: string;
  channel: string;
  payload: Record<string, unknown> | null;
  stage: string;
  sent_at: string | null;
  attempts: number;
  created_at: string;
}

interface SubRow {
  id: string;
  endpoint: string;
  keys: { p256dh?: string; auth?: string } | null;
}

function deepLinkFor(kind: string): string {
  switch (kind) {
    case "message":
      return "/portal/chat";
    case "meal":
      return "/portal/log";
    case "plan_ready":
      return "/portal/plan";
    case "split_ready":
      return "/portal/train";
    default:
      return "/portal";
  }
}

function notifText(n: NotifRow): string {
  const p = n.payload ?? {};
  const copy = p.copy;
  if (typeof copy === "string" && copy) return copy;
  const snippet = p.snippet;
  if (typeof snippet === "string" && snippet) return snippet;
  return "New update from your coach";
}

export async function runDeliveryLadder(
  db: SupabaseClient,
  now: Date,
  opts: DeliveryOptions = {},
): Promise<DeliveryResult> {
  const push = opts.push ?? sendWebPush;
  const sendDigest = opts.sendDigest ?? sendDigestEmail;
  const res: DeliveryResult = { pushed: 0, badged: 0, digested: 0, pruned: 0, degraded: 0, emailed: 0 };

  let q = db
    .from("notifications")
    .select("id, org_id, client_id, kind, channel, payload, stage, sent_at, attempts, created_at")
    .is("seen_at", null)
    .in("stage", ACTIVE_STAGES)
    .order("created_at", { ascending: true });
  if (opts.clientIds) q = q.in("client_id", opts.clientIds);
  const { data: notifs, error } = await q;
  if (error) throw error;
  if (!notifs || notifs.length === 0) return res;

  const clientIds = [...new Set((notifs as NotifRow[]).map((n) => n.client_id))];

  // Batch-load everything the ladder needs per client (no N+1).
  const [{ data: clients }, { data: subs }, { data: rules }] = await Promise.all([
    db
      .from("clients")
      .select("id, org_id, notification_channel, push_degraded_at, profiles:profile_id (timezone), orgs:org_id (name)")
      .in("id", clientIds),
    db
      .from("push_subscriptions")
      .select("id, client_id, endpoint, keys")
      .in("client_id", clientIds)
      .is("revoked_at", null),
    db.from("reminder_rules").select("client_id, quiet_hours").in("client_id", clientIds),
  ]);

  const clientById = new Map((clients ?? []).map((c) => [c.id as string, c]));
  const subsByClient = new Map<string, SubRow[]>();
  for (const s of (subs ?? []) as (SubRow & { client_id: string })[]) {
    const list = subsByClient.get(s.client_id) ?? [];
    list.push(s);
    subsByClient.set(s.client_id, list);
  }
  const quietByClient = new Map<string, QuietHours>();
  for (const r of rules ?? []) {
    if (!quietByClient.has(r.client_id as string)) {
      quietByClient.set(r.client_id as string, (r.quiet_hours as QuietHours) ?? DEFAULT_QUIET);
    }
  }

  const nowIso = now.toISOString();
  const revokedEndpoints = new Set<string>(); // subscription ids pruned this run
  // Per client: the notifications selected for tonight's digest (id + snippet). The
  // stage is only advanced to 'digested' AFTER the email actually sends, so a Resend
  // outage leaves them 'badged' to retry, not silently dropped.
  const digestByClient = new Map<string, { id: string; firstLine: string }[]>();

  for (const n of notifs as NotifRow[]) {
    const client = clientById.get(n.client_id);
    if (!client) continue;
    const timezone = (client.profiles as { timezone?: string } | null)?.timezone ?? "UTC";
    const localTime = tzTime(timezone, now);
    const quietHours = quietByClient.get(n.client_id) ?? DEFAULT_QUIET;
    const liveSubs = (subsByClient.get(n.client_id) ?? []).filter((s) => !revokedEndpoints.has(s.id));

    const action = decideLadder({
      stage: n.stage as LadderStage,
      createdAt: n.created_at,
      sentAt: n.sent_at,
      seenAt: null,
      now: nowIso,
      localTime,
      quietHours,
      hasLivePush: liveSubs.length > 0,
    });

    if (action === "hold" || action === "done") continue;

    if (action === "send_push") {
      const payload = {
        title: (client.orgs as { name?: string } | null)?.name ?? "Your coach",
        body: notifText(n),
        url: deepLinkFor(n.kind),
        tag: n.id,
      };
      const results = await Promise.all(liveSubs.map((s) => attemptPush(push, s, payload)));
      let anyOk = false;
      for (let i = 0; i < results.length; i++) {
        const r = results[i]!;
        if ("ok" in r && r.ok) anyOk = true;
        if ("dead" in r && r.dead) {
          await db.from("push_subscriptions").update({ revoked_at: nowIso }).eq("id", liveSubs[i]!.id);
          revokedEndpoints.add(liveSubs[i]!.id);
          res.pruned++;
        }
      }
      const attempts = n.attempts + 1;
      const allDead = liveSubs.length > 0 && liveSubs.every((s) => revokedEndpoints.has(s.id));
      if (anyOk) {
        await db.from("notifications").update({ stage: "pushed", sent_at: nowIso, attempts, last_attempt_at: nowIso }).eq("id", n.id);
        res.pushed++;
      } else if (allDead || attempts >= MAX_PUSH_ATTEMPTS) {
        // Can't push (endpoints gone, or repeatedly failing) → drop to the badge.
        await db.from("notifications").update({ stage: "badged", attempts, last_attempt_at: nowIso }).eq("id", n.id);
        res.badged++;
      } else {
        // Transient failure — leave queued for the next tick.
        await db.from("notifications").update({ attempts, last_attempt_at: nowIso }).eq("id", n.id);
      }
    } else if (action === "badge") {
      await db.from("notifications").update({ stage: "badged", last_attempt_at: nowIso }).eq("id", n.id);
      res.badged++;
    } else if (action === "email_digest") {
      // Select it for the digest but DON'T terminalize yet — that happens only if
      // the email sends (below). Until then it stays 'badged' and retries.
      const items = digestByClient.get(n.client_id) ?? [];
      items.push({ id: n.id, firstLine: notifText(n) });
      digestByClient.set(n.client_id, items);
    }
  }

  // Auto-downgrade any push-channel client whose every endpoint is now dead, and
  // send one digest email per client that accumulated items this run.
  for (const clientId of clientIds) {
    const client = clientById.get(clientId);
    if (!client) continue;
    const liveSubs = (subsByClient.get(clientId) ?? []).filter((s) => !revokedEndpoints.has(s.id));
    if (client.notification_channel === "push" && liveSubs.length === 0 && !client.push_degraded_at) {
      await db
        .from("clients")
        .update({ notification_channel: "email_only", push_degraded_at: nowIso })
        .eq("id", clientId);
      res.degraded++;
    }

    const items = digestByClient.get(clientId);
    if (items && items.length > 0) {
      const email = await clientEmail(db, clientId);
      if (email) {
        const trainerName = (client.orgs as { name?: string } | null)?.name ?? "Your coach";
        const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://supertrainer-web.vercel.app";
        const { sent } = await sendDigest(email, {
          trainerName,
          items: items.map((i) => ({ firstLine: i.firstLine })),
          portalUrl: `${base}/portal`,
        });
        if (sent) {
          // Terminalize ONLY the items that actually went out.
          await db.from("notifications").update({ stage: "digested", last_attempt_at: nowIso }).in(
            "id",
            items.map((i) => i.id),
          );
          res.emailed++;
          res.digested += items.length;
        }
      }
    }
  }

  return res;
}

async function attemptPush(push: PushFn, sub: SubRow, payload: unknown) {
  if (!sub.keys?.p256dh || !sub.keys?.auth) return { dead: true as const };
  return push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, payload);
}

// The client's email lives on auth.users (not the clients row) — fetch it via the
// service-role admin API for the digest recipient.
async function clientEmail(db: SupabaseClient, clientId: string): Promise<string | null> {
  const { data: client } = await db.from("clients").select("profile_id").eq("id", clientId).maybeSingle();
  if (!client?.profile_id) return null;
  const { data } = await db.auth.admin.getUserById(client.profile_id as string);
  return data.user?.email ?? null;
}
