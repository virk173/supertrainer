import { createServiceClient } from "@/lib/supabase/server";

// The trainer's review queue is four streams: reply drafts (P6.4), diet-plan
// drafts (P4), training-split drafts (P5), and open escalations (P6.3). One
// number the sidebar badge + Home lead with; the breakdown feeds the digest and
// the queue tabs. Service role bypasses RLS, so counts are org-scoped in code
// (standing rule: service-role tenancy is a code responsibility).

export interface PendingBreakdown {
  replies: number;
  plans: number;
  splits: number;
  escalations: number;
  total: number;
}

export async function getPendingBreakdown(
  orgId: string,
): Promise<PendingBreakdown> {
  const service = createServiceClient();
  const [replies, plans, splits, escalations] = await Promise.all([
    service
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending"),
    service
      .from("plans")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "draft"),
    service
      .from("splits")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "draft"),
    service
      .from("escalations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .neq("status", "resolved"),
  ]);

  const r = replies.count ?? 0;
  const p = plans.count ?? 0;
  const s = splits.count ?? 0;
  const e = escalations.count ?? 0;
  return { replies: r, plans: p, splits: s, escalations: e, total: r + p + s + e };
}

export async function getPendingQueueCount(orgId: string): Promise<number> {
  return (await getPendingBreakdown(orgId)).total;
}
