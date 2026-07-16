"use server";

import { revalidatePath } from "next/cache";

import { seedDemoClient } from "@supertrainer/db/seed";

import { completeStep } from "@/app/onboarding/actions";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

export interface DemoResult {
  ok: boolean;
  message?: string;
}

async function requireStaffOrg(): Promise<
  { orgId: string } | { error: string }
> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) return { error: "Your session expired — sign in again." };
  if (role !== "owner" && role !== "staff") {
    return { error: "Only trainers can manage the demo client." };
  }
  return { orgId };
}

// Seeds (or refreshes) the org's demo client and completes the checklist step.
// The seeder is idempotent, so this is safe to call repeatedly.
export async function seedDemo(): Promise<DemoResult> {
  const auth = await requireStaffOrg();
  if ("error" in auth) return { ok: false, message: auth.error };

  try {
    await seedDemoClient(createServiceClient(), auth.orgId);
  } catch (err) {
    console.error("[demo] seed failed:", err);
    return { ok: false, message: "Couldn't create the demo client." };
  }

  await completeStep("demo");
  revalidatePath("/onboarding/demo");
  revalidatePath("/onboarding");
  return { ok: true };
}

// "Reset demo client" — re-runs the full staged seeder.
export async function resetDemo(): Promise<DemoResult> {
  const auth = await requireStaffOrg();
  if ("error" in auth) return { ok: false, message: auth.error };
  try {
    await seedDemoClient(createServiceClient(), auth.orgId);
  } catch (err) {
    console.error("[demo] reset failed:", err);
    return { ok: false, message: "Couldn't reset the demo client." };
  }
  revalidatePath("/onboarding/demo");
  return { ok: true };
}
