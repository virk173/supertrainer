import "server-only";

import { createClient } from "@/lib/supabase/server";
import { trackServer } from "@/lib/analytics/server";

import {
  emptyStateMap,
  isOnboardingStep,
  type OnboardingStateMap,
  type OnboardingStep,
  type OnboardingStepStatus,
} from "./steps";

export interface SessionClaims {
  userId: string | null;
  orgId: string | null;
  role: string | null;
}

// The signed-in user's org/role, read from the JWT custom claims (injected by
// custom_access_token_hook) — no extra query. Fields are null when
// unauthenticated or a claim is missing (e.g. a session minted before bootstrap
// ran).
export async function getSessionClaims(): Promise<SessionClaims> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    userId: str(claims?.sub),
    orgId: str(claims?.org_id),
    role: str(claims?.user_role),
  };
}

// The signed-in trainer's org, read from the JWT custom claim. null when
// unauthenticated or the claim is missing.
export async function getSessionOrgId(): Promise<string | null> {
  return (await getSessionClaims()).orgId;
}

// The full checklist state for an org: every step, defaulting to 'todo' when no
// row exists yet. RLS scopes the read to the caller's org.
export async function getOnboardingState(
  orgId: string,
): Promise<OnboardingStateMap> {
  const supabase = await createClient();
  const state = emptyStateMap();

  const { data, error } = await supabase
    .from("org_onboarding_state")
    .select("step, status")
    .eq("org_id", orgId);

  if (error) {
    console.error("[onboarding] state read failed:", error.message);
    return state;
  }

  for (const row of data ?? []) {
    if (isOnboardingStep(row.step)) {
      state[row.step] = row.status;
    }
  }
  return state;
}

// Upsert one step's status for the caller's org. RLS enforces org membership;
// 'done' stamps completed_at, other statuses clear it. Completing a step also
// writes the funnel event (events table + PostHog) via trackServer.
export async function setStepStatus(
  orgId: string,
  step: OnboardingStep,
  status: OnboardingStepStatus,
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("org_onboarding_state").upsert(
    {
      org_id: orgId,
      step,
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
    },
    { onConflict: "org_id,step" },
  );

  if (error) {
    throw new Error(`Failed to set onboarding step ${step}: ${error.message}`);
  }

  if (status === "done") {
    await trackServer({
      orgId,
      event: "onboarding_step_completed",
      properties: { step },
    });
  }
}
