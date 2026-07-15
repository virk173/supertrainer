import { redirect } from "next/navigation";

import { Button } from "@supertrainer/ui/components/button";

import { signOut } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Onboarding — supertrainer" };

// Placeholder — Phase 1 replaces this with the trainer activation flow
// (style-profile ingestion, tiers, brand, first client invite).
export default async function OnboardingPage() {
  const supabase = await createClient();

  // RLS: users read their own profile; staff read org profiles.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, org_id, orgs(name, slug)")
    .maybeSingle();

  if (!profile) {
    // No profile means bootstrap hasn't run (e.g. stale session) — sign the
    // user back in through the confirm flow.
    redirect("/login?error=Please%20sign%20in%20again");
  }

  if (profile.role === "client") {
    redirect("/portal");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-success" data-testid="org-ready">
          Your org is ready
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome, {profile.display_name ?? "coach"}
        </h1>
        <p className="max-w-md text-muted-foreground">
          <span className="font-medium text-foreground">
            {profile.orgs?.name}
          </span>{" "}
          is set up. Trainer onboarding (style profile, tiers, branding) lands
          in Phase 1 — for now, head to your dashboard.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild>
          <a href="/trainer">Go to dashboard</a>
        </Button>
        <form action={signOut}>
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
