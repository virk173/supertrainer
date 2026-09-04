import { notFound } from "next/navigation";

import { DomainPanel } from "@/components/settings/domain-panel";
import { isDomainsConfigured } from "@/lib/domains/vercel";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Your domain — supertrainer" };

export default async function DomainPage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const service = createServiceClient();
  const [{ data: row }, { data: org }] = await Promise.all([
    service
      .from("custom_domains")
      .select("domain, status, verification, error, last_checked_at")
      .eq("org_id", orgId)
      .maybeSingle(),
    service.from("orgs").select("slug").eq("id", orgId).maybeSingle(),
  ]);

  return (
    <DomainPanel
      configured={isDomainsConfigured()}
      platformDomain={process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? null}
      slug={org?.slug ?? ""}
      domain={
        row
          ? {
              domain: row.domain,
              status: row.status,
              records: (row.verification ?? []) as {
                type: string;
                domain: string;
                value: string;
              }[],
              error: row.error,
              lastCheckedAt: row.last_checked_at,
            }
          : null
      }
    />
  );
}
