import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

import {
  funnel,
  orgHealth,
  platformSummary,
  type FunnelStep,
  type OrgHealth,
  type PlatformSummary,
} from "./metrics-core";

// Phase 9.3 — the reader behind the console. Every number the admin sees comes
// from here; the arithmetic lives in metrics-core (pure, tested). Demo clients
// are excluded from every count, exactly as they are in billing.

type Service = ReturnType<typeof createServiceClient>;

const PERIOD_DAYS = 30;

function periodStart(now: Date): string {
  return new Date(now.getTime() - PERIOD_DAYS * 86_400_000).toISOString();
}

/** Org-health rollups for the whole platform. One query per fact, joined in
 *  memory — a handful of orgs at launch, and it stays honest under growth
 *  because every query is indexed on (org_id, …). */
export async function orgHealthRows(now = new Date()): Promise<OrgHealth[]> {
  const service: Service = createServiceClient();
  const since = periodStart(now);

  const [orgs, clients, subs, platformSubs, usage, drafts, notifs, lastEvents] = await Promise.all([
    service.from("orgs").select("id, name, created_at, ai_budget_micros, ai_throttled_at"),
    service.from("clients").select("org_id, status, is_demo"),
    service.from("subscriptions").select("org_id, status, tier_id"),
    service.from("platform_subscriptions").select("org_id, price_cents, status"),
    service.from("ai_usage").select("org_id, cost_micros").gte("occurred_at", since),
    service.from("drafts").select("org_id, status").gte("created_at", since),
    service.from("notifications").select("org_id, status").gte("created_at", since),
    service.from("events").select("org_id, occurred_at").gte("occurred_at", since),
  ]);

  // tier prices, to value each org's own client MRR
  const { data: tiers } = await service.from("tiers").select("id, org_id, price_cents");
  const tierPrice = new Map((tiers ?? []).map((t) => [t.id, t.price_cents]));

  const clientCount = new Map<string, number>();
  for (const c of clients.data ?? []) {
    if (c.is_demo || c.status !== "active") continue;
    clientCount.set(c.org_id, (clientCount.get(c.org_id) ?? 0) + 1);
  }

  const clientMrr = new Map<string, number>();
  for (const s of subs.data ?? []) {
    if (s.status !== "active" && s.status !== "trialing") continue;
    const price = s.tier_id ? (tierPrice.get(s.tier_id) ?? 0) : 0;
    clientMrr.set(s.org_id, (clientMrr.get(s.org_id) ?? 0) + price);
  }

  const platformMrr = new Map<string, number>();
  for (const p of platformSubs.data ?? []) {
    if (p.status === "canceled" || p.status === "trialing") continue;
    platformMrr.set(p.org_id, p.price_cents ?? 0);
  }

  const aiSpend = new Map<string, number>();
  for (const u of usage.data ?? []) {
    if (!u.org_id) continue;
    aiSpend.set(u.org_id, (aiSpend.get(u.org_id) ?? 0) + Number(u.cost_micros));
  }

  const approved = new Map<string, number>();
  const edited = new Map<string, number>();
  for (const d of drafts.data ?? []) {
    if (d.status === "approved") approved.set(d.org_id, (approved.get(d.org_id) ?? 0) + 1);
    else if (d.status === "edited" || d.status === "rewritten") {
      edited.set(d.org_id, (edited.get(d.org_id) ?? 0) + 1);
    }
  }

  const pushSent = new Map<string, number>();
  const pushFailed = new Map<string, number>();
  for (const n of notifs.data ?? []) {
    if (n.status === "sent") pushSent.set(n.org_id, (pushSent.get(n.org_id) ?? 0) + 1);
    else if (n.status === "failed") pushFailed.set(n.org_id, (pushFailed.get(n.org_id) ?? 0) + 1);
  }

  const lastActive = new Map<string, string>();
  for (const e of lastEvents.data ?? []) {
    const prev = lastActive.get(e.org_id);
    if (!prev || e.occurred_at > prev) lastActive.set(e.org_id, e.occurred_at);
  }

  return (orgs.data ?? [])
    .map((o) =>
      orgHealth({
        orgId: o.id,
        name: o.name,
        createdAt: o.created_at,
        clientCount: clientCount.get(o.id) ?? 0,
        clientMrrCents: clientMrr.get(o.id) ?? 0,
        platformMrrCents: platformMrr.get(o.id) ?? 0,
        aiSpendMicros: aiSpend.get(o.id) ?? 0,
        aiBudgetMicros: o.ai_budget_micros === null ? null : Number(o.ai_budget_micros),
        aiThrottledAt: o.ai_throttled_at,
        draftsApproved: approved.get(o.id) ?? 0,
        draftsEdited: edited.get(o.id) ?? 0,
        pushSent: pushSent.get(o.id) ?? 0,
        pushFailed: pushFailed.get(o.id) ?? 0,
        lastActiveAt: lastActive.get(o.id) ?? null,
      }),
    )
    .sort((a, b) => b.clientCount - a.clientCount || a.name.localeCompare(b.name));
}

export interface PlatformMetrics {
  summary: PlatformSummary;
  activation: FunnelStep[];
  clientFunnel: FunnelStep[];
  /** orgs whose base fee has no synced price — MRR is understated by this many */
  unpricedOrgs: number;
}

/** The platform dashboard: money, activation, and the client funnel. */
export async function platformMetrics(rows: OrgHealth[]): Promise<PlatformMetrics> {
  const service: Service = createServiceClient();

  const [{ data: steps }, { data: platformSubs }, { data: leads }, { data: clients }] =
    await Promise.all([
      service.from("org_onboarding_state").select("org_id, step, status"),
      service.from("platform_subscriptions").select("org_id, price_cents, status"),
      service.from("leads").select("id, status"),
      service.from("clients").select("id, status, is_demo"),
    ]);

  // Activation = how far orgs get through the P1 checklist.
  const done = new Map<string, Set<string>>();
  for (const s of steps ?? []) {
    if (s.status !== "done") continue;
    const set = done.get(s.org_id) ?? new Set<string>();
    set.add(s.step);
    done.set(s.org_id, set);
  }
  const withStep = (step: string) =>
    [...done.values()].filter((set) => set.has(step)).length;

  const activation = funnel([
    { key: "signed_up", label: "Signed up", count: rows.length },
    { key: "brand", label: "Branded", count: withStep("brand") },
    { key: "tiers", label: "Tiers set", count: withStep("tiers") },
    { key: "style", label: "Style ingested", count: withStep("style") },
    { key: "payments", label: "Payments connected", count: withStep("payments") },
    { key: "first_client", label: "First client", count: rows.filter((r) => r.clientCount > 0).length },
  ]);

  const realClients = (clients ?? []).filter((c) => !c.is_demo);
  const clientFunnel = funnel([
    { key: "lead", label: "Leads", count: (leads ?? []).length },
    {
      key: "converted",
      label: "Converted",
      count: (leads ?? []).filter((l) => l.status === "converted").length,
    },
    { key: "onboarding", label: "Onboarding", count: realClients.filter((c) => c.status === "onboarding").length },
    { key: "active", label: "Active", count: realClients.filter((c) => c.status === "active").length },
  ]);

  const unpricedOrgs = (platformSubs ?? []).filter(
    (p) => p.status !== "canceled" && p.status !== "trialing" && p.price_cents === null,
  ).length;

  return { summary: platformSummary(rows), activation, clientFunnel, unpricedOrgs };
}
