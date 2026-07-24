import { redirect } from "next/navigation";

import { PortalShell } from "@/components/portal-shell";
import { getOrgTheme } from "@/lib/brand/theme";
import { needsConsent } from "@/lib/consent/versions";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { orgId, userId } = await getSessionClaims();

  // BLOCKING consent gate (Phase 2.3 + PO-3): no portal route renders for a
  // client until they've signed the CURRENT agreement. This layout wraps every
  // /portal/* route, so the guard covers all of them. The denormalized
  // clients.consent_doc_version is one indexed lookup on the client's own row
  // (the full append-only evidence lives in consents).
  let pushDegraded = false;
  let chatBadge = 0;
  if (orgId && userId) {
    const service = createServiceClient();
    const { data: client } = await service
      .from("clients")
      .select("id, consent_doc_version, push_degraded_at")
      .eq("profile_id", userId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (client && needsConsent(client.consent_doc_version)) redirect("/consent");
    if (client) {
      // P6.2: every push endpoint died → offer to re-enable (banner).
      pushDegraded = Boolean(client.push_degraded_at);
      // Unread inbound (coach/assistant/system) → the Chat-tab badge count.
      const { count } = await service
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .neq("sender", "client")
        .is("read_at", null);
      chatBadge = count ?? 0;
    }
  }

  // Brand the portal footer (trainer name + socials) from the client's org.
  const theme = orgId ? await getOrgTheme(orgId) : null;

  return (
    <PortalShell
      brandName={theme?.name}
      socials={theme?.socials ?? []}
      chatBadge={chatBadge}
      pushDegraded={pushDegraded}
    >
      {children}
    </PortalShell>
  );
}
