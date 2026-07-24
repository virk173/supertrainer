import Link from "next/link";
import { ChevronRight, CreditCard, Layers, Palette } from "lucide-react";

import { cn, focusRing } from "@supertrainer/ui/lib/utils";

export const metadata = { title: "Settings — supertrainer" };

const SECTIONS = [
  {
    href: "/trainer/settings/payments",
    icon: CreditCard,
    title: "Payments",
    summary: "Connect Stripe, sync your tiers, and manage payouts.",
  },
  {
    href: "/onboarding/brand",
    icon: Palette,
    title: "Branding",
    summary: "Your logo, colors, and coaching handle.",
  },
  {
    href: "/onboarding/tiers",
    icon: Layers,
    title: "Tiers",
    summary: "Name, price, and shape your coaching packages.",
  },
] as const;

export default function TrainerSettingsPage() {
  return (
    <div className="space-y-6" data-testid="settings">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage how you get paid and how your brand shows up for clients.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={cn(
              "group flex items-start gap-3 rounded-md border bg-surface-raised p-4 transition-colors hover:bg-foreground/5",
              focusRing,
            )}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4"
            >
              <s.icon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{s.title}</span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{s.summary}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
