// Phase 9.5 — the legal pages' shell.
//
// These are DRAFTS. The banner is not a disclaimer we hide at the bottom: a
// visitor deciding whether to trust us with client health data deserves to know
// at the top that a lawyer hasn't signed this off yet. It comes off when one has
// — that's a line item in the launch runbook, and until then these pages are
// noindex.

export function LegalDocument({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
      <div
        className="rounded-md border border-warning bg-warning/10 p-4 text-sm"
        role="note"
        data-testid="legal-draft-banner"
      >
        <span className="font-medium">Draft, pending legal review.</span> This document is written
        in plain language and has not yet been reviewed by a lawyer. It is published early so you
        can see what we intend to commit to — don&rsquo;t rely on it as a final agreement.
      </div>

      <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated{" "}
        {new Date(`${updated}T00:00:00Z`).toLocaleDateString("en-US", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })}
      </p>

      <div className="mt-10">{children}</div>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t py-6">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </section>
  );
}
