import { notFound } from "next/navigation";

import { DataRights } from "@/components/settings/data-rights";
import { DELETION_GRACE_DAYS } from "@/lib/data/deletion";
import { orgExportSpecs } from "@/lib/data/registry";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Data & privacy — supertrainer" };

export default async function DataSettingsPage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const service = createServiceClient();
  const [{ data: org }, { data: jobs }, { data: pending }] = await Promise.all([
    service.from("orgs").select("data_export_monthly").eq("id", orgId).maybeSingle(),
    service
      .from("export_jobs")
      .select("id, status, size_bytes, requested_at, expires_at, error, scope")
      .eq("org_id", orgId)
      .eq("scope", "org")
      .order("requested_at", { ascending: false })
      .limit(5),
    service
      .from("deletion_requests")
      .select("id, grace_until, requested_at")
      .eq("org_id", orgId)
      .eq("scope", "org")
      .eq("status", "pending")
      .maybeSingle(),
  ]);

  return (
    <DataRights
      isOwner={role === "owner"}
      monthly={Boolean(org?.data_export_monthly)}
      graceDays={DELETION_GRACE_DAYS}
      tables={orgExportSpecs().map((s) => s.table as string)}
      exports={(jobs ?? []).map((j) => ({
        id: j.id,
        status: j.status,
        sizeBytes: j.size_bytes,
        requestedAt: j.requested_at,
        expiresAt: j.expires_at,
        error: j.error,
      }))}
      scheduledDeletion={
        pending ? { id: pending.id, graceUntil: pending.grace_until } : null
      }
    />
  );
}
