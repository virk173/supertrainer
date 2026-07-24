"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { HistogramBucket } from "@/lib/trainer/analytics";

function TooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-sm">
      <p className="text-muted-foreground">{label}</p>
      <p className="metric">
        {payload[0]!.value} client{payload[0]!.value === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// Single-series distribution — token ink bars, recessive axes/grid. No legend
// (the title names the series).
export function AdherenceHistogram({ data }: { data: HistogramBucket[] }) {
  return (
    <section
      aria-label="Adherence distribution"
      className="rounded-md border bg-surface-raised p-4"
      data-testid="adherence-histogram"
    >
      <h2 className="mb-3 text-sm font-semibold tracking-tight">Adherence distribution</h2>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              allowDecimals={false}
              width={32}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <Tooltip content={<TooltipContent />} cursor={{ fill: "var(--foreground)", fillOpacity: 0.05 }} />
            <Bar dataKey="count" fill="var(--foreground)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
