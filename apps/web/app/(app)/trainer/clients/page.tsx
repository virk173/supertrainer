import { notFound } from "next/navigation";
import { Users } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { EmptyState } from "@supertrainer/ui/components/empty-state";

import { RosterTable } from "@/components/roster/roster-table";
import { getSessionClaims } from "@/lib/onboarding/state";
import { getRoster } from "@/lib/trainer/roster";

export const metadata = { title: "Clients — supertrainer" };

// Phase 7.5 — the client roster: a filterable, sortable data table over the whole
// org, each row carrying the coded adherence lens, last activity, and renewal.
export default async function TrainerClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const sp = await searchParams;
  const data = await getRoster(orgId, new Date());

  if (data.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight" data-testid="roster-title">
          Clients
        </h1>
        <EmptyState
          icon={<Users />}
          title="No clients yet"
          description="Invite your first client to build your roster — adherence, plans, and renewals all land here."
          action={
            <Button asChild>
              <a href="/trainer/prospects">Invite a client</a>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <RosterTable data={data} initialSearch={sp.q ?? ""} initialStatus={sp.status ?? "all"} />
  );
}
