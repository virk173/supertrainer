import { notFound } from "next/navigation";
import { Activity, CircleDollarSign, Clock, PieChart, Sparkles, TrendingDown, Users } from "lucide-react";

import { AdherenceHistogram } from "@/components/analytics/adherence-histogram";
import { ChurnRadar } from "@/components/analytics/churn-radar";
import { KpiCard } from "@/components/home/kpi-card";
import { getSessionClaims } from "@/lib/onboarding/state";
import { getAnalytics } from "@/lib/trainer/analytics";

export const metadata = { title: "Analytics — supertrainer" };

function timeSaved(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Phase 7.6 — business analytics + the churn radar. Revenue surfaces are P8
// stubs wired to real queries later; roster-health + churn + AI-quality are live.
export default async function TrainerAnalyticsPage() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) notFound();

  const a = await getAnalytics(orgId, new Date());

  return (
    <div className="space-y-6" data-testid="analytics">
      <h1 className="text-xl font-semibold tracking-tight" data-testid="analytics-title">
        Analytics
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active clients" value={a.activeClients} icon={<Users />} />
        <KpiCard
          label="At risk"
          value={a.atRiskCount}
          icon={<TrendingDown />}
          sub="risk score ≥ 40"
        />
        <KpiCard label="Avg adherence" value={a.avgAdherence ?? "—"} icon={<Activity />} />
        <KpiCard label="MRR" value="—" icon={<CircleDollarSign />} sub="Arrives with payments" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChurnRadar clients={a.churn} />
        <AdherenceHistogram data={a.histogram} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Zero-edit rate"
          value={a.zeroEditRate !== null ? `${a.zeroEditRate}%` : "—"}
          icon={<Sparkles />}
          sub={`${a.draftsHandled} repl${a.draftsHandled === 1 ? "y" : "ies"} handled`}
        />
        <KpiCard
          label="Time saved"
          value={timeSaved(a.timeSavedMinutes)}
          icon={<Clock />}
          sub="from approved AI drafts"
        />
        <KpiCard
          label="Revenue by tier"
          value="—"
          icon={<PieChart />}
          sub="Arrives with payments"
        />
      </div>
    </div>
  );
}
