import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import {
  COMPETITORS,
  competitorBySlug,
  formatCheckedOn,
} from "@/lib/marketing/competitors";
import { INCLUDED, PLANS, money } from "@/lib/marketing/pricing";

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ competitor: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ competitor: string }>;
}): Promise<Metadata> {
  const { competitor } = await params;
  const c = competitorBySlug(competitor);
  if (!c) return { title: "Compare — supertrainer" };
  return {
    title: `${c.name} alternative — supertrainer`,
    description: `A dated, sourced comparison of ${c.name} and supertrainer: what each charges, what stacks on top, and where each one is the better choice.`,
  };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ competitor: string }>;
}) {
  const { competitor } = await params;
  const c = competitorBySlug(competitor);
  if (!c) notFound();

  const ours = PLANS.find((p) => p.band === "50")!;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
      <p className="metric-label">Comparison</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">
        supertrainer vs {c.name}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">{c.positioning}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Their figures come from{" "}
        <a href={c.source} rel="nofollow noopener" className={cn("underline underline-offset-4", focusRing)}>
          {c.source.replace(/^https?:\/\//, "")}
        </a>
        , read on {formatCheckedOn(c.checkedOn)}. Prices change — check before you decide.
      </p>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          A coach with {c.example.clients} clients
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rounded-md border bg-surface-raised p-5">
            <p className="metric-label">{c.name}</p>
            <p className="mt-3 text-sm">{c.example.base}</p>
            <p className="metric-label mt-4">plus, to do the same job</p>
            <ul className="mt-2 space-y-1.5">
              {c.example.addOns.map((a) => (
                <li key={a} className="border-b py-1.5 text-sm">
                  {a}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">{c.example.note}</p>
          </article>
          <article className="rounded-md border border-foreground/30 bg-surface-raised p-5">
            <p className="metric-label">supertrainer</p>
            <p className="mt-3">
              <span className="metric text-3xl">{money(ours.annualMonthlyCents)}</span>
              <span className="text-sm text-muted-foreground">/mo, billed annually</span>
            </p>
            <p className="metric-label mt-4">plus</p>
            <p className="mt-2 border-b py-1.5 text-sm">Nothing. That&rsquo;s the whole bill.</p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {INCLUDED.slice(0, 5).map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Where {c.name} is the better choice
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          If you run a facility with several locations and staff rotas, or you need an exercise
          library and mobile app that thousands of coaches have already stress-tested, they have
          years of ground on us and it shows. We are built for one coach with a full book who
          wants their own method scaled — not for a gym floor.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          We say this here rather than hiding it, because you will find out in week two anyway,
          and a comparison page that only flatters its author is worth nothing.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold tracking-tight">Where we&rsquo;re different</h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed">
          <li className="border-b pb-3">
            <span className="font-medium">The AI is trained on your own work</span> — your past
            plans and check-ins — rather than a generic assistant bolted to a chat box.
          </li>
          <li className="border-b pb-3">
            <span className="font-medium">Nutrition, payments, automation and the branded portal
            are in the price</span>, because charging separately for the four things every working
            coach needs is a pricing strategy, not a product one.
          </li>
          <li className="border-b pb-3">
            <span className="font-medium">Your data leaves in plain CSV whenever you ask</span>, and
            deletion deletes.{" "}
            <Link href="/docs/data" className={cn("underline underline-offset-4", focusRing)}>
              The format is published.
            </Link>
          </li>
        </ul>
      </section>

      <section className="mt-12 rounded-md border bg-surface p-6">
        <h2 className="font-display text-lg font-semibold tracking-tight">Moving across</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Bring your client list as a CSV and we&rsquo;ll map the columns for you, keep everyone&rsquo;s
          history, and run your first month alongside whatever you&rsquo;re on now.
        </p>
        <Link
          href="/switch"
          className={cn(
            "mt-4 inline-flex rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
            focusRing,
          )}
        >
          How switching works
        </Link>
      </section>
    </main>
  );
}
