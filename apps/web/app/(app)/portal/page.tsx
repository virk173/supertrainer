import Link from "next/link";
import { MessageCircle, Sun } from "lucide-react";

import { EmptyState } from "@supertrainer/ui/components/empty-state";

import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Today — supertrainer" };

// Whether this client still owes us Stage B answers (Phase 2.5). The interview is
// spread over days and resumable, so the portal is where they come back to it.
// paused_health is deliberately NOT pending — that one is the coach's move.
async function interviewPending(): Promise<boolean> {
  const { orgId, userId } = await getSessionClaims();
  if (!orgId || !userId) return false;
  const service = createServiceClient();
  const { data: client } = await service
    .from("clients")
    .select("id")
    .eq("profile_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!client) return false;
  const { data: state } = await service
    .from("interview_state")
    .select("status")
    .eq("client_id", client.id)
    .maybeSingle();
  return !state || state.status === "in_progress";
}

export default async function PortalHomePage() {
  const pending = await interviewPending();

  return (
    <div className="space-y-4">
      <h1
        className="text-xl font-semibold tracking-tight"
        data-testid="portal-home"
      >
        Today
      </h1>

      {pending && (
        <Link
          href="/welcome/interview"
          data-testid="intake-cta"
          className="flex items-center gap-3 rounded-lg border bg-surface-raised p-4 transition-colors hover:bg-surface"
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: "var(--brand-primary, var(--color-primary))",
              color: "var(--brand-on-primary, var(--color-primary-foreground))",
            }}
          >
            <MessageCircle className="size-4" />
          </span>
          <span>
            <span className="block text-sm font-medium">Finish your intake</span>
            <span className="block text-sm text-muted-foreground">
              A few questions so your coach can build your plan.
            </span>
          </span>
        </Link>
      )}

      <EmptyState
        icon={<Sun />}
        title="Nothing to log yet"
        description="Your trainer is setting things up. Your plan and daily check-ins will appear here."
      />
    </div>
  );
}
