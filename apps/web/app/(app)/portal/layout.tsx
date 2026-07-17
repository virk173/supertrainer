import { redirect } from "next/navigation";

import { PortalShell } from "@/components/portal-shell";
import { getOrgTheme } from "@/lib/brand/theme";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { orgId, userId } = await getSessionClaims();

  // BLOCKING consent gate (Phase 2.3): no portal route renders for a client
  // until they've signed. This layout wraps every /portal/* route, so the guard
  // covers all of them. The denormalized clients.consent_signed_at is one
  // indexed lookup on the client's own row (the full evidence lives in consents).
  if (orgId && userId) {
    const service = createServiceClient();
    const { data: client } = await service
      .from("clients")
      .select("consent_signed_at")
      .eq("profile_id", userId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (client && !client.consent_signed_at) redirect("/consent");
  }

  // Brand the portal footer (trainer name + socials) from the client's org.
  const theme = orgId ? await getOrgTheme(orgId) : null;

  return (
    <PortalShell brandName={theme?.name} socials={theme?.socials ?? []}>
      {children}
    </PortalShell>
  );
}
