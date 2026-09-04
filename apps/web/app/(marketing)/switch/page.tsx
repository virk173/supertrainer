import Link from "next/link";
import type { Metadata } from "next";

import { cn, focusRing } from "@supertrainer/ui/lib/utils";

export const metadata: Metadata = {
  title: "Switching over — supertrainer",
  description:
    "How to move a coaching book from another platform: importing your client list, what carries across, what doesn't, and running both in parallel for a month.",
};

const STEPS = [
  {
    title: "Export from where you are",
    body:
      "Every serious platform can produce a client CSV. Get yours out before you cancel anything — a book you can't export is a book you can't move, and that's worth knowing about your current tool either way.",
  },
  {
    title: "Upload it and check the mapping",
    body:
      "We read the columns and propose what each one is — name, email, goal, allergies, start date. You correct anything we got wrong before a single row is written. Nothing imports silently.",
  },
  {
    title: "Teach it your method",
    body:
      "Upload a handful of plans and check-ins you already wrote. This is the step that makes the drafts sound like you, and it's the one we won't let you skip.",
  },
  {
    title: "Run both for a month",
    body:
      "Keep your current tool live while your clients move over. Billing here doesn't start until you're actually using it, and your old platform stays your safety net until you decide it isn't needed.",
  },
] as const;

export default function SwitchPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
      <p className="metric-label">Switching</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">
        Moving a full book without dropping anyone
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        The reason coaches stay somewhere they&rsquo;ve outgrown is the migration, not the
        software. Here is exactly what it involves, including the parts that are annoying.
      </p>

      <ol className="mt-12 space-y-6">
        {STEPS.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[2rem_1fr] gap-4">
            <span className="metric pt-0.5 text-sm text-muted-foreground">{i + 1}</span>
            <div>
              <h2 className="font-display text-lg font-semibold tracking-tight">{s.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-14">
        <h2 className="font-display text-xl font-semibold tracking-tight">What doesn&rsquo;t come across</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Message history usually can&rsquo;t be exported from other platforms in any usable form,
          so it stays where it is — take a copy before you close the account. Workout logs
          transfer as data but not as your old platform&rsquo;s charts. Your clients will need to
          install the new portal, which is a link and a passcode, not an app-store download.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold tracking-tight">If you&rsquo;d rather not do it yourself</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          For a book over about forty clients, we&rsquo;ll do the import and the style ingestion with
          you on a call, on your real data, before you commit to anything. Ask when you sign up.
        </p>
        <Link
          href="/signup"
          className={cn(
            "mt-5 inline-flex rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
            focusRing,
          )}
        >
          Start free
        </Link>
      </section>
    </main>
  );
}
