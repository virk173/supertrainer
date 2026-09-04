import Link from "next/link";
import type { Metadata } from "next";
import { Check } from "lucide-react";

import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import { COMPETITORS, formatCheckedOn } from "@/lib/marketing/competitors";
import { INCLUDED, PLANS, money } from "@/lib/marketing/pricing";

export const metadata: Metadata = {
  title: "Pricing — supertrainer",
  description:
    "One all-inclusive price, tiered only by how many clients you coach. Nutrition, payments, automation and the branded portal are included, not add-ons.",
};

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">
        Priced by your book, not by your appetite for add-ons
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Every plan has everything in it. The only thing that changes between them is how many
        clients you coach.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <section
            key={plan.band}
            data-testid="plan-card"
            className={cn(
              "flex flex-col rounded-md border bg-surface-raised p-5",
              plan.best && "border-foreground/30",
            )}
          >
            <p className="metric-label">{plan.name}</p>
            <p className="mt-3">
              <span className="metric text-3xl">{money(plan.annualMonthlyCents)}</span>
              <span className="text-sm text-muted-foreground">/mo</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              billed annually · {money(plan.monthlyCents)}/mo month-to-month
            </p>
            <p className="mt-4 border-t pt-4 text-sm">{plan.clients}</p>
            <Link
              href="/signup"
              className={cn(
                "mt-5 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors",
                plan.best
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border hover:bg-foreground/5",
                focusRing,
              )}
            >
              Start free
            </Link>
          </section>
        ))}
      </div>

      <section className="mt-16">
        <h2 className="font-display text-xl font-semibold tracking-tight">In every plan</h2>
        <ul className="mt-4 grid gap-x-8 sm:grid-cols-2">
          {INCLUDED.map((line) => (
            <li key={line} className="flex items-start gap-2 border-b py-2.5 text-sm">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          What the same coaching costs elsewhere
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Figures below come from each vendor&rsquo;s own pricing page on the date shown. They
          change; check the source before making a decision on ours.
        </p>
        <div className="mt-6 space-y-4">
          {COMPETITORS.map((c) => (
            <article key={c.slug} className="rounded-md border bg-surface-raised p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-display text-lg font-semibold tracking-tight">{c.name}</h3>
                <p className="text-xs text-muted-foreground">
                  from{" "}
                  <a
                    href={c.source}
                    rel="nofollow noopener"
                    className={cn("underline underline-offset-4", focusRing)}
                  >
                    their pricing page
                  </a>
                  , checked {formatCheckedOn(c.checkedOn)}
                </p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{c.positioning}</p>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="metric-label mb-2">Plans</p>
                  <ul className="space-y-1.5 text-sm">
                    {c.plans.map((p) => (
                      <li key={p.label} className="flex justify-between gap-3 border-b py-1.5">
                        <span>{p.label}</span>
                        <span className="metric shrink-0">{p.monthly}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="metric-label mb-2">Paid on top</p>
                  <ul className="space-y-1.5 text-sm">
                    {c.addOns.map((a) => (
                      <li key={a.name} className="flex justify-between gap-3 border-b py-1.5">
                        <span>{a.name}</span>
                        <span className="metric shrink-0">{a.monthly}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <Link
                href={`/compare/${c.slug}`}
                className={cn(
                  "mt-4 inline-block rounded-md text-sm font-medium underline underline-offset-4",
                  focusRing,
                )}
              >
                The full comparison
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-md border bg-surface p-6">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          The awkward questions, answered
        </h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="font-medium">What happens if I leave?</dt>
            <dd className="mt-1 text-muted-foreground">
              You export everything as plain CSV and take it with you. That&rsquo;s documented
              publicly, on{" "}
              <Link href="/docs/data" className={cn("underline underline-offset-4", focusRing)}>
                this page
              </Link>
              , including the format.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Does the AI message my clients on its own?</dt>
            <dd className="mt-1 text-muted-foreground">
              No. It drafts; you approve. The only messages that go out untouched are system
              ones you configure — reminders and billing notices — and they never speak as you.
            </dd>
          </div>
          <div>
            <dt className="font-medium">What counts as a client?</dt>
            <dd className="mt-1 text-muted-foreground">
              An active client on your roster. Archived clients and the demo client we set you
              up with don&rsquo;t count, and you&rsquo;re never charged for a paused one.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
