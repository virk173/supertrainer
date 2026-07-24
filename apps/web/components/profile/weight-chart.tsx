"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@supertrainer/ui/components/empty-state";

import type { ClientProfile, WeightPoint } from "@/lib/trainer/profile";

type Row = { date: string; kg: number; trend: number | null };

function buildRows(
  weight: WeightPoint[],
  trend: ClientProfile["weightTrend"],
): Row[] {
  const n = weight.length;
  return weight.map((p, i) => ({
    date: p.date,
    kg: p.kg,
    trend:
      trend && n > 1
        ? Math.round((trend.start.kg + (trend.end.kg - trend.start.kg) * (i / (n - 1))) * 10) / 10
        : null,
  }));
}

function TooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const kg = payload.find((p) => p.dataKey === "kg")?.value;
  return (
    <div className="rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-sm">
      <p className="text-muted-foreground">{label}</p>
      <p className="metric">{kg} kg</p>
    </div>
  );
}

export function WeightChart({
  weight,
  trend,
}: {
  weight: WeightPoint[];
  trend: ClientProfile["weightTrend"];
}) {
  const rows = React.useMemo(() => buildRows(weight, trend), [weight, trend]);

  return (
    <section
      aria-label="Weight trend"
      className="rounded-md border bg-surface-raised p-4"
      data-testid="weight-chart"
    >
      <h2 className="mb-3 text-sm font-semibold tracking-tight">Weight</h2>
      {rows.length < 2 ? (
        <EmptyState
          title="Not enough weigh-ins yet"
          description="Two or more logged weigh-ins draw the trend."
          className="min-h-40"
        />
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                minTickGap={40}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                width={44}
                tickLine={false}
                axisLine={false}
                domain={["dataMin - 1", "dataMax + 1"]}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <Tooltip content={<TooltipContent />} cursor={{ stroke: "var(--border)" }} />
              <Line
                type="monotone"
                dataKey="trend"
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="kg"
                stroke="var(--foreground)"
                strokeWidth={2}
                dot={{ r: 2, fill: "var(--foreground)" }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
