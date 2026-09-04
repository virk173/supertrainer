import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BookOpenCheck, LineChart, MessageSquareQuote } from "lucide-react";

import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import { CapacityCalculator } from "@/components/marketing/capacity";
import { INCLUDED, PLANS, money } from "@/lib/marketing/pricing";

export const metadata: Metadata = {
  title: "supertrainer — an AI that coaches like you",
  description:
    "Coaching software for personal trainers: an AI that learns your method and drafts in your voice, so you can hold more clients without answering fewer of them properly.",
};

const PILLARS = [
  {
    icon: BookOpenCheck,
    title: "It learns your method",
    body:
      "Upload the plans and check-ins you already wrote. The system reads them for how YOU periodise, how you swap a meal, how you talk to someone who missed three days — and every draft after that starts from your method, not a generic one.",
    proof: "Style ingestion runs once, on your real work. No prompt writing.",
  },
  {
    icon: MessageSquareQuote,
    title: "It drafts; you approve",
    body:
      "Client messages arrive already answered — in your voice, with the client's actual numbers pulled in and computed in code, never guessed by a model. You approve, edit, or rewrite. What you rewrite is what it learns.",
    proof: "Nothing reaches a client without you. Health-flagged messages escalate to you immediately.",
  },
  {
    icon: LineChart,
    title: "It shows you who is drifting",
    body:
      "A day-by-day adherence ledger per client — logged meals, sessions, weigh-ins — so you can see the person who is quietly falling off two weeks before they cancel, instead of at the cancellation.",
    proof: "One grid, one glance, the whole roster.",
  },
] as const;

export default function LandingPage() {
  const entry = PLANS[0];

  return (
    <main>
      {/* ── the thesis, stated then handed over ─────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-6 pt-16 sm:pt-24">
        <p className="metric-label">For coaches with a full book</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          An AI that coaches like you — not instead of you.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Your book is capped by how many people you can personally answer. This reads
          your own plans and check-ins, drafts every reply in your voice, and waits for
          you to approve it.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/signup"
            className={cn(
              "inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
              focusRing,
            )}
          >
            Start free <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href="/switch"
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-foreground/5",
              focusRing,
            )}
          >
            Switching from something else
          </Link>
        </div>

        <div className="mt-12">
          <CapacityCalculator />
        </div>
      </section>

      {/* ── the three pillars, each with the thing that makes it true ───────── */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Three things, done properly
        </h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <article key={p.title} className="rounded-md border bg-surface-raised p-6">
              <p
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4"
              >
                <p.icon />
              </p>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              <p className="mt-4 border-t pt-4 text-sm">{p.proof}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── the demo slot: honest about being empty ─────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-20">
        <div
          className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-10 text-center"
          data-testid="demo-slot"
        >
          <p className="font-display text-lg font-semibold tracking-tight">
            A walkthrough on a real book
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            We film this on an actual coach&rsquo;s roster rather than a mock one, so it
            isn&rsquo;t here yet. Ask for a live demo and we&rsquo;ll run it on yours.
          </p>
        </div>
      </section>

      {/* ── pricing, stated plainly ─────────────────────────────────────────── */}
      <section className="border-t bg-surface">
        <div className="mx-auto w-full max-w-5xl px-6 py-20">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            One price. Everything in it.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Priced by how many clients you coach, and nothing else. No nutrition add-on, no
            payments add-on, no automation add-on — the things you were going to buy anyway
            are the product.
          </p>
          <p className="mt-8 text-sm">
            From <span className="metric text-lg">{money(entry.annualMonthlyCents)}</span>
            <span className="text-muted-foreground">/month, billed annually.</span>
          </p>
          <ul className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {INCLUDED.map((line) => (
              <li key={line} className="border-b py-2 text-sm">
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/pricing"
              className={cn(
                "inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                focusRing,
              )}
            >
              See every plan
            </Link>
            <Link
              href="/compare/trainerize"
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-foreground/5",
                focusRing,
              )}
            >
              Compare with what you pay now
            </Link>
          </div>
        </div>
      </section>

      {/* ── the trust promise, linked to the mechanism ──────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Your clients&rsquo; history is yours
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Every weigh-in, meal, session, message and payment exports as plain CSV, on demand,
          in a format that outlives us — and deletion means deleted rows and files, not a
          hidden flag. It&rsquo;s written down, publicly, including the parts that are
          inconvenient for us.
        </p>
        <Link
          href="/docs/data"
          className={cn(
            "mt-5 inline-flex items-center gap-2 rounded-md text-sm font-medium underline underline-offset-4",
            focusRing,
          )}
        >
          Read exactly what an export contains <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
