import { formatMicros } from "@supertrainer/ai/pricing";

import { FunnelBars, Stat } from "@/components/admin/primitives";
import { orgHealthRows, platformMetrics } from "@/lib/admin/metrics";

export const dynamic = "force-dynamic";

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default async function AdminOverviewPage() {
  const rows = await orgHealthRows();
  const { summary, activation, clientFunnel, unpricedOrgs } = await platformMetrics(rows);

  return (
    <div className="space-y-6" data-testid="admin-overview">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Platform</h1>
        <p className="text-sm text-muted-foreground">
          The business, as it actually is — 30-day window.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="MRR" value={money(summary.mrrCents)} hint={`${summary.payingOrgs} paying orgs`} />
        <Stat label="ARR" value={money(summary.arrCents)} />
        <Stat label="Orgs" value={String(summary.orgs)} hint={`${summary.clients} clients`} />
        <Stat label="AI spend" value={formatMicros(summary.aiSpendMicros)} />
        <Stat
          label="Margin"
          value={formatMicros(summary.marginMicros)}
          hint="revenue − AI − infra estimate"
          tone={summary.marginMicros < 0 ? "danger" : undefined}
        />
        <Stat
          label="Unprofitable"
          value={String(summary.unprofitableOrgs)}
          hint="orgs costing more than they pay"
          tone={summary.unprofitableOrgs > 0 ? "warning" : undefined}
        />
        <Stat
          label="Over budget"
          value={String(summary.overBudgetOrgs)}
          tone={summary.overBudgetOrgs > 0 ? "warning" : undefined}
        />
        <Stat
          label="Price not synced"
          value={String(unpricedOrgs)}
          hint="MRR understated by these"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FunnelBars title="Trainer activation" steps={activation} />
        <FunnelBars title="Client funnel" steps={clientFunnel} />
      </div>
    </div>
  );
}
