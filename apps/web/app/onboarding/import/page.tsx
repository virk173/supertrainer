import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

import { ImportWizard } from "@/components/import-wizard";
import { getSessionClaims } from "@/lib/onboarding/state";

export const metadata = { title: "Import clients — supertrainer" };

export default async function ImportStepPage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) redirect("/login?error=Please%20sign%20in%20again");
  if (role === "client") redirect("/portal");

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-10 sm:py-14">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
        <Link href="/onboarding">
          <ArrowLeft aria-hidden="true" className="size-4" /> Back to checklist
        </Link>
      </Button>

      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Import your clients
        </h1>
        <p className="text-sm text-muted-foreground">
          Bring your roster over from your old tool. We map the columns and
          import everyone as a lead — no invites go out until you send them.
        </p>
      </div>

      <ImportWizard />
    </main>
  );
}
