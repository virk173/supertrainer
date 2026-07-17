import "server-only";

import { redirect } from "next/navigation";

import { getSessionClaims } from "@/lib/onboarding/state";
import { roleHomePath } from "@/lib/routes";
import { createServiceClient } from "@/lib/supabase/server";

export interface ConsentedClient {
  orgId: string;
  clientId: string;
  clientName?: string;
}

// Gate for the post-consent welcome steps (Phase 2.4/2.5). The consent gate must
// cover EVERY coaching surface, not just /portal — the notification walkthrough
// and especially the Stage B interview (which collects health disclosures and
// delivers coaching content) sit behind it too. Redirects an un-consented client
// to /consent, a non-client to their home, and an unauthenticated visitor to
// /login; otherwise returns the client's ids.
export async function requireConsentedClient(): Promise<ConsentedClient> {
  const { orgId, userId, role } = await getSessionClaims();
  if (!orgId || !userId) redirect("/login");
  if (role !== "client") redirect(roleHomePath(role));

  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id, consent_signed_at, intake")
    .eq("profile_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!client) redirect("/login");
  if (!client.consent_signed_at) redirect("/consent");

  return {
    orgId,
    clientId: client.id,
    clientName: (client.intake as { name?: string })?.name,
  };
}
