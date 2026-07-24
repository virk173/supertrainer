"use server";

import { getSessionClaims } from "@/lib/onboarding/state";
import { getHomeDigest, type HomeDigest } from "@/lib/trainer/home";
import { createServiceClient } from "@/lib/supabase/server";

export type ClientHit = { id: string; name: string };

type LiveDigest = Pick<HomeDigest, "pending" | "escalations" | "estimatedMinutes">;

// Realtime refresh for the Home "Needs you today" panel — the fast-changing
// slice (pending counts + escalations) recomputed when a draft lands or an
// escalation resolves. Slow-moving signals (adherence, at-risk) refresh on nav.
export async function refreshHomeDigestAction(): Promise<LiveDigest | null> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) return null;
  return getHomeDigest(orgId, new Date());
}

// Client lookup for the ⌘K palette. Service-role → org-scoped in code (standing
// rule: service-role tenancy). An empty query returns the most-recent clients (a
// useful default the trainer can arrow through); a query filters the resolved
// name (display name, falling back to the intake name) so intake-only leads
// still surface. 7.5 replaces this with server-side roster search.
export async function searchClientsAction(query: string): Promise<ClientHit[]> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) return [];

  const service = createServiceClient();
  const { data } = await service
    .from("clients")
    .select("id, intake, profiles:profile_id (display_name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  const hits: ClientHit[] = (data ?? []).map((row) => {
    const profile =
      (row.profiles as { display_name?: string | null } | null) ?? null;
    const intakeName = (row.intake as { name?: unknown } | null)?.name;
    const name =
      profile?.display_name ??
      (typeof intakeName === "string" ? intakeName : "Client");
    return { id: row.id as string, name };
  });

  const needle = query.trim().toLowerCase();
  const matched = needle
    ? hits.filter((hit) => hit.name.toLowerCase().includes(needle))
    : hits;
  return matched.slice(0, 8);
}
