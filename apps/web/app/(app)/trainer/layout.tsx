import { cookies } from "next/headers";

import { TrainerShell } from "@/components/trainer-shell";
import { getOnboardingState, getSessionClaims } from "@/lib/onboarding/state";
import { isOnboardingComplete } from "@/lib/onboarding/steps";
import { getPendingQueueCount } from "@/lib/queue/count";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export default async function TrainerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { orgId } = await getSessionClaims();

  // Collapse state persisted client-side (see TrainerShell) so the rail width
  // renders correctly on the server — no hydration flash.
  const cookieStore = await cookies();
  const initialCollapsed = cookieStore.get("st.sidebar")?.value === "collapsed";

  // Identity for the sidebar footer + the live queue badge. Everything is
  // org-scoped in code (service role bypasses RLS).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let orgName = "My coaching org";
  let userName = user?.email?.split("@")[0] ?? "Trainer";
  let pendingCount = 0;

  if (orgId) {
    const service = createServiceClient();
    const [org, profile, count] = await Promise.all([
      service.from("orgs").select("name").eq("id", orgId).maybeSingle(),
      user
        ? service
            .from("profiles")
            .select("display_name")
            .eq("id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      getPendingQueueCount(orgId),
    ]);
    orgName = org.data?.name ?? orgName;
    userName = profile.data?.display_name ?? userName;
    pendingCount = count;
  }

  const resumeOnboarding = orgId
    ? !isOnboardingComplete(await getOnboardingState(orgId))
    : false;

  return (
    <TrainerShell
      resumeOnboarding={resumeOnboarding}
      initialCollapsed={initialCollapsed}
      pendingCount={pendingCount}
      orgName={orgName}
      userName={userName}
      userEmail={user?.email ?? ""}
    >
      {children}
    </TrainerShell>
  );
}
