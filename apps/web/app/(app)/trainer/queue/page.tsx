import { notFound } from "next/navigation";

import { QueueView } from "@/components/queue/queue-view";
import { getSessionClaims } from "@/lib/onboarding/state";
import { getQueueData, QUEUE_TABS, type QueueTab } from "@/lib/trainer/queue";

export const metadata = { title: "Review queue — supertrainer" };

const VALID_TABS = new Set<string>(QUEUE_TABS.map((t) => t.tab));

// Phase 7.3 — the global review queue: every pending item across replies, diet
// plans, splits, progressions, escalations, and flags in one triage surface.
export default async function TrainerQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const sp = await searchParams;
  const tab = (sp.tab && VALID_TABS.has(sp.tab) ? sp.tab : "all") as QueueTab;
  const { items, counts } = await getQueueData(orgId, new Date());

  return <QueueView tab={tab} initialItems={items} initialCounts={counts} />;
}
