import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@supertrainer/ui/lib/utils";

// Client-facing tier card. Presentational and brand-themed via CSS custom
// properties (--brand-primary / --brand-on-primary set by getOrgTheme). Reused
// across the tier builder preview, the P2 teaser unlock, and P8 checkout, so it
// takes already-formatted display props and stays free of app/data deps.
export interface TierCardProps extends React.ComponentProps<"div"> {
  name: string;
  /** Pre-formatted price, e.g. "$149". */
  price: string;
  /** Cadence suffix, e.g. "/mo". */
  cadence?: string;
  /** Human-attention lines this tier sells beyond the AI floor. */
  highlightLines: string[];
  /** Constant "included in every tier" list. */
  aiFloor: readonly string[];
  /** Emphasize as the featured/recommended tier (brand accent). */
  featured?: boolean;
  /** Optional CTA (teaser/checkout); omitted in the builder preview. */
  cta?: React.ReactNode;
}

export function TierCard({
  name,
  price,
  cadence = "/mo",
  highlightLines,
  aiFloor,
  featured = false,
  cta,
  className,
  ...props
}: TierCardProps) {
  return (
    <div
      data-slot="tier-card"
      data-featured={featured || undefined}
      className={cn(
        "flex flex-col rounded-xl border bg-card p-5 text-card-foreground shadow-sm",
        featured && "ring-2",
        className,
      )}
      style={
        featured
          ? { borderColor: "var(--brand-primary, var(--color-primary))", ["--tw-ring-color" as string]: "var(--brand-primary, var(--color-primary))" }
          : undefined
      }
      {...props}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold tracking-tight">{name}</h3>
        {featured && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              background: "var(--brand-primary, var(--color-primary))",
              color: "var(--brand-on-primary, var(--color-primary-foreground))",
            }}
          >
            Most popular
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        <span className="metric text-2xl">{price}</span>
        <span className="text-sm text-muted-foreground">{cadence}</span>
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {highlightLines.map((line, i) => (
          <li key={`h-${i}`} className="flex items-start gap-2">
            <Check
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
              style={{ color: "var(--brand-primary, var(--color-primary))" }}
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t pt-3">
        <p className="metric-label mb-2">Included in every tier</p>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {aiFloor.map((line, i) => (
            <li key={`f-${i}`} className="flex items-start gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}
