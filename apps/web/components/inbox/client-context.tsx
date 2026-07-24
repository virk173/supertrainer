import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, Clock } from "lucide-react";

import { Avatar } from "@supertrainer/ui/components/avatar";
import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { cn } from "@supertrainer/ui/lib/utils";

import { Sparkline } from "@/components/home/sparkline";
import type { InboxContext } from "@/lib/trainer/inbox";
import type { ScoreBand } from "@supertrainer/scoring";

const STATUS_VARIANT: Record<string, "success" | "warning" | "muted" | "outline"> = {
  active: "success",
  onboarding: "warning",
  paused: "muted",
  churned: "muted",
  lead: "outline",
};

const BAND: Record<ScoreBand, { label: string; variant: "success" | "warning" | "muted" }> = {
  locked_in: { label: "Locked in", variant: "success" },
  building: { label: "Building", variant: "warning" },
  reset: { label: "Let's reset", variant: "muted" },
};

function minsLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// The always-visible client-context rail: identity, adherence + 4-week trend,
// weight, today's day-type, the fasting window, and quick nav.
export function ClientContext({
  clientId,
  clientName,
  status,
  context,
}: {
  clientId: string;
  clientName: string;
  status: string;
  context: InboxContext;
}) {
  const band = context.band ? BAND[context.band] : null;

  return (
    <div className="space-y-4 rounded-md border bg-surface-raised p-4" data-testid="client-context">
      <div className="flex items-center gap-3">
        <Avatar name={clientName} className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{clientName}</p>
          <Badge variant={STATUS_VARIANT[status] ?? "muted"} className="mt-0.5 capitalize">
            {status}
          </Badge>
        </div>
      </div>

      {/* Adherence + 4-week trend */}
      <div className="rounded-md border bg-background p-3">
        <div className="flex items-center justify-between">
          <p className="metric-label">Adherence 28d</p>
          {band && <Badge variant={band.variant}>{band.label}</Badge>}
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <p className="metric text-2xl leading-none">{context.adherence ?? "—"}</p>
            {context.streak > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {context.streak} day streak
              </p>
            )}
          </div>
          <div className="w-24 shrink-0">
            <Sparkline data={context.sparkline} />
          </div>
        </div>
      </div>

      {/* Weight + day-type + fasting */}
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-md border bg-background p-3">
          <dt className="metric-label">Weight</dt>
          <dd className="mt-1 flex items-center gap-1.5">
            <span className="metric text-lg">
              {context.weightKg !== null ? `${context.weightKg}` : "—"}
            </span>
            {context.weightKg !== null && (
              <span className="text-xs text-muted-foreground">kg</span>
            )}
            {context.weightDeltaKg !== null && context.weightDeltaKg !== 0 && (
              <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground">
                {context.weightDeltaKg < 0 ? (
                  <ArrowDown aria-hidden="true" className="size-3" />
                ) : (
                  <ArrowUp aria-hidden="true" className="size-3" />
                )}
                {Math.abs(context.weightDeltaKg)}
              </span>
            )}
          </dd>
        </div>
        <div className="rounded-md border bg-background p-3">
          <dt className="metric-label">Today</dt>
          <dd className="mt-1 truncate text-sm font-medium">{context.todayLabel}</dd>
        </div>
      </dl>

      {context.fast && (
        <div
          className="flex items-center gap-2 rounded-md border bg-background p-3 text-sm"
          data-testid="fast-window"
        >
          <Clock aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="font-medium">
            {context.fast.state === "eating" ? "Eating window open" : "Fasting"}
          </span>
          <span className="ml-auto text-muted-foreground">
            {minsLabel(context.fast.minutesUntilChange)} until{" "}
            {context.fast.state === "eating" ? "close" : "open"}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/trainer/clients/${clientId}`}>
            Open profile
            <ArrowRight aria-hidden="true" className={cn("size-3.5")} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
