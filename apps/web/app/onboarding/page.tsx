import { redirect } from "next/navigation";

import { Button } from "@supertrainer/ui/components/button";

import { signOut } from "@/app/(auth)/actions";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { getOnboardingState } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Get set up — supertrainer" };

// Trainer activation checklist (Phase 1.1). Each step deep-links into its own
// flow (built across 1.2–1.7) and reports completion back here.
export default async function OnboardingPage() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId =
    typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;

  if (!userId) {
    redirect("/login?error=Please%20sign%20in%20again");
  }

  // Filter to the caller's own row: owners/staff can read every profile in
  // their org (RLS), so an unfiltered maybeSingle() errors once the org has
  // more than one member.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, org_id, orgs(name)")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    redirect("/login?error=Please%20sign%20in%20again");
  }

  if (profile.role === "client") {
    redirect("/portal");
  }

  const state = await getOnboardingState(profile.org_id);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-10 sm:py-16">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-success" data-testid="org-ready">
            {profile.orgs?.name ?? "Your org"} is ready
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Let&apos;s get you activated
          </h1>
          <p className="text-sm text-muted-foreground">
            Work through these steps in any order. Style ingestion is the one
            that makes every AI draft sound like you.
          </p>
        </div>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </div>

      <OnboardingChecklist state={state} />
    </main>
  );
}
