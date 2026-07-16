import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

import { completeStep } from "@/app/onboarding/actions";
import { getSessionOrgId } from "@/lib/onboarding/state";
import { getStepConfig, isOnboardingStep } from "@/lib/onboarding/steps";

// Generic placeholder for a checklist step's flow. Phases 1.2–1.7 add static
// routes (/onboarding/brand, /onboarding/style, …) that take routing priority
// over this dynamic segment and replace it with the real flow — each still
// calling completeStep() to report back to the checklist.
export default async function OnboardingStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  if (!isOnboardingStep(step)) notFound();

  const orgId = await getSessionOrgId();
  if (!orgId) redirect("/login?error=Please%20sign%20in%20again");

  const config = getStepConfig(step);

  async function markComplete() {
    "use server";
    await completeStep(config.step);
    redirect("/onboarding");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-10 sm:py-16">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
        <Link href="/onboarding">
          <ArrowLeft aria-hidden="true" className="size-4" /> Back to checklist
        </Link>
      </Button>

      <div className="space-y-2">
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="step-page-title"
        >
          {config.title}
        </h1>
        <p className="text-muted-foreground">{config.detail}</p>
      </div>

      <div className="mt-8 rounded-lg border border-dashed bg-surface p-6 text-sm text-muted-foreground">
        This flow is being built. For now you can mark it complete to move
        through your checklist — the full experience lands soon.
      </div>

      <form action={markComplete} className="mt-6">
        <Button type="submit" data-testid={`complete-${config.step}`}>
          <Check aria-hidden="true" className="size-4" /> Mark as complete
        </Button>
      </form>
    </main>
  );
}
