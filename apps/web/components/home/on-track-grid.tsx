import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import type { OnTrackClient } from "@/lib/trainer/home";

const BAND_LABEL: Record<OnTrackClient["band"], string> = {
  reset: "Let's reset",
  building: "Building momentum",
  locked_in: "Locked in",
};

// "Everyone else" — the reassurance grid, collapsed by default. Each client is a
// success-dot pill linking to their profile; the score/streak live in the pill's
// accessible name and a hover/focus mini-scorecard. Native <details> keeps the
// collapse keyboard-accessible with no JS.
export function OnTrackGrid({ clients }: { clients: OnTrackClient[] }) {
  if (clients.length === 0) return null;

  return (
    <details className="group rounded-md border bg-surface-raised">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-3 rounded-md p-4 text-sm font-medium",
          focusRing,
        )}
      >
        <span>
          On track{" "}
          <span className="metric text-muted-foreground">({clients.length})</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="border-t p-4">
        <ul className="flex flex-wrap gap-2">
          {clients.map((client) => (
            <li key={client.id} className="group/pill relative">
              <Link
                href={`/trainer/clients/${client.id}`}
                aria-label={`${client.name}, adherence ${client.score}, ${client.streak} day streak, ${BAND_LABEL[client.band]}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-foreground/5",
                  focusRing,
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full bg-success"
                />
                <span className="max-w-32 truncate">{client.name}</span>
              </Link>
              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm group-hover/pill:block group-focus-within/pill:block"
              >
                <span className="metric">{client.score}</span> · {client.streak}d streak ·{" "}
                {BAND_LABEL[client.band]}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
