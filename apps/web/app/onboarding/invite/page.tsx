import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

import { InvitePanel } from "@/components/invite-panel";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Send invites — supertrainer" };

export default async function InviteStepPage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) redirect("/login?error=Please%20sign%20in%20again");
  if (role === "client") redirect("/portal");

  const supabase = await createClient();
  const [{ data: leads }, { data: invites }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, intake")
      .eq("org_id", orgId)
      .eq("status", "lead"),
    supabase.from("invites").select("client_id").eq("org_id", orgId),
  ]);

  const invitedIds = new Set((invites ?? []).map((i) => i.client_id));
  const candidates = (leads ?? [])
    .filter((l) => !invitedIds.has(l.id))
    .map((l) => {
      const intake = (l.intake ?? {}) as { email?: string; name?: string };
      return { id: l.id, email: intake.email ?? "", name: intake.name ?? "" };
    })
    .filter((c) => c.email);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-10 sm:py-14">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
        <Link href="/onboarding">
          <ArrowLeft aria-hidden="true" className="size-4" /> Back to checklist
        </Link>
      </Button>

      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Send your first invite
        </h1>
        <p className="text-sm text-muted-foreground">
          Invite an imported lead or a new email. Generate a branded link to copy
          or send by email — the client sets up their account when they accept.
        </p>
      </div>

      <InvitePanel candidates={candidates} />
    </main>
  );
}
