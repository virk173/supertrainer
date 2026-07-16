import { TrainerShell } from "@/components/trainer-shell";
import { getOnboardingState, getSessionOrgId } from "@/lib/onboarding/state";
import { isOnboardingComplete } from "@/lib/onboarding/steps";

export default async function TrainerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Show the resume-setup banner while any onboarding step is still 'todo'.
  const orgId = await getSessionOrgId();
  const resumeOnboarding = orgId
    ? !isOnboardingComplete(await getOnboardingState(orgId))
    : false;

  return (
    <TrainerShell resumeOnboarding={resumeOnboarding}>{children}</TrainerShell>
  );
}
