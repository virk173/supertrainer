import { notFound } from "next/navigation";

import { ClientProfile } from "@/components/profile/client-profile";
import { getSessionClaims } from "@/lib/onboarding/state";
import { getClientProfile } from "@/lib/trainer/profile";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Client — supertrainer" };

// Phase 7.5 — the forensic client profile (trainer lens): the day-by-day
// adherence grid + weight trend. Org ownership is verified before render.
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
    .select("id, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!client || client.org_id !== orgId) notFound();

  const profile = await getClientProfile(id, new Date());
  if (!profile) notFound();

  return <ClientProfile profile={profile} />;
}
