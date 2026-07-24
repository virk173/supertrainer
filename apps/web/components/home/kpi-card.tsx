import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { cn, focusRing } from "@supertrainer/ui/lib/utils";

export type KpiDelta = {
  text: string;
  direction: "up" | "down" | "flat";
};

// One KPI stat tile: eyebrow label, a tabular metric, an optional neutral delta
// vs last week, and an optional sparkline slot. Deltas stay achromatic (an arrow
// + magnitude) — color is reserved for client status, not aggregate movement.
export function KpiCard({
  label,
  value,
  sub,
  delta,
  icon,
  sparkline,
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  delta?: KpiDelta;
  icon?: React.ReactNode;
  sparkline?: React.ReactNode;
  href?: string;
}) {
  const DeltaIcon =
    delta?.direction === "up"
      ? ArrowUp
      : delta?.direction === "down"
        ? ArrowDown
        : Minus;

  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="metric-label">{label}</p>
        {icon ? (
          <span aria-hidden="true" className="text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="metric text-2xl leading-none">{value}</p>
          {delta ? (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <DeltaIcon aria-hidden="true" className="size-3" />
              {delta.text}
            </p>
          ) : sub ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
          ) : null}
        </div>
        {sparkline ? <div className="w-28 shrink-0">{sparkline}</div> : null}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "block rounded-md border bg-surface-raised p-4 transition-colors hover:bg-foreground/5",
          focusRing,
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className="rounded-md border bg-surface-raised p-4">{body}</div>;
}
