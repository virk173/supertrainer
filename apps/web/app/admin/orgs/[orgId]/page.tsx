import { notFound } from "next/navigation";

import { formatMicros } from "@supertrainer/ai/pricing";

import { OrgConsole } from "@/components/admin/org-console";
import { orgHealthRows } from "@/lib/admin/metrics";
import { DEFAULT_AI_BUDGET_MICROS } from "@/lib/admin/metrics-core";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminOrgPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const rows = await orgHealthRows();
  const health = rows.find((r) => r.orgId === orgId);
  if (!health) notFound();

  const service = createServiceClient();
  const [{ data: clients }, { data: flags }, { data: overrides }, { data: views }, { data: events }] =
    await Promise.all([
      service
        .from("clients")
        .select("id, status, is_demo, intake, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(25),
      service.from("feature_flags").select("key, description, enabled_default, rollout_percent"),
      service.from("feature_flag_overrides").select("flag_key, enabled").eq("org_id", orgId),
      service
        .from("impersonation_sessions")
        .select("id, reason, started_at, ended_at")
        .eq("org_id", orgId)
        .order("started_at", { ascending: false })
        .limit(5),
      service
        .from("webhook_events")
        .select("id, stripe_event_id, type, received_at, processed_at")
        .is("processed_at", null)
        .order("received_at", { ascending: false })
        .limit(10),
    ]);

  const overrideMap = new Map((overrides ?? []).map((o) => [o.flag_key, o.enabled]));

  return (
    <OrgConsole
      health={{
        orgId: health.orgId,
        name: health.name,
        clientCount: health.clientCount,
        clientMrrCents: health.clientMrrCents,
        platformMrrCents: health.platformMrrCents,
        aiSpend: formatMicros(health.aiSpendMicros),
        aiSpendMicros: health.aiSpendMicros,
        capMicros: health.aiBudgetMicros ?? DEFAULT_AI_BUDGET_MICROS,
        budgetDollars: health.aiBudgetMicros === null ? null : health.aiBudgetMicros / 1_000_000,
        budget: health.budget,
        throttled: health.throttled,
        margin: formatMicros(health.marginMicros),
        marginNegative: health.marginMicros < 0,
        zeroEditRate: health.zeroEditRate,
        pushSuccessRate: health.pushSuccessRate,
      }}
      clients={(clients ?? []).map((c) => ({
        id: c.id,
        status: c.status,
        isDemo: c.is_demo,
        name:
          (typeof c.intake === "object" && c.intake && "name" in c.intake
            ? String((c.intake as { name?: unknown }).name ?? "")
            : "") || "Unnamed client",
      }))}
      flags={(flags ?? []).map((f) => ({
        key: f.key,
        description: f.description,
        enabledDefault: f.enabled_default,
        rolloutPercent: f.rollout_percent,
        override: overrideMap.has(f.key) ? Boolean(overrideMap.get(f.key)) : null,
      }))}
      views={(views ?? []).map((v) => ({
        id: v.id,
        reason: v.reason,
        startedAt: v.started_at,
        endedAt: v.ended_at,
      }))}
      unprocessedEvents={(events ?? []).map((e) => ({
        id: e.id,
        stripeEventId: e.stripe_event_id,
        type: e.type,
        receivedAt: e.received_at,
      }))}
    />
  );
}
