import { PortalShell } from "@/components/portal-shell";
import { getOrgTheme } from "@/lib/brand/theme";
import { getSessionClaims } from "@/lib/onboarding/state";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Brand the portal footer (trainer name + socials) from the client's org.
  const { orgId } = await getSessionClaims();
  const theme = orgId ? await getOrgTheme(orgId) : null;

  return (
    <PortalShell brandName={theme?.name} socials={theme?.socials ?? []}>
      {children}
    </PortalShell>
  );
}
