import Link from "next/link";
import { TrendingDown } from "lucide-react";

import { Avatar } from "@supertrainer/ui/components/avatar";
import { Button } from "@supertrainer/ui/components/button";
import { cn } from "@supertrainer/ui/lib/utils";

import type { ChurnClient } from "@/lib/trainer/analytics";

function riskTone(risk: number): string {
  if (risk >= 60) return "text-danger";
  if (risk >= 40) return "text-warning-text";
  return "text-muted-foreground";
}

// The churn radar (MASTER-PLAN feature 10): a coded, ranked at-risk list, each
// row showing the primary driver in plain language + a one-click way to act.
export function ChurnRadar({ clients }: { clients: ChurnClient[] }) {
  return (
    <section
      aria-labelledby="churn-heading"
      className="rounded-md border bg-surface-raised"
      data-testid="churn-radar"
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <TrendingDown aria-hidden="true" className="size-4 text-muted-foreground" />
        <h2 id="churn-heading" className="text-sm font-semibold tracking-tight">
          Churn radar
        </h2>
      </div>

      {clients.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          No clients at risk right now. Nice work.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {clients.map((client) => (
            <li key={client.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className={cn("metric w-8 shrink-0 text-sm", riskTone(client.risk))}
                aria-label={`Risk ${client.risk}`}
              >
                {client.risk}
              </span>
              <Avatar name={client.name} className="size-7" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{client.name}</p>
                <p className="truncate text-xs text-muted-foreground">{client.driver}</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={`/trainer/clients/${client.id}/inbox`}>Open inbox</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
