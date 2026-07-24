import { notFound } from "next/navigation";
import { CircleUser } from "lucide-react";

import { TrainerPlaceholder } from "@/components/trainer-placeholder";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Client — supertrainer" };

// Placeholder client profile — the forensic ledger lands in 7.5. Kept real
// enough that the ⌘K client search resolves to a named page today. Service-role
// read is org-scoped in code (standing rule: service-role tenancy).
export default async function TrainerClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id, intake, profiles:profile_id (display_name)")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (!client) notFound();

  const profile =
    (client.profiles as { display_name?: string | null } | null) ?? null;
  const intakeName = (client.intake as { name?: unknown } | null)?.name;
  const name =
    profile?.display_name ??
    (typeof intakeName === "string" ? intakeName : "Client");

  return (
    <TrainerPlaceholder
      title={name}
      icon={<CircleUser />}
      emptyTitle="Client profile coming soon"
      description="The forensic adherence ledger — the calendar grid, weight trend, progression charts, notes, and files — arrives in Phase 7.5. The per-client inbox arrives in 7.4."
    />
  );
}
