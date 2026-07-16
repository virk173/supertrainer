"use server";

import { revalidatePath } from "next/cache";

import { getSessionOrgId, setStepStatus } from "@/lib/onboarding/state";
import {
  getStepConfig,
  isOnboardingStep,
  type OnboardingStep,
} from "@/lib/onboarding/steps";

async function requireOrgId(): Promise<string> {
  const orgId = await getSessionOrgId();
  if (!orgId) throw new Error("No org in session");
  return orgId;
}

function parseStep(value: unknown): OnboardingStep {
  const step = String(value ?? "");
  if (!isOnboardingStep(step)) throw new Error(`Invalid step: ${step}`);
  return step;
}

// Refresh both the checklist and the trainer shell (whose resume banner keys
// off remaining steps).
function revalidateOnboarding(): void {
  revalidatePath("/onboarding");
  revalidatePath("/trainer", "layout");
}

// Marks a step done. This is the hook every sub-flow (brand, style, tiers,
// import, demo, invite) calls on successful completion — the checklist and the
// stub step pages both go through here.
export async function completeStep(step: OnboardingStep): Promise<void> {
  const orgId = await requireOrgId();
  await setStepStatus(orgId, step, "done");
  revalidateOnboarding();
}

export async function skipStep(formData: FormData): Promise<void> {
  const step = parseStep(formData.get("step"));
  if (!getStepConfig(step).skippable) {
    throw new Error(`Step ${step} cannot be skipped`);
  }
  const orgId = await requireOrgId();
  await setStepStatus(orgId, step, "skipped");
  revalidateOnboarding();
}

// Reopens a done/skipped step back to 'todo' so a trainer can revisit it.
export async function reopenStep(formData: FormData): Promise<void> {
  const step = parseStep(formData.get("step"));
  const orgId = await requireOrgId();
  await setStepStatus(orgId, step, "todo");
  revalidateOnboarding();
}

// Form-action wrapper for completing a step (used by the stub step pages until
// each real flow lands and calls completeStep itself).
export async function completeStepAction(formData: FormData): Promise<void> {
  await completeStep(parseStep(formData.get("step")));
}
