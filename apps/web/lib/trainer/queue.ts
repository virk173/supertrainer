import { createServiceClient } from "@/lib/supabase/server";

import type { QueueCounts, QueueData, QueueItem } from "@/lib/trainer/queue-types";

// Re-export the pure model so server callers can keep a single import path.
export {
  QUEUE_TABS,
  itemsForTab,
  type QueueCounts,
  type QueueData,
  type QueueItem,
  type QueueItemType,
  type QueueTab,
} from "@/lib/trainer/queue-types";

function resolveName(row: {
  intake?: unknown;
  profiles?: { display_name?: string | null } | null;
}): string {
  const display = row.profiles?.display_name;
  if (display) return display;
  const intake = row.intake;
  const intakeName =
    intake && typeof intake === "object"
      ? (intake as { name?: unknown }).name
      : undefined;
  return typeof intakeName === "string" ? intakeName : "Client";
}

function ageHours(iso: string, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 3_600_000));
}

function escalationReason(categories: string[], selfHarm: boolean): string {
  if (selfHarm) return "Flagged for wellbeing — review personally";
  if (categories.includes("pain") || categories.includes("injury"))
    return "Pain or injury mentioned";
  if (categories.includes("plan_change")) return "Wants a plan change";
  if (categories.length > 0) return `Flagged: ${categories[0].replace(/_/g, " ")}`;
  return "Needs your attention";
}

function metaFlag(meta: unknown, key: string): boolean {
  return Boolean((meta as Record<string, unknown> | null)?.[key]);
}

// Every pending review item across the four streams (+ flags), normalized to one
// shape and sorted oldest-first (the SLA order — the longest-waiting leads). The
// service role bypasses RLS, so each query is org-scoped in code.
export async function getQueueData(orgId: string, now: Date): Promise<QueueData> {
  const service = createServiceClient();
  const staleOnboarding = new Date(now.getTime() - 3 * 86_400_000).toISOString();

  const [clientsRes, draftsRes, plansRes, splitsRes, escalationsRes, flagsRes] =
    await Promise.all([
      service
        .from("clients")
        .select("id, intake, profiles:profile_id (display_name)")
        .eq("org_id", orgId),
      service
        .from("drafts")
        .select("id, client_id, category, draft_text, created_at, messages:message_id (body)")
        .eq("org_id", orgId)
        .eq("status", "pending"),
      service
        .from("plans")
        .select("id, client_id, version, content, created_at")
        .eq("org_id", orgId)
        .eq("status", "draft"),
      service
        .from("splits")
        .select("id, client_id, version, meta, based_on_split_id, created_at")
        .eq("org_id", orgId)
        .eq("status", "draft"),
      service
        .from("escalations")
        .select("id, client_id, categories, self_harm, excerpt, created_at")
        .eq("org_id", orgId)
        .neq("status", "resolved"),
      service
        .from("clients")
        .select("id, intake, created_at, profiles:profile_id (display_name)")
        .eq("org_id", orgId)
        .eq("status", "onboarding")
        .lt("created_at", staleOnboarding),
    ]);

  const nameOf = new Map(
    (clientsRes.data ?? []).map((c) => [c.id as string, resolveName(c)]),
  );
  const name = (id: string) => nameOf.get(id) ?? "Client";
  const items: QueueItem[] = [];

  for (const d of draftsRes.data ?? []) {
    const trigger = (d.messages as { body?: string | null } | null)?.body ?? "";
    items.push({
      key: `reply:${d.id}`,
      id: d.id as string,
      type: "reply",
      clientId: d.client_id as string,
      clientName: name(d.client_id as string),
      ageHours: ageHours(d.created_at as string, now),
      preview: trigger || (d.draft_text as string),
      draftText: d.draft_text as string,
      triggerText: trigger,
      category: d.category as string,
    });
  }

  for (const p of plansRes.data ?? []) {
    items.push({
      key: `plan:${p.id}`,
      id: p.id as string,
      type: "plan",
      clientId: p.client_id as string,
      clientName: name(p.client_id as string),
      ageHours: ageHours(p.created_at as string, now),
      preview: `Diet plan v${p.version}`,
      reviewHref: `/trainer/plans/${p.id}/review`,
      needsAttention: metaFlag(p.content, "needsAttention"),
    });
  }

  for (const s of splitsRes.data ?? []) {
    const isProgression = Boolean(s.based_on_split_id);
    items.push({
      key: `split:${s.id}`,
      id: s.id as string,
      type: isProgression ? "progression" : "split",
      clientId: s.client_id as string,
      clientName: name(s.client_id as string),
      ageHours: ageHours(s.created_at as string, now),
      preview: `${isProgression ? "Progression" : "Training split"} v${s.version}`,
      reviewHref: `/trainer/splits/${s.id}/review`,
      needsAttention: metaFlag(s.meta, "needsAttention"),
    });
  }

  for (const e of escalationsRes.data ?? []) {
    items.push({
      key: `escalation:${e.id}`,
      id: e.id as string,
      type: "escalation",
      clientId: e.client_id as string,
      clientName: name(e.client_id as string),
      ageHours: ageHours(e.created_at as string, now),
      preview: escalationReason((e.categories as string[]) ?? [], e.self_harm as boolean),
      reviewHref: `/trainer/clients/${e.client_id}/inbox`,
      selfHarm: e.self_harm as boolean,
      categories: (e.categories as string[]) ?? [],
      excerpt: (e.excerpt as string | null) ?? undefined,
    });
  }

  for (const c of flagsRes.data ?? []) {
    items.push({
      key: `flag:${c.id}`,
      id: c.id as string,
      type: "flag",
      clientId: c.id as string,
      clientName: resolveName(c),
      ageHours: ageHours(c.created_at as string, now),
      preview: "Onboarding stalled — hasn't finished setup",
      reviewHref: `/trainer/clients/${c.id}`,
    });
  }

  // Oldest first: the longest-waiting item is the most urgent (SLA order).
  items.sort((a, b) => b.ageHours - a.ageHours);

  const counts: QueueCounts = {
    all: items.length,
    replies: items.filter((i) => i.type === "reply").length,
    plans: items.filter((i) => i.type === "plan").length,
    splits: items.filter((i) => i.type === "split").length,
    progressions: items.filter((i) => i.type === "progression").length,
    escalations: items.filter((i) => i.type === "escalation").length,
    flags: items.filter((i) => i.type === "flag").length,
  };

  return { items, counts };
}
