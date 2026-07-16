import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

import { StyleIngestion } from "@/components/style-ingestion";
import { getSessionClaims } from "@/lib/onboarding/state";
import { getOrgStyleProfiles } from "@/lib/style/profiles";

export const metadata = { title: "Teach your style — supertrainer" };

export default async function StyleStepPage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) redirect("/login?error=Please%20sign%20in%20again");
  if (role === "client") redirect("/portal");

  const profiles = await getOrgStyleProfiles(orgId);
  const drafts = profiles
    .filter((p) => p.status === "draft")
    .map((p) => ({ domain: p.domain, profile: p.profile, confidence: p.confidence ?? 1 }));
  const confirmedDomains = profiles
    .filter((p) => p.status === "confirmed")
    .map((p) => p.domain);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-10 sm:py-14">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
        <Link href="/onboarding">
          <ArrowLeft aria-hidden="true" className="size-4" /> Back to checklist
        </Link>
      </Button>

      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Teach the AI your coaching style
        </h1>
        <p className="text-sm text-muted-foreground">
          Drop in past diet plans, training splits, and check-in screenshots.
          The AI learns how you program and how you talk — then you confirm what
          it got right.
        </p>
      </div>

      <StyleIngestion
        orgId={orgId}
        initialDrafts={drafts}
        confirmedDomains={confirmedDomains}
      />
    </main>
  );
}
