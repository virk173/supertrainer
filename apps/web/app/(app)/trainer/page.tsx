import { notFound } from "next/navigation";
import { Activity, CircleDollarSign, ListChecks, Users } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";
import { EmptyState } from "@supertrainer/ui/components/empty-state";

import { KpiCard, type KpiDelta } from "@/components/home/kpi-card";
import { NeedsYouToday } from "@/components/home/needs-you-today";
import { OnTrackGrid } from "@/components/home/on-track-grid";
import { Sparkline } from "@/components/home/sparkline";
import { getSessionClaims } from "@/lib/onboarding/state";
import { getHomeData } from "@/lib/trainer/home";
import { getRevenue } from "@/lib/trainer/revenue";

export const metadata = { title: "Home — supertrainer" };

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function adherenceDelta(
  thisWeek: number | null,
  lastWeek: number | null,
): KpiDelta | undefined {
  if (thisWeek === null || lastWeek === null) return undefined;
  const diff = thisWeek - lastWeek;
  return {
    text: `${diff >= 0 ? "+" : ""}${diff} pts vs last week`,
    direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat",
  };
}

export default async function TrainerHomePage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const now = new Date();
  const [data, revenue] = await Promise.all([getHomeData(orgId, now), getRevenue(orgId)]);
  const { kpis, digest, onTrack } = data;
  const mrr = (() => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: revenue.currency.toUpperCase(),
        maximumFractionDigits: 0,
      }).format(revenue.mrrCents / 100);
    } catch {
      return `${Math.round(revenue.mrrCents / 100)} ${revenue.currency.toUpperCase()}`;
    }
  })();

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-xl font-semibold tracking-tight"
          data-testid="trainer-home"
        >
          {greeting(now.getHours())}
        </h1>
        <p className="text-sm text-muted-foreground">
          {kpis.activeClients > 0
            ? "Here's your roster at a glance. Clear the queue and get on with your day."
            : "Your workspace is ready. Invite your first client to get started."}
        </p>
      </header>

      {kpis.activeClients === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No clients yet"
          description="Invite your first client to see their adherence, drafts, and messages land here every morning."
          action={
            <Button asChild>
              <a href="/trainer/prospects">Invite a client</a>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Active clients"
              value={kpis.activeClients}
              icon={<Users />}
              href="/trainer/clients"
              delta={
                kpis.newClientsThisWeek > 0
                  ? {
                      text: `+${kpis.newClientsThisWeek} this week`,
                      direction: "up",
                    }
                  : undefined
              }
            />
            <KpiCard
              label="Pending items"
              value={digest.pending.total}
              icon={<ListChecks />}
              href="/trainer/queue"
              sub={`${digest.pending.replies} replies · ${digest.pending.plans} plans · ${digest.pending.splits} splits`}
            />
            <KpiCard
              label="Avg adherence 7d"
              value={kpis.avgAdherenceThisWeek ?? "—"}
              icon={<Activity />}
              delta={adherenceDelta(
                kpis.avgAdherenceThisWeek,
                kpis.avgAdherenceLastWeek,
              )}
              sparkline={<Sparkline data={kpis.adherenceSparkline} />}
            />
            <KpiCard
              label="MRR"
              value={mrr}
              icon={<CircleDollarSign />}
              sub={`${revenue.activeSubscribers} paying`}
            />
          </div>

          <NeedsYouToday
            initialLive={{
              pending: digest.pending,
              escalations: digest.escalations,
              estimatedMinutes: digest.estimatedMinutes,
            }}
            renewals={digest.renewals}
            atRisk={digest.atRisk}
          />

          <OnTrackGrid clients={onTrack} />
        </>
      )}
    </div>
  );
}
