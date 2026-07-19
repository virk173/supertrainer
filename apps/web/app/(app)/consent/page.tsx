import { redirect } from "next/navigation";

import { getOrgTheme } from "@/lib/brand/theme";
import { CONSENT_DOC_VERSION, renderConsentDoc } from "@/lib/consent/doc";
import { getSessionClaims } from "@/lib/onboarding/state";
import { roleHomePath } from "@/lib/routes";
import { createServiceClient } from "@/lib/supabase/server";
import { ConsentForm } from "@/components/consent-form";

export const metadata = { title: "Coaching agreement" };

// Blocking consent gate (Phase 2.3). Reached when an un-consented client tries a
// portal route. Self-guards: only a client with a client record and no prior
// consent sees the form; everyone else is routed away.
export default async function ConsentPage() {
  const { orgId, userId, role } = await getSessionClaims();
  if (!orgId || !userId) redirect("/login");
  if (role !== "client") redirect(roleHomePath(role));

  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id, consent_signed_at")
    .eq("profile_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!client) redirect("/login");
  if (client.consent_signed_at) redirect("/portal");

  const theme = await getOrgTheme(orgId);
  const trainerName = theme?.name ?? "Your coach";
  const docText = renderConsentDoc({ trainerName, businessName: trainerName });

  return (
    <main
      style={theme?.vars}
      className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-6 py-8"
    >
      <header className="mb-4">
        <p className="metric-label text-muted-foreground">{trainerName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Before we begin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Please read and sign the coaching agreement to continue.
        </p>
      </header>
      <ConsentForm docText={docText} docVersion={CONSENT_DOC_VERSION} />
    </main>
  );
}
