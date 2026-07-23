import Link from "next/link";
import { Camera, Dumbbell, MessageCircle, UtensilsCrossed } from "lucide-react";

import { ledgerDaysInRange } from "@supertrainer/db/queries";

import { ClientScoreCard } from "@/components/client-score-card";
import { DailyLog, type DailyState } from "@/components/daily-log";
import { getCurrentClientContext, tzDate } from "@/lib/ledger/log";
import { computeClientLens, type ClientLens, type LedgerDayRow } from "@/lib/ledger/score";
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

// Today's already-logged weigh-in / check-in / steps+sleep, so the quick-log
// shows saved state instead of blank inputs (Phase 3.3).
async function todayState(): Promise<DailyState | null> {
  const ctx = await getCurrentClientContext();
  if (!ctx) return null;
  const service = createServiceClient();
  const day = tzDate(ctx.timezone);
  const [weigh, checkin, wearable] = await Promise.all([
    service.from("weigh_ins").select("weight_kg").eq("client_id", ctx.clientId).eq("tz_date", day).maybeSingle(),
    service.from("gym_checkins").select("status").eq("client_id", ctx.clientId).eq("tz_date", day).maybeSingle(),
    service.from("wearable_daily").select("steps, sleep_min").eq("client_id", ctx.clientId).eq("tz_date", day).maybeSingle(),
  ]);
  return {
    weightKg: weigh.data ? Number(weigh.data.weight_kg) : null,
    checkin: (checkin.data?.status as DailyState["checkin"]) ?? null,
    steps: wearable.data?.steps ?? null,
    sleepMin: wearable.data?.sleep_min ?? null,
  };
}

// The client-lens weekly score over the last ~2 weeks of closed ledger days.
async function clientLens(): Promise<ClientLens | null> {
  const ctx = await getCurrentClientContext();
  if (!ctx) return null;
  const to = tzDate(ctx.timezone);
  const fromDate = new Date(`${to}T00:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - 13);
  const rows = await ledgerDaysInRange(createServiceClient(), ctx.clientId, fromDate.toISOString().slice(0, 10), to);
  if (rows.length === 0) return null;
  return computeClientLens(rows as unknown as LedgerDayRow[]);
}

export default async function PortalHomePage() {
  const [pending, daily, lens] = await Promise.all([interviewPending(), todayState(), clientLens()]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight" data-testid="portal-home">
        Today
      </h1>

      {lens && <ClientScoreCard lens={lens} />}

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

      <Link
        href="/portal/log"
        data-testid="log-meal-cta"
        className="flex items-center gap-3 rounded-lg border bg-surface-raised p-4 transition-colors hover:bg-surface"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: "var(--brand-primary, var(--color-primary))",
            color: "var(--brand-on-primary, var(--color-primary-foreground))",
          }}
        >
          <UtensilsCrossed className="size-4" />
        </span>
        <span>
          <span className="block text-sm font-medium">Log a meal</span>
          <span className="block text-sm text-muted-foreground">
            Snap it, say it, or type it — takes about ten seconds.
          </span>
        </span>
      </Link>

      {daily && <DailyLog initial={daily} />}

      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/portal/workout"
          data-testid="workout-cta"
          className="flex items-center gap-2 rounded-lg border bg-surface-raised p-3 text-sm font-medium transition-colors hover:bg-surface"
        >
          <Dumbbell className="size-4" /> Log a workout
        </Link>
        <Link
          href="/portal/progress"
          data-testid="progress-cta"
          className="flex items-center gap-2 rounded-lg border bg-surface-raised p-3 text-sm font-medium transition-colors hover:bg-surface"
        >
          <Camera className="size-4" /> Progress photos
        </Link>
      </div>
    </div>
  );
}
