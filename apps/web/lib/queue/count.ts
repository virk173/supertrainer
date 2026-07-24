import { createServiceClient } from "@/lib/supabase/server";

// Total items waiting on the trainer: pending drafts + unresolved escalations —
// the number the sidebar Queue badge and the Home digest lead with. The
// service-role client bypasses RLS, so every query is org-scoped in code
// (standing rule: service-role tenancy is a code responsibility). Two head-only
// count queries, run together.
export async function getPendingQueueCount(orgId: string): Promise<number> {
  const service = createServiceClient();
  const [drafts, escalations] = await Promise.all([
    service
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending"),
    service
      .from("escalations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .neq("status", "resolved"),
  ]);
  return (drafts.count ?? 0) + (escalations.count ?? 0);
}
