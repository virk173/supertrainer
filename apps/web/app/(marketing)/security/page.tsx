import Link from "next/link";
import type { Metadata } from "next";

import { cn, focusRing } from "@supertrainer/ui/lib/utils";

export const metadata: Metadata = {
  title: "Security & AI policy — supertrainer",
  description:
    "How client data is isolated and stored, what the AI is and isn't allowed to do, and the safety rules that are enforced in code rather than promised in copy.",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t py-10">
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function SecurityPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
      <p className="metric-label">Trust</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">
        What we do with your clients&rsquo; data, and what the AI may do
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        The rules below are enforced in code and tested, not stated as intentions. Where
        something is a limitation rather than a guarantee, it says so.
      </p>

      <Section title="Where the data lives">
        <p>
          Client records are stored in Postgres on Supabase, encrypted at rest and in transit.
          Every row carries the org it belongs to, and access is enforced by row-level security
          policies in the database itself — not by application code that could forget. Each of
          those policies has a test that tries the cross-tenant read and asserts it comes back
          empty.
        </p>
        <p>
          Files — progress photos, meal photos, uploaded plans — live in private storage buckets
          namespaced by org, reachable only through short-lived signed links.
        </p>
      </Section>

      <Section title="What the AI is not allowed to do">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-foreground">It never sends a message as you.</span>{" "}
            Every conversational reply is a draft that waits for your approval.
          </li>
          <li>
            <span className="font-medium text-foreground">It never does arithmetic.</span> Calories,
            macros, weights, money — all computed in code from verified data. The model selects
            and phrases; it does not calculate.
          </li>
          <li>
            <span className="font-medium text-foreground">It cannot serve a declared allergen.</span>{" "}
            The food pool is filtered before generation and re-validated after it, in code.
          </li>
          <li>
            <span className="font-medium text-foreground">It stands aside for anything medical.</span>{" "}
            Pain, injury, medication and mental-health topics are escalated to you, and the client
            gets a holding line that says a human is coming — never advice.
          </li>
        </ul>
      </Section>

      <Section title="What we send to the model provider">
        <p>
          Coaching content: the plan context, the client&rsquo;s logged numbers, the message thread
          being answered, and the style profile built from your own uploaded work. We do not send
          payment details or authentication data. Requests go to Anthropic&rsquo;s API under a
          commercial agreement; prompts and outputs are not used to train their models.
        </p>
        <p>
          Clients are told, in plain words at onboarding, that an AI drafts messages their coach
          approves. We don&rsquo;t hide it, and you don&rsquo;t have to pretend otherwise.
        </p>
      </Section>

      <Section title="Access on our side">
        <p>
          Support access to a workspace requires a hardware security key, opens a recorded session
          with a stated reason, and shows what shape your org is in — not your clients&rsquo;
          message bodies or health records. Every such view is written to your own audit log and
          appears in your data export: you can see who looked and why.
        </p>
      </Section>

      <Section title="Taking it all with you">
        <p>
          A full export, as plain CSV, whenever you want it — and deletion that removes rows and
          files rather than setting a flag.{" "}
          <Link href="/docs/data" className={cn("underline underline-offset-4", focusRing)}>
            The format and the deletion timeline are published here.
          </Link>
        </p>
      </Section>

      <Section title="What we are not claiming">
        <p>
          We are not SOC 2 certified and will say so until we are. We are not a medical service,
          and nothing produced here is medical advice. If you need a signed data-processing
          agreement for your own compliance, ask — we&rsquo;ll tell you honestly whether we can meet
          it today.
        </p>
      </Section>
    </main>
  );
}
