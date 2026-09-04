import Link from "next/link";

// Phase 9.1 — the public half of the promise. A trainer evaluating us should be
// able to read exactly what an export contains and how deletion works BEFORE
// signing up, without an account. Deliberately plain: no marketing frame.

export const metadata = {
  title: "Your data — supertrainer",
  description:
    "What a supertrainer data export contains, the format it uses, and how deletion works.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t py-8">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function DataDocsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">Your data is yours</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Everything you and your clients put into supertrainer can be exported in full, at any time,
        in a format that outlives us. Nothing here is a feature we can withdraw — it&rsquo;s how the
        product is built.
      </p>

      <Section title="What an export contains">
        <p>
          One ZIP file. Inside it, <span className="font-mono text-xs">data/</span> holds one CSV per
          table — clients, weigh-ins, meals, workouts, messages, payments, plans, and everything else
          your workspace has recorded. Tables with no rows are still included as empty files, so
          &ldquo;nothing there&rdquo; never looks like &ldquo;withheld&rdquo;.
        </p>
        <p>
          A <span className="font-mono text-xs">manifest.json</span> lists every table with its row
          count, so you can verify nothing was truncated, and a{" "}
          <span className="font-mono text-xs">README.txt</span> explains the layout.
        </p>
      </Section>

      <Section title="The format">
        <p>
          RFC-4180 CSV, UTF-8, header row first. Timestamps are ISO-8601 in UTC. JSON and array
          columns are embedded as JSON strings rather than flattened, so nothing is lost. Ids are
          stable across files, so you can rejoin the tables yourself in a spreadsheet, a database, or
          any other tool.
        </p>
      </Section>

      <Section title="Who can export">
        <p>
          A trainer can export their whole workspace from Settings → Data &amp; privacy, and can turn
          on a monthly archive that builds itself. A client can export their own record — everything
          they logged and every message they exchanged — from their portal. A client&rsquo;s export
          never contains another client&rsquo;s data.
        </p>
        <p>Download links are signed and expire after 24 hours. Exporting again is free and instant.</p>
      </Section>

      <Section title="Deletion">
        <p>
          Deletion is real deletion: rows and stored files, not a hidden flag. It runs on a 30-day
          delay so a mistake is recoverable, and you can cancel at any point inside that window.
        </p>
        <p>
          Before a workspace is erased we build a final archive, because we will not destroy the only
          copy of your work. When a client asks for deletion, their coach is told — nothing vanishes
          from a coaching relationship without both people knowing.
        </p>
        <p>
          One thing survives: an anonymised audit record that the deletion happened, with no personal
          data in it. Erasing that would erase the proof we did what you asked.
        </p>
      </Section>

      <p className="border-t pt-8 text-sm text-muted-foreground">
        <Link href="/security" className="underline underline-offset-4">
          How the data is stored and what the AI may do
        </Link>
      </p>
    </main>
  );
}
