"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import type { TierRevenue } from "@/lib/trainer/revenue";

// Revenue-by-tier is a part-to-whole. Per DESIGN.md the chrome is achromatic —
// color is reserved for client STATE, never decoration — so tiers are graduated
// steps of the ink `--foreground` (largest = darkest), and identity is carried by
// the direct-labeled legend, never by color alone. No animation (axe/CI stable).

// Descending ink opacity by revenue rank; a 6th+ tier folds to the faintest.
const OPACITY = [0.92, 0.68, 0.5, 0.36, 0.26, 0.18];

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${Math.round(cents / 100)} ${currency.toUpperCase()}`;
  }
}

export function RevenueDonut({
  byTier,
  mrrCents,
  currency,
}: {
  byTier: TierRevenue[];
  mrrCents: number;
  currency: string;
}) {
  const total = byTier.reduce((a, t) => a + t.cents, 0) || 1;

  return (
    <section
      aria-label="Revenue by tier"
      className="rounded-md border bg-surface-raised p-4"
      data-testid="revenue-donut"
    >
      <h2 className="mb-3 text-sm font-semibold tracking-tight">Revenue by tier</h2>

      {byTier.length === 0 ? (
        <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          No active subscriptions yet.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byTier}
                  dataKey="cents"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={72}
                  paddingAngle={2}
                  stroke="var(--surface-raised)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {byTier.map((t, i) => (
                    <Cell
                      key={t.tierId ?? t.name}
                      fill="var(--foreground)"
                      fillOpacity={OPACITY[Math.min(i, OPACITY.length - 1)]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="metric-label">MRR</p>
              <p className="metric text-lg leading-none">{money(mrrCents, currency)}</p>
            </div>
          </div>

          <ul className="w-full min-w-0 flex-1 space-y-1.5">
            {byTier.map((t, i) => (
              <li key={t.tierId ?? t.name} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full bg-foreground"
                  style={{ opacity: OPACITY[Math.min(i, OPACITY.length - 1)] }}
                />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="metric tabular-nums">{money(t.cents, currency)}</span>
                <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                  {Math.round((t.cents / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
