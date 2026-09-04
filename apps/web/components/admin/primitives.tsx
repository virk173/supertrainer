import * as React from "react";

import { formatMicros } from "@supertrainer/ai/pricing";
import { cn } from "@supertrainer/ui/lib/utils";

// Phase 9.3 — the console's shared marks.
//
// Every visual here is single-series magnitude, so the marks are achromatic and
// every value is printed as text beside its bar: nothing is encoded by color
// alone. Color appears only where it states a fact — over budget, negative
// margin — and always beside a word that says the same thing.

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="rounded-md border bg-surface-raised p-4">
      <p className="metric-label">{label}</p>
      <p
        className={cn(
          "metric mt-1 text-xl",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning-text",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A funnel step: label, count, share of the top step. The bar is a recessive
 *  mark; the numbers next to it are the actual reading. */
export function FunnelBars({
  title,
  steps,
}: {
  title: string;
  steps: { key: string; label: string; count: number; ofTop: number }[];
}) {
  return (
    <section className="rounded-md border bg-surface-raised p-5">
      <p className="metric-label mb-4">{title}</p>
      <ul className="space-y-3">
        {steps.map((s) => (
          <li key={s.key} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3">
            <span className="truncate text-sm">{s.label}</span>
            <span className="h-2 overflow-hidden rounded-md bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-md bg-foreground/70"
                style={{ width: `${Math.round(s.ofTop * 100)}%` }}
              />
            </span>
            <span className="metric text-sm tabular-nums">
              {s.count}
              <span className="ml-2 text-xs font-medium text-muted-foreground">
                {Math.round(s.ofTop * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Spend against a cap. The fill is neutral until the state is real: amber past
 *  80%, red past the cap — and the word next to it says which. */
export function BudgetMeter({
  spendMicros,
  capMicros,
  state,
}: {
  spendMicros: number;
  capMicros: number;
  state: "ok" | "near" | "over";
}) {
  const pct = capMicros > 0 ? Math.min(100, Math.round((spendMicros / capMicros) * 100)) : 0;
  const label = state === "over" ? "Over" : state === "near" ? "Near" : "OK";
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-24 shrink-0 overflow-hidden rounded-md bg-muted" aria-hidden="true">
        <span
          className={cn(
            "block h-full rounded-md",
            state === "over" ? "bg-danger" : state === "near" ? "bg-warning" : "bg-foreground/70",
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="metric text-xs tabular-nums">{formatMicros(spendMicros)}</span>
      <span
        className={cn(
          "text-xs font-medium",
          state === "over" ? "text-danger" : state === "near" ? "text-warning-text" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </span>
  );
}

export function Percent({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className="metric text-sm tabular-nums">{Math.round(value * 100)}%</span>;
}
